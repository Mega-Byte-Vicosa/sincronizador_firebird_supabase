import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendBtzapMessage, validateBtzapConfig } from "../_shared/btzapClient.ts";
import type { BtzapConfig } from "../_shared/btzapClient.ts";
import { extrairDadosInstancia, montarEndpoint } from "../_shared/btzapInstance.ts";
import { extrairMensagemIdExterno } from "../_shared/btzapMessageStatus.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { processarCampanhasAutomatizadas } from "../_shared/campaignAutomations.ts";
import { normalizarTipoEnvio, processarEnvioWhatsApp } from "../_shared/whatsappSendGuard.ts";

const LIMITE_POR_EXECUCAO = 10;
const INTERVALO_ENTRE_ENVIOS_MS = 5_000;

interface MensagemProgramada {
  id_msg_programada: string;
  id_empresa: string;
  origem_modulo: string;
  id_origem: string | null;
  titulo: string;
  destinatario_nome: string | null;
  destinatario_telefone: string;
  mensagem: string;
  executar_em: string;
  status: string;
  enviado: boolean;
  ativo: boolean;
  tentativas_envio: number;
  tipo_envio?: string | null;
}

function normalizarTextoErro(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (valor instanceof Error) return valor.message;
  if (valor === null || valor === undefined) return "";
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}

function dataHoraProgramada(mensagem: MensagemProgramada) {
  return new Date(mensagem.executar_em);
}

function formatarCobrancaProgramadaParaEnvio(mensagem: MensagemProgramada) {
  const conteudoOriginal = String(mensagem.mensagem ?? "");
  if (mensagem.origem_modulo !== "CONTA_RECEBER" || !conteudoOriginal.trim()) return conteudoOriginal;

  const inicio = conteudoOriginal.trimStart().toLowerCase();
  if (inicio.startsWith("*mensagem programada:*") || inicio.startsWith("mensagem programada:")) {
    return conteudoOriginal;
  }

  return `*Mensagem programada:*\n\n${conteudoOriginal}`;
}

function normalizarTelefoneBrasil(valor: string | null | undefined) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function valorBooleano(valor: unknown) {
  if (typeof valor === "boolean") return valor;
  const texto = String(valor ?? "").trim().toLowerCase();
  if (["true", "1", "s", "sim", "yes"].includes(texto)) return true;
  if (["false", "0", "n", "nao", "não", "no"].includes(texto)) return false;
  return null;
}

async function validarConsentimentoCliente(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
) {
  if (mensagem.origem_modulo !== "CONTA_RECEBER" || !mensagem.id_origem) return null;

  const { data, error } = await supabase
    .from("firebird_contas_receber")
    .select("*")
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_ctarec", Number(mensagem.id_origem))
    .maybeSingle();

  if (error) throw new Error(`Não foi possível validar a autorização do cliente: ${error.message}`);
  if (!data) return null;

  const registro = data as Record<string, unknown>;
  const camposAutorizacao = ["aceita_whatsapp", "recebe_whatsapp", "opt_in_whatsapp", "whatsapp_autorizado"];
  const camposBloqueio = ["bloquear_whatsapp", "nao_enviar_whatsapp"];
  const idCliente = registro.id_cliente;

  if (idCliente !== null && idCliente !== undefined) {
    const { data: clienteData, error: clienteError } = await supabase
      .from("tab_cliente")
      .select("permite_cobranca_aviso, contato_restrito")
      .eq("id_empresa", mensagem.id_empresa)
      .eq("id_cliente", idCliente)
      .maybeSingle();

    if (clienteError) throw new Error(`Não foi possível validar as permissões do cliente: ${clienteError.message}`);

    const cliente = clienteData as { permite_cobranca_aviso?: boolean | null; contato_restrito?: boolean | null } | null;
    if (cliente?.contato_restrito) return "Cliente está com contato restrito.";
    if (cliente?.permite_cobranca_aviso === false) return "Cliente não permite cobranças e avisos.";
  }

  for (const campo of camposAutorizacao) {
    if (campo in registro && valorBooleano(registro[campo]) === false) {
      return "Cliente não autorizou recebimento de mensagens via WhatsApp.";
    }
  }

  for (const campo of camposBloqueio) {
    if (campo in registro && valorBooleano(registro[campo]) === true) {
      return "Cliente não autorizou recebimento de mensagens via WhatsApp.";
    }
  }

  // Se a integracao migrar para a API oficial da Meta, validar aqui a janela de 24 horas
  // e exigir um template aprovado para conversas iniciadas pela empresa fora dessa janela.
  return null;
}

