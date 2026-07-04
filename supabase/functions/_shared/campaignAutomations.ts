import { sendBtzapMessage, validateBtzapConfig, type BtzapConfig } from "./btzapClient.ts";
import { extrairDadosInstancia, montarEndpoint } from "./btzapInstance.ts";
import { extrairMensagemIdExterno } from "./btzapMessageStatus.ts";
import { createSupabaseAdmin } from "./supabaseAdmin.ts";

const LIMITE_ENVIOS_AUTOMACAO = 5;
const INTERVALO_MONITORAMENTO_MS = 10 * 60 * 1000;
const TIME_ZONE = "America/Sao_Paulo";

interface CampanhaAutomatizada {
  id: string;
  id_empresa: string;
  nome: string;
  mensagem: string;
  tipo_automacao: string;
  automacao_dias_carencia: number | null;
  automacao_dias_antes_vencimento: number | null;
  automacao_dias_sem_compra: number | null;
  automacao_dias_pos_compra: number | null;
  empresa_destino: string | null;
  aos_cuidados: string | null;
  campanha_continua: boolean;
  termina_em: string | null;
  data_hora_agendamento: string | null;
  automacao_proxima_execucao_em: string | null;
  automacao_total_envios: number;
  automacao_total_erros: number;
}

interface ClienteAutomacao {
  id_cliente: number | null;
  nome: string | null;
  dt_nascto: string | null;
  dt_pricomp: string | null;
  dt_ultcomp: string | null;
  ddd_celul: string | null;
  fone_celul: string | null;
  permite_campanha: boolean | null;
  contato_restrito: boolean | null;
}

interface ContaAutomacao {
  id_ctarec: number;
  id_cliente: number | null;
  documento: string | null;
  historico: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  vendedor_nome: string | null;
  dt_emissao: string | null;
  dt_vencto: string | null;
  dt_baixa: string | null;
  vlr_ctarec: number | null;
  vlr_receb: number | null;
}

interface DataCivil { ano: number; mes: number; dia: number }

function dataCivilAgora(): DataCivil {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { ano: value("year"), mes: value("month"), dia: value("day") };
}

function parseDataCivil(value: string | null | undefined): DataCivil | null {
  if (!value) return null;
  const [ano, mes, dia] = value.split("T")[0].split("-").map(Number);
  return ano && mes && dia ? { ano, mes, dia } : null;
}

function chaveData(data: DataCivil) {
  return `${data.ano}-${String(data.mes).padStart(2, "0")}-${String(data.dia).padStart(2, "0")}`;
}

function deslocarDias(data: DataCivil, dias: number): DataCivil {
  const date = new Date(Date.UTC(data.ano, data.mes - 1, data.dia));
  date.setUTCDate(date.getUTCDate() + dias);
  return { ano: date.getUTCFullYear(), mes: date.getUTCMonth() + 1, dia: date.getUTCDate() };
}

function compararDatas(a: DataCivil, b: DataCivil) {
  return chaveData(a).localeCompare(chaveData(b));
}

function clienteAtendeRegra(cliente: ClienteAutomacao, campanha: CampanhaAutomatizada, hoje: DataCivil) {
  const tipo = campanha.tipo_automacao;
  const nascimento = parseDataCivil(cliente.dt_nascto);
  const ultimaCompra = parseDataCivil(cliente.dt_ultcomp);
  if (tipo === "aniversariantes_mes") return Boolean(nascimento && nascimento.mes === hoje.mes);
  if (tipo === "aniversariantes_dia") return Boolean(nascimento && nascimento.mes === hoje.mes && nascimento.dia === hoje.dia);
  if (tipo === "clientes_sem_comprar_dias") {
    const dias = Number(campanha.automacao_dias_sem_compra ?? 0);
    return dias >= 1 && Boolean(ultimaCompra && compararDatas(ultimaCompra, deslocarDias(hoje, -dias)) <= 0);
  }
  if (tipo === "pos_compra_dias") {
    const dias = Number(campanha.automacao_dias_pos_compra ?? 0);
    return dias >= 1 && Boolean(ultimaCompra && compararDatas(ultimaCompra, deslocarDias(hoje, -dias)) === 0);
  }
  return false;
}