async function validarInstanciaBtzap(config: BtzapConfig & { endpoint_status_instancia?: string | null }) {
  try {
    const endpoint = montarEndpoint(config.url_servidor!, config.endpoint_status_instancia, "/instance/status");
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json", token: config.token_instancia! },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return "Instância WhatsApp/BTZap desconectada ou indisponível.";

    const texto = await response.text();
    const payload = texto ? JSON.parse(texto) as Record<string, unknown> : {};
    const dados = extrairDadosInstancia(payload);
    const status = String(dados.status ?? "").trim().toLowerCase();
    const conectado = dados.connected || dados.loggedIn || ["connected", "open", "conectado"].includes(status);

    return conectado ? null : "Instância WhatsApp/BTZap desconectada ou indisponível.";
  } catch {
    return "Instância WhatsApp/BTZap desconectada ou indisponível.";
  }
}

async function registrarHistoricoMensagemProgramada(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
  status: "enviado" | "erro",
  erro: string | null,
  requestPayload: unknown,
  responsePayload: unknown,
) {
  let documento: string | null = null;

  if (mensagem.origem_modulo === "CONTA_RECEBER" && mensagem.id_origem) {
    const { data } = await supabase
      .from("firebird_contas_receber")
      .select("documento")
      .eq("id_empresa", mensagem.id_empresa)
      .eq("id_ctarec", Number(mensagem.id_origem))
      .maybeSingle();

    documento = data?.documento ?? null;
  }

  const agora = new Date().toISOString();
  const sucesso = status === "enviado";
  const historicoPayload = {
    id_empresa: mensagem.id_empresa,
    id_ctarec: mensagem.origem_modulo === "CONTA_RECEBER" && mensagem.id_origem ? Number(mensagem.id_origem) : null,
    cliente_nome: mensagem.destinatario_nome || null,
    cliente_telefone: mensagem.destinatario_telefone || null,
    origem: mensagem.origem_modulo === "CAMPANHA" ? "Campanha de Promocao" : "Mensagem Programada",
    documento,
    mensagem: mensagem.mensagem || null,
    status,
    tipo_envio: "envio",
    provider: "btzap",
    erro: sucesso ? null : erro,
    enviado_em: sucesso ? agora : null,
    mensagem_id_externo: extrairMensagemIdExterno(responsePayload),
    status_entrega: sucesso ? "ENVIADO_API" : "FALHOU",
    enviado_api_em: sucesso ? agora : null,
    falhou_em: sucesso ? null : agora,
    request_payload: requestPayload ?? null,
    response_payload: responsePayload ?? null,
    webhook_ultimo_evento: responsePayload ?? null,
    origem_envio: "MENSAGEM_PROGRAMADA",
    origem_modulo: mensagem.origem_modulo,
    id_msg_programada: mensagem.id_msg_programada,
    id_origem: mensagem.id_origem ? String(mensagem.id_origem) : null,
  };

  const { data: historicoExistente, error: buscaError } = await supabase
    .from("tab_whatsapp_envios")
    .select("id")
    .eq("id_empresa", mensagem.id_empresa)
    .eq("origem_modulo", mensagem.origem_modulo)
    .eq("id_msg_programada", mensagem.id_msg_programada)
    .maybeSingle();

  if (buscaError) throw buscaError;

  const { error } = historicoExistente?.id
    ? await supabase.from("tab_whatsapp_envios").update(historicoPayload).eq("id", historicoExistente.id)
    : await supabase.from("tab_whatsapp_envios").insert(historicoPayload);

  if (error) throw error;
}

async function atualizarMensagemComoEnviada(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
) {
  const { error } = await supabase
    .from("tb_msg_programadas")
    .update({
      status: "ENVIADO",
      enviado: true,
      data_hora_envio: new Date().toISOString(),
      erro_envio: null,
      processando_em: null,
    })
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_msg_programada", mensagem.id_msg_programada)
    .eq("status", "PROCESSANDO");

  if (error) throw error;
}

async function atualizarMensagemComErro(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
  erro: string,
) {
  const { error } = await supabase
    .from("tb_msg_programadas")
    .update({ status: "ERRO", enviado: false, erro_envio: erro, processando_em: null })
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_msg_programada", mensagem.id_msg_programada);

  if (error) throw error;
}

async function atualizarErroMensagemProgramada(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
  erro: string,
) {
  const { error } = await supabase
    .from("tb_msg_programadas")
    .update({ erro_envio: erro, processando_em: null })
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_msg_programada", mensagem.id_msg_programada);

  if (error) throw error;
}

async function atualizarClienteCampanha(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
  statusEnvio: "enviado" | "falhou",
  erro: string | null,
) {
  if (mensagem.origem_modulo !== "CAMPANHA" || !mensagem.id_origem) return;

  const telefoneMensagem = String(mensagem.destinatario_telefone ?? "").replace(/\D/g, "");
  const { data, error } = await supabase
    .from("tab_campanha_clientes")
    .select("id, telefone")
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_campanha", mensagem.id_origem);

  if (error) throw error;

  const cliente = (data ?? []).find((item: { telefone?: string | null }) =>
    String(item.telefone ?? "").replace(/\D/g, "") === telefoneMensagem,
  ) as { id: string } | undefined;

  if (!cliente?.id) return;

  const updatePayload: Record<string, unknown> = {
    status_envio: statusEnvio,
    erro_envio: erro,
  };

  if (statusEnvio === "enviado") {
    updatePayload.enviado_em = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("tab_campanha_clientes")
    .update(updatePayload)
    .eq("id", cliente.id)
    .eq("id_empresa", mensagem.id_empresa);

  if (updateError) throw updateError;
}

async function recalcularCampanha(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
) {
  if (mensagem.origem_modulo !== "CAMPANHA" || !mensagem.id_origem) return;

  const { data: destinatarios, error } = await supabase
    .from("tab_campanha_clientes")
    .select("status_envio")
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_campanha", mensagem.id_origem);

  if (error) throw error;

  const validos = (destinatarios ?? []).filter((item: { status_envio?: string | null }) =>
    !["ignorado", "cancelado"].includes(String(item.status_envio ?? "").toLowerCase()),
  );
  const totalDestinatarios = validos.length;
  const totalEnviados = validos.filter((item: { status_envio?: string | null }) => item.status_envio === "enviado").length;
  const totalFalhas = validos.filter((item: { status_envio?: string | null }) => item.status_envio === "falhou").length;
  const processados = totalEnviados + totalFalhas;
  const percentualEnvio = totalDestinatarios > 0 ? Math.round((processados / totalDestinatarios) * 10000) / 100 : 0;
  const agora = new Date().toISOString();
  const statusCampanha =
    processados === 0
      ? "programada"
      : processados < totalDestinatarios
        ? "enviando"
        : "concluida";

  const { data: campanhaAtual, error: campanhaError } = await supabase
    .from("tab_campanha")
    .select("data_hora_inicio_envio")
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id", mensagem.id_origem)
    .maybeSingle();

  if (campanhaError) throw campanhaError;

  const updatePayload: Record<string, unknown> = {
    total_destinatarios: totalDestinatarios,
    total_enviados: totalEnviados,
    total_falhas: totalFalhas,
    percentual_envio: percentualEnvio,
    status: statusCampanha,
  };

  if (processados > 0 && !campanhaAtual?.data_hora_inicio_envio) {
    updatePayload.data_hora_inicio_envio = agora;
  }

  if (totalDestinatarios > 0 && processados >= totalDestinatarios) {
    updatePayload.data_hora_fim_envio = agora;
  }

  const { error: updateError } = await supabase
    .from("tab_campanha")
    .update(updatePayload)
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id", mensagem.id_origem);

  if (updateError) throw updateError;
}

async function recuperarProcessamentosInterrompidos(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa?: string | null) {
  const limite = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let query = supabase
    .from("tb_msg_programadas")
    .update({
      status: "ERRO",
      enviado: false,
      erro_envio: "Processamento interrompido antes da conclusão do envio.",
      processando_em: null,
    })
    .eq("status", "PROCESSANDO")
    .lt("processando_em", limite);

  if (idEmpresa) query = query.eq("id_empresa", idEmpresa);

  const { error } = await query;
  if (error) throw error;
}

async function buscarMensagensAgendadasParaEnvio(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa?: string | null) {
  let query = supabase
    .from("tb_msg_programadas")
    .select("*")
    .eq("status", "AGENDADO")
    .eq("ativo", true)
    .eq("enviado", false)
    .lte("executar_em", new Date().toISOString())
    .order("executar_em", { ascending: true })
    .limit(LIMITE_POR_EXECUCAO);

  if (idEmpresa) query = query.eq("id_empresa", idEmpresa);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MensagemProgramada[];
}

async function reservarMensagemParaProcessamento(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  mensagem: MensagemProgramada,
) {
  const { data, error } = await supabase
    .from("tb_msg_programadas")
    .update({
      status: "PROCESSANDO",
      processando_em: new Date().toISOString(),
      ultima_tentativa_em: new Date().toISOString(),
      tentativas_envio: Number(mensagem.tentativas_envio ?? 0) + 1,
    })
    .eq("id_empresa", mensagem.id_empresa)
    .eq("id_msg_programada", mensagem.id_msg_programada)
    .eq("status", "AGENDADO")
    .eq("enviado", false)
    .eq("ativo", true)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as MensagemProgramada | null;
}

function validarMensagemParaEnvio(mensagem: MensagemProgramada) {
  const telefone = normalizarTelefoneBrasil(mensagem.destinatario_telefone);
  if (!telefone) return "Telefone do destinatário inválido ou não informado.";
  if (!String(mensagem.mensagem ?? "").trim()) return "Mensagem não informada.";
  if (!mensagem.executar_em || Number.isNaN(dataHoraProgramada(mensagem).getTime())) {
    return "Data/hora de execução não informada ou inválida.";
  }
  if (dataHoraProgramada(mensagem) > new Date()) return "A data/hora de execução ainda não foi atingida.";
  return null;
}

function obterErroRetornoApi(retorno: unknown) {
  const retornoTexto = normalizarTextoErro(retorno);
  if (!retornoTexto) return null;

  try {
    const resposta = typeof retorno === "object" && retorno !== null
      ? retorno as Record<string, unknown>
      : JSON.parse(retornoTexto) as Record<string, unknown>;
    if (resposta.success === false || resposta.error || resposta.erro) {
      const detalhe = resposta.message ?? resposta.error ?? resposta.erro;
      if (typeof detalhe === "string") return detalhe;
      if (detalhe !== undefined) return `API do WhatsApp retornou erro: ${JSON.stringify(detalhe)}`;
      return "API do WhatsApp não confirmou o envio.";
    }
  } catch {
    // Respostas textuais com HTTP de sucesso continuam válidas.
  }

  return null;
}

async function obterConfiguracao(supabase: ReturnType<typeof createSupabaseAdmin>, idEmpresa?: string | null) {
  if (!idEmpresa) {
    return { config: null, erro: "Empresa da mensagem não identificada." };
  }

  const { data, error } = await supabase
    .from("tab_btzap_config")
    .select("*")
    .eq("id_empresa", idEmpresa)
    .eq("ativo", true)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      config: null,
      erro: `Configuração de WhatsApp não encontrada para esta empresa. Acesse Configurações > WhatsApp/BTZap e cadastre/ative a instância. Detalhe: ${error.message}`,
    };
  }

  if (!data) {
    return {
      config: null,
      erro: "Configuração de WhatsApp não encontrada para esta empresa. Acesse Configurações > WhatsApp/BTZap e cadastre/ative a instância.",
    };
  }

  const erro = validateBtzapConfig(data as BtzapConfig);
  return { config: data as BtzapConfig, erro };
}