const TIPOS_COBRANCA = new Set(["contas_a_vencer_dias", "contas_vencendo_hoje", "contas_vencidas_com_carencia"]);

function isAutomacaoCobranca(tipo: string) {
  return TIPOS_COBRANCA.has(tipo);
}

function contaEmAberto(conta: ContaAutomacao) {
  return !conta.dt_baixa && Number(conta.vlr_receb ?? 0) <= 0;
}

function contaAtendeRegra(conta: ContaAutomacao, campanha: CampanhaAutomatizada, hoje: DataCivil) {
  if (!contaEmAberto(conta)) return false;
  const vencimento = parseDataCivil(conta.dt_vencto);
  if (!vencimento) return false;
  if (campanha.tipo_automacao === "contas_a_vencer_dias") {
    const dias = Number(campanha.automacao_dias_antes_vencimento ?? 0);
    return dias >= 1 && compararDatas(vencimento, deslocarDias(hoje, dias)) === 0;
  }
  if (campanha.tipo_automacao === "contas_vencendo_hoje") return compararDatas(vencimento, hoje) === 0;
  if (campanha.tipo_automacao === "contas_vencidas_com_carencia") {
    const dias = Number(campanha.automacao_dias_carencia ?? 0);
    return dias >= 1 && compararDatas(vencimento, hoje) < 0 && compararDatas(deslocarDias(vencimento, dias), hoje) >= 0;
  }
  return false;
}