async function executarMensagensProgramadas(idEmpresa?: string | null) {
  const supabase = createSupabaseAdmin();
  console.log("[Mensagens Programadas] Iniciando processamento.");
  await recuperarProcessamentosInterrompidos(supabase, idEmpresa);

  const mensagens = await buscarMensagensAgendadasParaEnvio(supabase, idEmpresa);
  console.log(`[Mensagens Programadas] Total encontradas para envio: ${mensagens.length}.`);

  const resultados = [];

  for (const mensagemEncontrada of mensagens) {
    if (resultados.length > 0) await aguardar(INTERVALO_ENTRE_ENVIOS_MS);

    const mensagem = await reservarMensagemParaProcessamento(supabase, mensagemEncontrada);
    if (!mensagem) continue;
    const conteudoParaEnvio = formatarCobrancaProgramadaParaEnvio(mensagem);
    let requestPayload: { phone: string | null; message: string } | null = null;
    let responsePayload: unknown = null;

    try {
      console.log(`[Mensagens Programadas] Processando ID: ${mensagem.id_msg_programada}.`);
      console.log(`[Mensagens Programadas] Executar em: ${mensagem.executar_em}.`);
      console.log("[Mensagens Programadas] Validando envio.");

      const erroValidacao = validarMensagemParaEnvio(mensagem);
      if (erroValidacao) throw new Error(erroValidacao);

      const { config, erro: erroConfiguracao } = await obterConfiguracao(supabase, mensagem.id_empresa);
      if (erroConfiguracao || !config) throw new Error(erroConfiguracao ?? "Configuração de WhatsApp não encontrada para esta empresa.");

      const erroInstancia = await validarInstanciaBtzap(config as BtzapConfig & { endpoint_status_instancia?: string | null });
      if (erroInstancia) throw new Error(erroInstancia);

      const erroConsentimento = await validarConsentimentoCliente(supabase, mensagem);
      if (erroConsentimento) throw new Error(erroConsentimento);

      const telefone = normalizarTelefoneBrasil(mensagem.destinatario_telefone);
      if (!telefone) throw new Error("Telefone do destinatário inválido ou não informado.");

      console.log("[Mensagens Programadas] Telefone validado. Enviando mensagem via BTZap.");
      requestPayload = {
        phone: telefone,
        message: conteudoParaEnvio,
      };
      const categoriaEnvio = normalizarTipoEnvio(
        mensagem.tipo_envio || (mensagem.origem_modulo === "CONTA_RECEBER" ? "cobranca" : mensagem.origem_modulo === "CAMPANHA" ? "campanha_promocao" : "mensagem_programada"),
      );
      const envioProtegido = await processarEnvioWhatsApp({
        supabase,
        empresaId: mensagem.id_empresa,
        tipoEnvio: categoriaEnvio,
        telefone,
        mensagem: conteudoParaEnvio,
        origem: mensagem.origem_modulo,
        referenciaId: mensagem.id_origem || mensagem.id_msg_programada,
        tentativaAtual: Number(mensagem.tentativas_envio ?? 0),
        enviarBtzap: async () => {
          const result = await sendBtzapMessage(config, requestPayload!);
          if (!result.success) throw new Error(result.message);
          return "retorno" in result ? result.retorno ?? null : result;
        },
      });
      if (!envioProtegido.enviado) {
        const proxima = envioProtegido.proximaTentativaEm || new Date(Date.now() + 60_000).toISOString();
        const { error: reagendarError } = await supabase.from("tb_msg_programadas").update({
          status: envioProtegido.temporario ? "AGENDADO" : "ERRO",
          enviado: false,
          erro_envio: envioProtegido.motivo,
          motivo_bloqueio: envioProtegido.motivo,
          proxima_tentativa_em: proxima,
          executar_em: envioProtegido.temporario ? proxima : mensagem.executar_em,
          processando_em: null,
        }).eq("id_empresa", mensagem.id_empresa).eq("id_msg_programada", mensagem.id_msg_programada);
        if (reagendarError) throw reagendarError;
        resultados.push({ id_msg_programada: mensagem.id_msg_programada, success: false, bloqueado: true, motivo: envioProtegido.motivo, proxima_tentativa_em: proxima });
        continue;
      }
      responsePayload = envioProtegido.retornoBtzap;
      const erroRetornoApi = obterErroRetornoApi(responsePayload);
      if (erroRetornoApi) throw new Error(erroRetornoApi);

      await atualizarMensagemComoEnviada(supabase, mensagem);
      await atualizarClienteCampanha(supabase, mensagem, "enviado", null);
      await recalcularCampanha(supabase, mensagem);

      let erroHistorico: string | null = null;
      try {
        // O histórico de sucesso já foi gravado pelo guard central.
      } catch (error) {
        erroHistorico = normalizarTextoErro(error);
        await atualizarErroMensagemProgramada(
          supabase,
          mensagem,
          `Envio concluído. | Falha ao registrar histórico: ${erroHistorico}`,
        );
        console.error(`[Mensagens Programadas] Envio concluído, mas o histórico falhou: ${erroHistorico}`);
      }

      console.log("[Mensagens Programadas] Envio concluído com sucesso.");
      resultados.push({ id_msg_programada: mensagem.id_msg_programada, success: true, erro_historico: erroHistorico });
    } catch (error) {
      const errorMessage = normalizarTextoErro(error);
      console.error(`[Mensagens Programadas] Erro no envio: ${errorMessage}`);

      try {
        await atualizarMensagemComErro(supabase, mensagem, errorMessage);
        console.log("[Mensagens Programadas] Status atualizado para ERRO.");
      } catch (updateError) {
        const detail = updateError instanceof Error ? updateError.message : String(updateError);
        console.error(`[Mensagens Programadas] Falha ao atualizar status para ERRO: ${detail}`);
        resultados.push({ id_msg_programada: mensagem.id_msg_programada, success: false, error: errorMessage, update_error: detail });
        continue;
      }

      try {
        if (!requestPayload) {
          requestPayload = {
            phone: normalizarTelefoneBrasil(mensagem.destinatario_telefone),
            message: conteudoParaEnvio,
          };
        }
        await registrarHistoricoMensagemProgramada(supabase, mensagem, "erro", errorMessage, requestPayload, responsePayload);
      } catch (historyError) {
        const erroHistorico = normalizarTextoErro(historyError);
        const erroComHistorico = `${errorMessage} | Falha ao registrar histórico: ${erroHistorico}`;
        await atualizarErroMensagemProgramada(supabase, mensagem, erroComHistorico);
        console.error(`[Mensagens Programadas] Falha ao registrar histórico de erro: ${erroHistorico}`);
      }

      try {
        await atualizarClienteCampanha(supabase, mensagem, "falhou", errorMessage);
        await recalcularCampanha(supabase, mensagem);
      } catch (campaignError) {
        console.error(`[Mensagens Programadas] Falha ao atualizar progresso da campanha: ${normalizarTextoErro(campaignError)}`);
      }

      resultados.push({ id_msg_programada: mensagem.id_msg_programada, success: false, error: errorMessage });
    }
  }

  return { processadas: resultados.length, resultados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);

  try {
    const body = await req.json().catch(() => ({})) as { id_empresa?: string };
    const idEmpresa = body.id_empresa?.trim() || null;
    const mensagensProgramadas = await executarMensagensProgramadas(idEmpresa);
    const automacoes = await processarCampanhasAutomatizadas(createSupabaseAdmin(), idEmpresa);
    return jsonResponse({
      success: true,
      processadas: mensagensProgramadas.processadas + automacoes.envios,
      mensagens_programadas: mensagensProgramadas,
      automacoes,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return jsonResponse({ success: false, message: "Não foi possível processar mensagens programadas.", error: errorMessage }, 500);
  }
});