function telefoneContaBrasil(conta: ContaAutomacao) {
  const digitos = String(conta.cliente_telefone ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

function formatarMoeda(value: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
}

function aplicarVariaveisConta(campanha: CampanhaAutomatizada, conta: ContaAutomacao, hoje: DataCivil) {
  const nome = conta.cliente_nome ?? "";
  return String(campanha.mensagem ?? "")
    .replace(/\{\{\s*nome\s*\}\}/gi, nome)
    .replace(/\{\{\s*cliente\s*\}\}/gi, nome)
    .replace(/\{\{\s*empresa\s*\}\}/gi, campanha.empresa_destino ?? "")
    .replace(/\{\{\s*aos_cuidados\s*\}\}/gi, campanha.aos_cuidados ?? "")
    .replace(/\{\{\s*documento\s*\}\}/gi, conta.documento ?? "")
    .replace(/\{\{\s*vencimento\s*\}\}/gi, formatarData(conta.dt_vencto))
    .replace(/\{\{\s*valor\s*\}\}/gi, formatarMoeda(conta.vlr_ctarec))
    .replace(/\{\{\s*data_atual\s*\}\}/gi, formatarData(chaveData(hoje)));
}

function telefoneBrasil(cliente: ClienteAutomacao) {
  const local = `${cliente.ddd_celul ?? ""}${cliente.fone_celul ?? ""}`.replace(/\D/g, "");
  if (local.length === 10 || local.length === 11) return `55${local}`;
  if ((local.length === 12 || local.length === 13) && local.startsWith("55")) return local;
  return null;
}

function formatarData(value: string | null) {
  const data = parseDataCivil(value);
  return data ? `${String(data.dia).padStart(2, "0")}/${String(data.mes).padStart(2, "0")}/${data.ano}` : "";
}

function aplicarVariaveis(campanha: CampanhaAutomatizada, cliente: ClienteAutomacao, hoje: DataCivil) {
  const nome = cliente.nome ?? "";
  return String(campanha.mensagem ?? "")
    .replace(/\{\{\s*nome\s*\}\}/gi, nome)
    .replace(/\{\{\s*cliente\s*\}\}/gi, nome)
    .replace(/\{\{\s*empresa\s*\}\}/gi, campanha.empresa_destino ?? "")
    .replace(/\{\{\s*aos_cuidados\s*\}\}/gi, campanha.aos_cuidados ?? "")
    .replace(/\{\{\s*documento\s*\}\}/gi, String(cliente.id_cliente ?? ""))
    .replace(/\{\{\s*data_atual\s*\}\}/gi, formatarData(chaveData(hoje)))
    .replace(/\{\{\s*ultima_compra\s*\}\}/gi, formatarData(cliente.dt_ultcomp))
    .replace(/\{\{\s*primeira_compra\s*\}\}/gi, formatarData(cliente.dt_pricomp));
}

function dataCivilTimestamp(value: string | null) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { ano: get("year"), mes: get("month"), dia: get("day") };
}

async function jaEnviadoNoPeriodo(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  campanha: CampanhaAutomatizada,
  cliente: ClienteAutomacao,
  telefone: string,
  hoje: DataCivil,
) {
  const desde = campanha.tipo_automacao === "clientes_sem_comprar_dias"
    ? new Date(Date.now() - Number(campanha.automacao_dias_sem_compra ?? 30) * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("tab_whatsapp_envios")
    .select("criado_em, enviado_em, request_payload")
    .eq("id_empresa", campanha.id_empresa)
    .eq("origem_modulo", "AUTOMACAO")
    .eq("origem_envio", "CAMPANHA_AUTOMATIZADA")
    .eq("id_origem", campanha.id)
    .eq("cliente_telefone", telefone)
    .eq("status", "enviado")
    .gte("criado_em", desde);
  if (error) throw error;

  return (data ?? []).some((envio: { criado_em?: string | null; enviado_em?: string | null; request_payload?: Record<string, unknown> | null }) => {
    if (campanha.tipo_automacao === "pos_compra_dias") {
      return envio.request_payload?.ciclo_automacao === cliente.dt_ultcomp?.split("T")[0];
    }
    if (campanha.tipo_automacao === "clientes_sem_comprar_dias") return true;
    const dataEnvio = dataCivilTimestamp(envio.enviado_em ?? envio.criado_em ?? null);
    if (!dataEnvio) return false;
    if (campanha.tipo_automacao === "aniversariantes_mes") return dataEnvio.ano === hoje.ano && dataEnvio.mes === hoje.mes;
    return compararDatas(dataEnvio, hoje) === 0;
  });
}

async function contaJaRecebeuAutomacao(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  campanha: CampanhaAutomatizada,
  conta: ContaAutomacao,
) {
  const { data, error } = await supabase.from("tab_whatsapp_envios")
    .select("id")
    .eq("id_empresa", campanha.id_empresa)
    .eq("origem_modulo", "AUTOMACAO")
    .eq("origem_envio", "CAMPANHA_AUTOMATIZADA")
    .eq("id_origem", campanha.id)
    .eq("id_ctarec", conta.id_ctarec)
    .eq("status", "enviado")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function obterConfig(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa: string) {
  const { data, error } = await supabase.from("tab_btzap_config").select("*")
    .eq("id_empresa", idEmpresa).eq("ativo", true).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new Error("Configuração BTZap ativa não encontrada para a empresa.");
  const erro = validateBtzapConfig(data as BtzapConfig);
  if (erro) throw new Error(erro);
  return data as BtzapConfig & { endpoint_status_instancia?: string | null };
}

async function validarInstancia(config: BtzapConfig & { endpoint_status_instancia?: string | null }) {
  const endpoint = montarEndpoint(config.url_servidor!, config.endpoint_status_instancia, "/instance/status");
  const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json", token: config.token_instancia! }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Instância WhatsApp/BTZap desconectada ou indisponível.");
  const text = await response.text();
  const dados = extrairDadosInstancia(text ? JSON.parse(text) as Record<string, unknown> : {});
  const status = String(dados.status ?? "").toLowerCase();
  if (!(dados.connected || dados.loggedIn || ["connected", "open", "conectado"].includes(status))) {
    throw new Error("Instância WhatsApp/BTZap desconectada ou indisponível.");
  }
}

async function registrarHistorico(
  supabase: ReturnType<typeof createSupabaseAdmin>, campanha: CampanhaAutomatizada, cliente: ClienteAutomacao,
  telefone: string, mensagem: string, status: "enviado" | "erro", erro: string | null,
  requestPayload: Record<string, unknown>, responsePayload: unknown,
) {
  const agora = new Date().toISOString();
  const sucesso = status === "enviado";
  const { error } = await supabase.from("tab_whatsapp_envios").insert({
    id_empresa: campanha.id_empresa, cliente_nome: cliente.nome, cliente_telefone: telefone,
    origem: "Automação", mensagem, status, tipo_envio: "envio", provider: "btzap", erro,
    enviado_em: sucesso ? agora : null, mensagem_id_externo: extrairMensagemIdExterno(responsePayload),
    status_entrega: sucesso ? "ENVIADO_API" : "FALHOU", enviado_api_em: sucesso ? agora : null,
    falhou_em: sucesso ? null : agora, request_payload: requestPayload, response_payload: responsePayload,
    webhook_ultimo_evento: responsePayload, origem_envio: "CAMPANHA_AUTOMATIZADA",
    origem_modulo: "AUTOMACAO", id_origem: campanha.id,
  });
  if (error) throw error;
}

async function registrarHistoricoConta(
  supabase: ReturnType<typeof createSupabaseAdmin>, campanha: CampanhaAutomatizada, conta: ContaAutomacao,
  telefone: string, mensagem: string, status: "enviado" | "erro", erro: string | null,
  requestPayload: Record<string, unknown>, responsePayload: unknown,
) {
  const agora = new Date().toISOString();
  const sucesso = status === "enviado";
  const { error } = await supabase.from("tab_whatsapp_envios").insert({
    id_empresa: campanha.id_empresa,
    id_ctarec: conta.id_ctarec,
    cliente_nome: conta.cliente_nome,
    cliente_telefone: telefone,
    origem: "Automação de Cobrança",
    documento: conta.documento,
    mensagem,
    status,
    tipo_envio: "envio",
    provider: "btzap",
    erro,
    enviado_em: sucesso ? agora : null,
    mensagem_id_externo: extrairMensagemIdExterno(responsePayload),
    status_entrega: sucesso ? "ENVIADO_API" : "FALHOU",
    enviado_api_em: sucesso ? agora : null,
    falhou_em: sucesso ? null : agora,
    request_payload: requestPayload,
    response_payload: responsePayload,
    webhook_ultimo_evento: responsePayload,
    origem_envio: "CAMPANHA_AUTOMATIZADA",
    origem_modulo: "AUTOMACAO",
    id_origem: campanha.id,
  });
  if (error) throw error;
}

export async function processarCampanhasAutomatizadas(
  supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa?: string | null,
) {
  let query = supabase.from("tab_campanha").select("id, id_empresa, nome, mensagem, tipo_automacao, automacao_dias_carencia, automacao_dias_antes_vencimento, automacao_dias_sem_compra, automacao_dias_pos_compra, empresa_destino, aos_cuidados, campanha_continua, termina_em, data_hora_agendamento, automacao_proxima_execucao_em, automacao_total_envios, automacao_total_erros")
    .eq("automatizada", true).eq("publico_dinamico", true).eq("automacao_status", "ativa").eq("tipo_comunicacao", "whatsapp")
    .order("criado_em", { ascending: true }).limit(20);
  if (idEmpresa) query = query.eq("id_empresa", idEmpresa);
  const { data, error } = await query;
  if (error) throw error;

  const hoje = dataCivilAgora();
  const resultados: Array<Record<string, unknown>> = [];
  let enviosNoCiclo = 0;

  for (const raw of data ?? []) {
    const campanha = raw as CampanhaAutomatizada;
    const agora = new Date();
    if (campanha.data_hora_agendamento && new Date(campanha.data_hora_agendamento) > agora) continue;
    if (!campanha.campanha_continua && campanha.termina_em && new Date(campanha.termina_em) <= agora) {
      await supabase.from("tab_campanha").update({ automacao_status: "encerrada" }).eq("id", campanha.id).eq("id_empresa", campanha.id_empresa);
      continue;
    }
    if (campanha.automacao_proxima_execucao_em && new Date(campanha.automacao_proxima_execucao_em) > agora) continue;

    if (isAutomacaoCobranca(campanha.tipo_automacao)) {
      let enviados = 0;
      let erros = 0;
      try {
        const [contasResult, clientesResult] = await Promise.all([
          supabase.from("firebird_contas_receber")
            .select("id_ctarec, id_cliente, documento, historico, cliente_nome, cliente_telefone, vendedor_nome, dt_emissao, dt_vencto, dt_baixa, vlr_ctarec, vlr_receb")
            .eq("id_empresa", campanha.id_empresa),
          supabase.from("tab_cliente")
            .select("id_cliente, permite_campanha, contato_restrito")
            .eq("id_empresa", campanha.id_empresa),
        ]);
        if (contasResult.error) throw contasResult.error;
        if (clientesResult.error) throw clientesResult.error;

        const permissoes = new Map((clientesResult.data ?? []).map((cliente) => [Number(cliente.id_cliente), cliente]));
        const elegiveis = (contasResult.data ?? [])
          .filter((item) => contaAtendeRegra(item as ContaAutomacao, campanha, hoje)) as ContaAutomacao[];
        const aptos = elegiveis.filter((conta) => {
          const cliente = conta.id_cliente === null ? null : permissoes.get(Number(conta.id_cliente));
          return Boolean(telefoneContaBrasil(conta) && cliente?.contato_restrito !== true && cliente?.permite_campanha === true);
        });

        const config = await obterConfig(supabase, campanha.id_empresa);
        await validarInstancia(config);
        for (const conta of aptos) {
          if (enviosNoCiclo >= LIMITE_ENVIOS_AUTOMACAO) break;
          if (await contaJaRecebeuAutomacao(supabase, campanha, conta)) continue;
          const telefone = telefoneContaBrasil(conta)!;
          const mensagem = aplicarVariaveisConta(campanha, conta, hoje);
          const requestPayload = {
            phone: telefone,
            message: mensagem,
            id_ctarec: conta.id_ctarec,
            documento: conta.documento,
            dt_vencto: conta.dt_vencto,
            vlr_ctarec: conta.vlr_ctarec,
            tipo_automacao: campanha.tipo_automacao,
          };
          let responsePayload: unknown = null;
          try {
            const result = await sendBtzapMessage(config, { phone: telefone, message: mensagem });
            responsePayload = "retorno" in result ? result.retorno ?? null : null;
            if (!result.success) throw new Error(result.message);
            await registrarHistoricoConta(supabase, campanha, conta, telefone, mensagem, "enviado", null, requestPayload, responsePayload);
            enviados++;
          } catch (sendError) {
            const message = sendError instanceof Error ? sendError.message : String(sendError);
            await registrarHistoricoConta(supabase, campanha, conta, telefone, mensagem, "erro", message, requestPayload, responsePayload);
            erros++;
          }
          enviosNoCiclo++;
        }

        await supabase.from("tab_campanha").update({
          automacao_ultima_execucao_em: new Date().toISOString(),
          automacao_proxima_execucao_em: new Date(Date.now() + INTERVALO_MONITORAMENTO_MS).toISOString(),
          automacao_total_envios: Number(campanha.automacao_total_envios ?? 0) + enviados,
          automacao_total_erros: Number(campanha.automacao_total_erros ?? 0) + erros,
        }).eq("id", campanha.id).eq("id_empresa", campanha.id_empresa);
        resultados.push({ id_campanha: campanha.id, success: true, encontrados: elegiveis.length, aptos: aptos.length, enviados, erros });
      } catch (campaignError) {
        const message = campaignError instanceof Error ? campaignError.message : String(campaignError);
        await supabase.from("tab_campanha").update({ automacao_status: "erro", automacao_total_erros: Number(campanha.automacao_total_erros ?? 0) + 1 }).eq("id", campanha.id).eq("id_empresa", campanha.id_empresa);
        resultados.push({ id_campanha: campanha.id, success: false, error: message });
      }
      if (enviosNoCiclo >= LIMITE_ENVIOS_AUTOMACAO) break;
      continue;
    }

    const { data: clientes, error: clientesError } = await supabase.from("tab_cliente")
      .select("id_cliente, nome, dt_nascto, dt_pricomp, dt_ultcomp, ddd_celul, fone_celul, permite_campanha, contato_restrito")
      .eq("id_empresa", campanha.id_empresa);
    if (clientesError) throw clientesError;
    const elegiveis = (clientes ?? []).filter((item) => clienteAtendeRegra(item as ClienteAutomacao, campanha, hoje)) as ClienteAutomacao[];
    const aptos = elegiveis.filter((cliente) => telefoneBrasil(cliente) && cliente.contato_restrito !== true && cliente.permite_campanha === true);
    let enviados = 0;
    let erros = 0;

    try {
      const config = await obterConfig(supabase, campanha.id_empresa);
      await validarInstancia(config);
      for (const cliente of aptos) {
        if (enviosNoCiclo >= LIMITE_ENVIOS_AUTOMACAO) break;
        const telefone = telefoneBrasil(cliente)!;
        if (await jaEnviadoNoPeriodo(supabase, campanha, cliente, telefone, hoje)) continue;
        const mensagem = aplicarVariaveis(campanha, cliente, hoje);
        const requestPayload = { phone: telefone, message: mensagem, ciclo_automacao: cliente.dt_ultcomp?.split("T")[0] ?? chaveData(hoje) };
        let responsePayload: unknown = null;
        try {
          const result = await sendBtzapMessage(config, { phone: telefone, message: mensagem });
          responsePayload = "retorno" in result ? result.retorno ?? null : null;
          if (!result.success) throw new Error(result.message);
          await registrarHistorico(supabase, campanha, cliente, telefone, mensagem, "enviado", null, requestPayload, responsePayload);
          enviados++;
        } catch (sendError) {
          const message = sendError instanceof Error ? sendError.message : String(sendError);
          await registrarHistorico(supabase, campanha, cliente, telefone, mensagem, "erro", message, requestPayload, responsePayload);
          erros++;
        }
        enviosNoCiclo++;
      }

      const proxima = new Date(Date.now() + INTERVALO_MONITORAMENTO_MS).toISOString();
      await supabase.from("tab_campanha").update({
        automacao_ultima_execucao_em: new Date().toISOString(), automacao_proxima_execucao_em: proxima,
        automacao_total_envios: Number(campanha.automacao_total_envios ?? 0) + enviados,
        automacao_total_erros: Number(campanha.automacao_total_erros ?? 0) + erros,
      }).eq("id", campanha.id).eq("id_empresa", campanha.id_empresa);
      resultados.push({ id_campanha: campanha.id, success: true, encontrados: elegiveis.length, aptos: aptos.length, enviados, erros });
    } catch (campaignError) {
      const message = campaignError instanceof Error ? campaignError.message : String(campaignError);
      await supabase.from("tab_campanha").update({ automacao_status: "erro", automacao_total_erros: Number(campanha.automacao_total_erros ?? 0) + 1 }).eq("id", campanha.id).eq("id_empresa", campanha.id_empresa);
      resultados.push({ id_campanha: campanha.id, success: false, error: message });
    }
    if (enviosNoCiclo >= LIMITE_ENVIOS_AUTOMACAO) break;
  }

  return { processadas: resultados.length, envios: enviosNoCiclo, resultados };
}
