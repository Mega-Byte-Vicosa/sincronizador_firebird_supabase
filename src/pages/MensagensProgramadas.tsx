import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";
import type {
  MensagemProgramada,
  OrigemModuloMensagemProgramada,
  StatusMensagemProgramada,
  TipoAgendamentoMensagemProgramada,
  TipoRepeticaoMensagemProgramada,
} from "../types/mensagemProgramada";
import type { ContaReceber } from "../types/contasReceber";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { montarMensagemCobrancaWhatsapp } from "../utils/mensagemCobranca";
import { useAuth } from "../auth/AuthContext";
import type { ModeloMensagem } from "../types/modeloMensagem";
import {
  buscarTodosModelosMensagemAtivos,
  getChaveModeloMensagem,
  montarMensagemModeloContaReceber,
  selecionarModeloPadraoContaReceber,
} from "../utils/modelosMensagem";

interface FiltrosMensagensProgramadas {
  busca: string;
  dataInicial: string;
  dataFinal: string;
  origemModulo: string;
  tipoAgendamento: string;
  status: string;
}

interface FormMensagemProgramada {
  id_msg_programada: string | null;
  origem_modulo: OrigemModuloMensagemProgramada;
  id_origem: string;
  titulo: string;
  descricao: string;
  destinatario_nome: string;
  destinatario_telefone: string;
  mensagem: string;
  tipo_agendamento: TipoAgendamentoMensagemProgramada;
  data_envio: string;
  hora_envio: string;
  repetir: boolean;
  tipo_repeticao: TipoRepeticaoMensagemProgramada | "";
  intervalo_repeticao: string;
  quantidade_repeticoes: string;
  data_fim_repeticao: string;
  dias_semana: number[];
  meses_ano: number[];
  status: StatusMensagemProgramada;
  ativo: boolean;
  modelo_id: string | null;
}

interface DataProgramada {
  data: string;
  hora: string;
}

const diasSemana = [
  ["Dom", "Domingo"],
  ["Seg", "Segunda"],
  ["Ter", "Terça"],
  ["Qua", "Quarta"],
  ["Qui", "Quinta"],
  ["Sex", "Sexta"],
  ["Sáb", "Sábado"],
] as const;

const mesesAno = [
  ["Jan", "Janeiro"],
  ["Fev", "Fevereiro"],
  ["Mar", "Março"],
  ["Abr", "Abril"],
  ["Mai", "Maio"],
  ["Jun", "Junho"],
  ["Jul", "Julho"],
  ["Ago", "Agosto"],
  ["Set", "Setembro"],
  ["Out", "Outubro"],
  ["Nov", "Novembro"],
  ["Dez", "Dezembro"],
] as const;

function intervaloMesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const formatar = (data: Date) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

  return {
    inicio: formatar(new Date(ano, mes, 1)),
    fim: formatar(new Date(ano, mes + 1, 0)),
  };
}

type StatusVisualMensagemProgramada = "agendada" | "pendente" | "enviada" | "erro";
type FiltroCardMensagem = "padrao" | "todos" | "PENDENTE" | "AGENDADO" | "ENVIADO" | "ERRO";

const mesAtual = intervaloMesAtual();

const filtrosIniciais: FiltrosMensagensProgramadas = {
  busca: "",
  dataInicial: mesAtual.inicio,
  dataFinal: mesAtual.fim,
  origemModulo: "todos",
  tipoAgendamento: "todos",
  status: "todos",
};

const moedaFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function hojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarMoeda(valor: number | null | undefined) {
  return moedaFormatter.format(Number(valor ?? 0));
}

function formatarData(valor: string | null | undefined) {
  if (!valor) return "-";

  const [data] = valor.split("T");
  const partes = data.split("-");

  if (partes.length !== 3) return "-";

  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function montarExecutarEm(data: string, hora: string) {
  const horaNormalizada = hora.length === 5 ? `${hora}:00` : hora;
  return new Date(`${data}T${horaNormalizada}`).toISOString();
}

function formInicial(): FormMensagemProgramada {
  return {
    id_msg_programada: null,
    origem_modulo: "CONTA_RECEBER",
    id_origem: "",
    titulo: "",
    descricao: "",
    destinatario_nome: "",
    destinatario_telefone: "",
    mensagem: "",
    tipo_agendamento: "UNICO",
    data_envio: hojeISO(),
    hora_envio: "08:00",
    repetir: false,
    tipo_repeticao: "",
    intervalo_repeticao: "1",
    quantidade_repeticoes: "",
    data_fim_repeticao: "",
    dias_semana: [],
    meses_ano: [],
    status: "AGENDADO",
    ativo: true,
    modelo_id: null,
  };
}

function mostrarValor(valor: string | number | boolean | null | undefined) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return "-";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  return String(valor);
}

function normalizarTexto(valor: string | number | boolean | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarTelefone(valor: string | number | null | undefined) {
  return String(valor ?? "").replace(/\D/g, "");
}

function formatarHora(valor: string | null | undefined) {
  if (!valor) return "-";
  const [hora = "", minuto = ""] = valor.split(":");
  if (!hora || !minuto) return "-";
  return `${hora}:${minuto}`;
}

function formatarModulo(origem: string | null | undefined) {
  if (origem === "CONTA_RECEBER") return "Conta a Receber";
  if (origem === "CAMPANHA") return "Campanha";
  if (origem === "ANIVERSARIANTE") return "Aniversariante";
  return mostrarValor(origem);
}

function formatarTipoAgendamento(tipo: string | null | undefined) {
  if (tipo === "UNICO") return "Único";
  if (tipo === "RECORRENTE") return "Recorrente";
  return mostrarValor(tipo);
}

const motivosPendentesMensagemProgramada = new Set([
  "bloqueado_fora_horario",
  "aguardando_horario_permitido",
  "bloqueado_limite_minuto",
  "bloqueado_limite_diario",
  "bloqueado_limite_categoria_cliente_dia",
  "bloqueado_dia_nao_permitido",
  "bloqueado_feriado",
  "aguardando_intervalo",
  "reenvio_agendado",
  "aguardando_parametro",
  "falha_sem_parametro_whats",
  "bloqueado_frequencia_cliente",
  "max_tentativas_reenvio",
]);

const mensagensPendenciaProgramada: Record<string, string> = {
  bloqueado_fora_horario: "Envio pendente: fora do horário permitido.",
  aguardando_horario_permitido: "Envio pendente: aguardando próximo horário permitido.",
  bloqueado_limite_minuto: "Envio pendente: limite por minuto atingido.",
  bloqueado_limite_diario: "Envio pendente: limite diário atingido.",
  bloqueado_limite_categoria_cliente_dia: "Envio pendente: cliente atingiu o limite diário desta categoria.",
  bloqueado_dia_nao_permitido: "Envio pendente: dia da semana não permitido.",
  bloqueado_feriado: "Envio pendente: envio bloqueado em feriado.",
  aguardando_intervalo: "Envio pendente: aguardando intervalo entre mensagens.",
  reenvio_agendado: "Envio pendente: reenvio agendado.",
  aguardando_parametro: "Envio pendente: aguardando regra de envio permitida.",
  falha_sem_parametro_whats: "Envio pendente: parâmetros de WhatsApp não configurados.",
  bloqueado_frequencia_cliente: "Envio pendente: frequência mínima do cliente ainda não foi atingida.",
  max_tentativas_reenvio: "Envio pendente: limite máximo de tentativas de reenvio atingido.",
};

const motivosErroMensagemProgramada = new Set([
  "erro",
  "erro_btzap",
  "erro_whatsapp",
  "erro_internet",
  "timeout",
  "falha_api",
  "erro_conexao",
  "erro_tecnico",
  "erro_inesperado",
  "falha",
]);

function getMotivoBloqueioMensagemProgramada(mensagem: MensagemProgramada) {
  return String(mensagem.motivo_bloqueio ?? "").trim();
}

function dataExecucaoFutura(mensagem: MensagemProgramada) {
  if (!mensagem.executar_em) return false;
  const data = new Date(mensagem.executar_em);
  return !Number.isNaN(data.getTime()) && data.getTime() > Date.now();
}

function normalizarStatusMensagemProgramada(mensagem: MensagemProgramada): StatusVisualMensagemProgramada {
  const status = normalizarTexto(mensagem.status);
  const motivo = getMotivoBloqueioMensagemProgramada(mensagem);

  if (["enviado", "enviada", "sent", "delivered", "read", "sucesso", "processado"].includes(status)) return "enviada";
  if (motivosErroMensagemProgramada.has(status) || motivosErroMensagemProgramada.has(motivo)) return "erro";
  if (status === "pendente" || motivosPendentesMensagemProgramada.has(motivo)) return "pendente";
  if (["agendado", "agendada", "processando"].includes(status) || dataExecucaoFutura(mensagem)) return "agendada";

  return "pendente";
}

function labelStatusMensagemProgramada(mensagem: MensagemProgramada) {
  const status = normalizarStatusMensagemProgramada(mensagem);
  if (status === "agendada") return "Agendada";
  if (status === "pendente") return "Pendente";
  if (status === "enviada") return "Enviada";
  return "Erro";
}

function getStatusClassProgramada(mensagem: MensagemProgramada) {
  const status = normalizarStatusMensagemProgramada(mensagem);
  if (status === "enviada") return "history-status history-status-enviado";
  if (status === "erro") return "history-status history-status-erro";
  if (status === "agendada") return "history-status history-status-enviando";
  return "history-status history-status-pendente";
}

function getStatusClassFormulario(status: string | null | undefined) {
  const statusNormalizado = normalizarTexto(status);
  if (["enviado", "enviada"].includes(statusNormalizado)) return "history-status history-status-enviado";
  if (statusNormalizado === "erro") return "history-status history-status-erro";
  if (["agendado", "agendada", "processando"].includes(statusNormalizado)) return "history-status history-status-enviando";
  return "history-status history-status-pendente";
}

function obterMensagemRetornoProgramada(mensagem: MensagemProgramada) {
  const status = normalizarStatusMensagemProgramada(mensagem);
  const erroEnvio = String(mensagem.erro_envio ?? "").trim();
  const motivo = getMotivoBloqueioMensagemProgramada(mensagem);

  if (status === "agendada") return erroEnvio || "Aguardando horário programado.";
  if (status === "enviada") return erroEnvio || "OK";
  if (status === "pendente") return erroEnvio || mensagensPendenciaProgramada[motivo] || "Envio pendente: aguardando próxima tentativa permitida.";

  if (erroEnvio) return erroEnvio;
  if (motivo === "erro_btzap") return "Erro técnico no BTZap.";
  if (motivo === "erro_whatsapp") return "Erro técnico no WhatsApp.";
  if (motivo === "timeout") return "Erro técnico: tempo limite excedido.";
  if (motivo === "erro_internet" || motivo === "erro_conexao") return "Erro de internet ou conexão.";
  if (motivo === "falha_api") return "Erro técnico na API de envio.";
  return "Erro técnico ao enviar mensagem.";
}

function statusVisualParaFiltro(status: StatusVisualMensagemProgramada) {
  if (status === "agendada") return "AGENDADO";
  if (status === "pendente") return "PENDENTE";
  if (status === "enviada") return "ENVIADO";
  return "ERRO";
}

function dataInicioDia(data: string) {
  return new Date(`${data}T00:00:00`);
}

function dataDiaSeguinte(data: string) {
  const valor = dataInicioDia(data);
  valor.setDate(valor.getDate() + 1);
  return valor;
}

function dataHoraProgramada(data: string, hora: string) {
  return new Date(`${data}T${hora}`);
}

function formatarDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function getUltimoDiaMes(ano: number, mes: number) {
  return new Date(ano, mes + 1, 0).getDate();
}

function ordenarDatasProgramadas(datas: DataProgramada[]) {
  return [...datas].sort((a, b) => dataHoraProgramada(a.data, a.hora).getTime() - dataHoraProgramada(b.data, b.hora).getTime());
}

function gerarDatasProgramadas(form: FormMensagemProgramada): DataProgramada[] {
  if (form.tipo_agendamento !== "RECORRENTE" && !form.repetir) {
    return [{ data: form.data_envio, hora: form.hora_envio }];
  }

  const dataInicial = dataInicioDia(form.data_envio);
  const hora = form.hora_envio;
  const quantidadeAdicional = Number(form.quantidade_repeticoes || 0);

  if (form.tipo_repeticao === "DIARIA" || form.tipo_repeticao === "PERSONALIZADA") {
    return Array.from({ length: quantidadeAdicional + 1 }, (_, indice) => {
      const data = new Date(dataInicial);
      data.setDate(data.getDate() + indice);
      return { data: formatarDataInput(data), hora };
    });
  }

  if (form.tipo_repeticao === "SEMANAL") {
    const inicioSemana = new Date(dataInicial);
    inicioSemana.setDate(dataInicial.getDate() - dataInicial.getDay());
    const datas = [];
    let semanasComDatas = 0;

    for (let semana = 0; semanasComDatas <= quantidadeAdicional && semana < 260; semana += 1) {
      const datasSemana = [];

      for (const diaSemana of form.dias_semana) {
        const data = new Date(inicioSemana);
        data.setDate(inicioSemana.getDate() + semana * 7 + diaSemana);

        if (data >= dataInicial) datasSemana.push({ data: formatarDataInput(data), hora });
      }

      if (datasSemana.length > 0) {
        datas.push(...datasSemana);
        semanasComDatas += 1;
      }
    }

    return ordenarDatasProgramadas(datas);
  }

  if (form.tipo_repeticao === "MENSAL") {
    const anoInicial = dataInicial.getFullYear();
    const diaMes = dataInicial.getDate();
    const datas = [];
    let anosComDatas = 0;

    for (let anoOffset = 0; anosComDatas <= quantidadeAdicional && anoOffset < 80; anoOffset += 1) {
      const ano = anoInicial + anoOffset;
      const datasAno = [];

      for (const mes of form.meses_ano) {
        const ultimoDia = getUltimoDiaMes(ano, mes);
        const data = new Date(ano, mes, Math.min(diaMes, ultimoDia));

        if (data >= dataInicial) datasAno.push({ data: formatarDataInput(data), hora });
      }

      if (datasAno.length > 0) {
        datas.push(...datasAno);
        anosComDatas += 1;
      }
    }

    return ordenarDatasProgramadas(datas);
  }

  return [{ data: form.data_envio, hora }];
}

function filtrarMensagensProgramadas(
  mensagens: MensagemProgramada[],
  filtros: FiltrosMensagensProgramadas,
  aplicarFiltroDatas = true,
) {
  const busca = normalizarTexto(filtros.busca);
  const buscaTelefone = normalizarTelefone(filtros.busca);
  const inicio = filtros.dataInicial ? dataInicioDia(filtros.dataInicial) : null;
  const fim = filtros.dataFinal ? dataDiaSeguinte(filtros.dataFinal) : null;

  return mensagens.filter((mensagem) => {
    if (busca) {
      const encontrouTexto =
        normalizarTexto(mensagem.titulo).includes(busca) ||
        normalizarTexto(mensagem.destinatario_nome).includes(busca) ||
        normalizarTexto(mensagem.destinatario_telefone).includes(busca) ||
        normalizarTexto(mensagem.mensagem).includes(busca);
      const encontrouTelefone =
        buscaTelefone !== "" && normalizarTelefone(mensagem.destinatario_telefone).includes(buscaTelefone);

      if (!encontrouTexto && !encontrouTelefone) return false;
    }

    if (aplicarFiltroDatas) {
      const dataEnvio = mensagem.executar_em ? new Date(mensagem.executar_em) : dataInicioDia(mensagem.data_envio);
      if (inicio && dataEnvio < inicio) return false;
      if (fim && dataEnvio >= fim) return false;
    }
    if (filtros.origemModulo !== "todos" && mensagem.origem_modulo !== filtros.origemModulo) return false;
    if (filtros.tipoAgendamento !== "todos" && mensagem.tipo_agendamento !== filtros.tipoAgendamento) return false;
    if (filtros.status !== "todos" && statusVisualParaFiltro(normalizarStatusMensagemProgramada(mensagem)) !== filtros.status) return false;

    return true;
  });
}

function mensagemAtendeFiltroCard(mensagem: MensagemProgramada, filtro: FiltroCardMensagem) {
  if (filtro === "todos") return true;
  const status = normalizarStatusMensagemProgramada(mensagem);
  if (filtro === "padrao") return ["pendente", "agendada", "enviada"].includes(status);
  return statusVisualParaFiltro(status) === filtro;
}

function validarMensagemProgramada(form: FormMensagemProgramada) {
  const telefoneNormalizado = normalizarTelefone(form.destinatario_telefone);
  const quantidade = form.quantidade_repeticoes === "" ? null : Number(form.quantidade_repeticoes);
  const recorrente = form.tipo_agendamento === "RECORRENTE" || form.repetir;
  const momentoEnvio = dataHoraProgramada(form.data_envio, form.hora_envio);

  if (!form.origem_modulo) return "Origem do módulo é obrigatória.";
  if (!form.titulo.trim()) return "Título é obrigatório.";
  if (!form.destinatario_telefone.trim()) return "Telefone do destinatário é obrigatório.";
  if (telefoneNormalizado.length < 10) return "Informe um telefone válido para o destinatário.";
  if (!form.mensagem.trim()) return "Mensagem é obrigatória.";
  if (!form.data_envio) return "Data de envio é obrigatória.";
  if (!form.hora_envio) return "Hora de envio é obrigatória.";
  if (!form.tipo_agendamento) return "Tipo de agendamento é obrigatório.";
  if (Number.isNaN(momentoEnvio.getTime())) return "Data/hora de envio inválida.";
  if (momentoEnvio < new Date() && !["ENVIADO", "ENVIADA"].includes(form.status)) return "Não é permitido agendar mensagem no passado.";

  if (recorrente) {
    if (!form.tipo_repeticao) return "Tipo de repetição é obrigatório para recorrência.";
    if (quantidade === null || !Number.isFinite(quantidade) || quantidade < 0) {
      return "Quantidade de repetições adicionais deve ser maior ou igual a 0.";
    }
    if (form.tipo_repeticao === "SEMANAL" && form.dias_semana.length === 0) {
      return "Selecione pelo menos um dia da semana.";
    }
    if (form.tipo_repeticao === "MENSAL" && form.meses_ano.length === 0) {
      return "Selecione pelo menos um mês.";
    }
  }

  return null;
}

function montarPayloadMensagemProgramada(form: FormMensagemProgramada, dataEnvio = form.data_envio) {
  const recorrente = form.tipo_agendamento === "RECORRENTE" || form.repetir;

  return {
    tipo_envio: form.origem_modulo === "CONTA_RECEBER" ? "cobranca" : form.origem_modulo === "CAMPANHA" ? "campanha_promocao" : "mensagem_programada",
    origem_modulo: form.origem_modulo,
    id_origem: form.id_origem.trim() || null,
    titulo: form.titulo.trim(),
    descricao: form.descricao.trim() || null,
    destinatario_nome: form.destinatario_nome.trim() || null,
    destinatario_telefone: form.destinatario_telefone.trim(),
    mensagem: form.mensagem.trim(),
    tipo_agendamento: recorrente ? "RECORRENTE" : "UNICO",
    data_envio: dataEnvio,
    hora_envio: form.hora_envio,
    executar_em: montarExecutarEm(dataEnvio, form.hora_envio),
    repetir: recorrente,
    tipo_repeticao: recorrente ? form.tipo_repeticao || null : null,
    intervalo_repeticao: recorrente ? Number(form.intervalo_repeticao || 1) : null,
    quantidade_repeticoes: recorrente && form.quantidade_repeticoes ? Number(form.quantidade_repeticoes) : null,
    data_fim_repeticao: recorrente && form.data_fim_repeticao ? form.data_fim_repeticao : null,
    status: form.status,
    enviado: form.status === "ENVIADO" || form.status === "ENVIADA",
    data_hora_envio: form.status === "ENVIADO" || form.status === "ENVIADA" ? new Date().toISOString() : null,
    erro_envio: form.status === "ENVIADO" || form.status === "ENVIADA" ? "OK" : null,
    ativo: form.ativo,
    modelo_id: form.modelo_id,
  };
}

function gerarMensagensRecorrentes(form: FormMensagemProgramada) {
  return gerarDatasProgramadas(form).map(({ data }) => montarPayloadMensagemProgramada(form, data));
}

export function MensagensProgramadas() {
  const { usuario } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemProgramada[]>([]);
  const [filtros, setFiltros] = useState<FiltrosMensagensProgramadas>(filtrosIniciais);
  const [form, setForm] = useState<FormMensagemProgramada>(() => formInicial());
  const [mensagemSelecionada, setMensagemSelecionada] = useState<MensagemProgramada | null>(null);
  const [exibindoFormulario, setExibindoFormulario] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroCard, setFiltroCard] = useState<FiltroCardMensagem>("padrao");
  const processandoAutomaticamente = useRef(false);

  const listarMensagensProgramadas = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setMensagens([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro(null);

    const { data, error } = await supabase
      .from("tb_msg_programadas")
      .select("*")
      .eq("id_empresa", usuario.id_empresa)
      .eq("ativo", true)
      .order("executar_em", { ascending: false, nullsFirst: false })
      .order("criado_em", { ascending: false });

    if (error) {
      setMensagens([]);
      setErro(error.message);
    } else {
      setMensagens((data ?? []) as MensagemProgramada[]);
    }

    setCarregando(false);
  }, [usuario?.id_empresa]);

  useEffect(() => {
    void listarMensagensProgramadas();
  }, [listarMensagensProgramadas]);

  const mensagensFiltradas = useMemo(
    () =>
      filtrarMensagensProgramadas(mensagens, filtros, filtroCard === "padrao").filter((mensagem) =>
        mensagemAtendeFiltroCard(mensagem, filtroCard),
      ),
    [filtroCard, filtros, mensagens],
  );

  const resumo = useMemo(
    () => ({
      pendentes: mensagens.filter((mensagem) => normalizarStatusMensagemProgramada(mensagem) === "pendente").length,
      agendadas: mensagens.filter((mensagem) => normalizarStatusMensagemProgramada(mensagem) === "agendada").length,
      enviadas: mensagens.filter((mensagem) => normalizarStatusMensagemProgramada(mensagem) === "enviada").length,
      erros: mensagens.filter((mensagem) => normalizarStatusMensagemProgramada(mensagem) === "erro").length,
      total: mensagens.length,
    }),
    [mensagens],
  );

  function abrirNovoCadastro() {
    setForm(formInicial());
    setFeedback(null);
    setErro(null);
    setExibindoFormulario(true);
  }

  function editarMensagemProgramada(mensagem: MensagemProgramada) {
    setForm({
      id_msg_programada: mensagem.id_msg_programada,
      origem_modulo: mensagem.origem_modulo,
      id_origem: mensagem.id_origem ?? "",
      titulo: mensagem.titulo,
      descricao: mensagem.descricao ?? "",
      destinatario_nome: mensagem.destinatario_nome ?? "",
      destinatario_telefone: mensagem.destinatario_telefone,
      mensagem: mensagem.mensagem,
      tipo_agendamento: mensagem.tipo_agendamento,
      data_envio: mensagem.data_envio,
      hora_envio: formatarHora(mensagem.hora_envio),
      repetir: mensagem.repetir,
      tipo_repeticao: mensagem.tipo_repeticao ?? "",
      intervalo_repeticao: String(mensagem.intervalo_repeticao ?? 1),
      quantidade_repeticoes: mensagem.quantidade_repeticoes ? String(mensagem.quantidade_repeticoes) : "",
      data_fim_repeticao: mensagem.data_fim_repeticao ?? "",
      dias_semana: [],
      meses_ano: [],
      status: mensagem.status,
      ativo: mensagem.ativo,
      modelo_id: mensagem.modelo_id ?? null,
    });
    setFeedback(null);
    setErro(null);
    setExibindoFormulario(true);
  }

  function fecharFormulario() {
    if (salvando) return;
    setExibindoFormulario(false);
  }

  async function criarMensagemProgramada() {
    if (!usuario?.id_empresa) throw new Error("Empresa da sessão não identificada.");
    const registros = gerarMensagensRecorrentes(form).map((registro) => ({
      ...registro,
      id_empresa: usuario.id_empresa,
    }));
    const { error } = await supabase.from("tb_msg_programadas").insert(registros);
    if (error) throw error;
    setFeedback(`${registros.length} mensagem(ns) programada(s) cadastrada(s).`);
  }

  async function atualizarMensagemProgramada() {
    if (!form.id_msg_programada) return;
    if (!usuario?.id_empresa) throw new Error("Empresa da sessão não identificada.");
    const { error } = await supabase
      .from("tb_msg_programadas")
      .update({
        ...montarPayloadMensagemProgramada(form),
        id_empresa: usuario.id_empresa,
      })
      .eq("id_empresa", usuario.id_empresa)
      .eq("id_msg_programada", form.id_msg_programada);
    if (error) throw error;
    setFeedback("Mensagem programada atualizada.");
  }

  async function salvarMensagemProgramada() {
    const erroValidacao = validarMensagemProgramada(form);

    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      if (form.id_msg_programada) {
        await atualizarMensagemProgramada();
      } else {
        await criarMensagemProgramada();
      }
      setExibindoFormulario(false);
      await listarMensagensProgramadas();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar a mensagem programada.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarMensagemProgramada(mensagem: MensagemProgramada) {
    if (mensagem.status === "ENVIADO" || mensagem.status === "ENVIADA") return;

    const { error } = await supabase
      .from("tb_msg_programadas")
      .update({ status: "CANCELADO", enviado: false })
      .eq("id_empresa", usuario?.id_empresa ?? "")
      .eq("id_msg_programada", mensagem.id_msg_programada);

    if (error) {
      setErro(error.message);
      return;
    }

    setFeedback("Mensagem programada cancelada.");
    await listarMensagensProgramadas();
  }

  async function reativarMensagemProgramada(mensagem: MensagemProgramada) {
    const { error } = await supabase
      .from("tb_msg_programadas")
      .update({ status: "AGENDADO", enviado: false, erro_envio: null })
      .eq("id_empresa", usuario?.id_empresa ?? "")
      .eq("id_msg_programada", mensagem.id_msg_programada);

    if (error) {
      setErro(error.message);
      return;
    }

    setFeedback("Mensagem programada reativada.");
    await listarMensagensProgramadas();
  }

  async function excluirMensagemProgramada(mensagem: MensagemProgramada) {
    if (mensagem.status === "ENVIADO" || mensagem.status === "ENVIADA") return;

    const { error } = await supabase
      .from("tb_msg_programadas")
      .update({ ativo: false })
      .eq("id_empresa", usuario?.id_empresa ?? "")
      .eq("id_msg_programada", mensagem.id_msg_programada);

    if (error) {
      setErro(error.message);
      return;
    }

    setFeedback("Mensagem programada removida da listagem.");
    await listarMensagensProgramadas();
  }

  async function marcarMensagemComoEnviada(mensagem: MensagemProgramada) {
    const { error } = await supabase
      .from("tb_msg_programadas")
      .update({ status: "ENVIADO", enviado: true, data_hora_envio: new Date().toISOString(), erro_envio: "OK" })
      .eq("id_empresa", usuario?.id_empresa ?? "")
      .eq("id_msg_programada", mensagem.id_msg_programada);

    if (error) {
      setErro(error.message);
      return;
    }

    setFeedback("Mensagem marcada como enviada.");
    await listarMensagensProgramadas();
  }

  async function marcarMensagemComErro(mensagem: MensagemProgramada) {
    const { error } = await supabase
      .from("tb_msg_programadas")
      .update({ status: "ERRO", enviado: false, erro_envio: "Falha registrada manualmente." })
      .eq("id_empresa", usuario?.id_empresa ?? "")
      .eq("id_msg_programada", mensagem.id_msg_programada);

    if (error) {
      setErro(error.message);
      return;
    }

    setFeedback("Mensagem marcada com erro.");
    await listarMensagensProgramadas();
  }

  const executarMensagensProgramadas = useCallback(
    async (silencioso = false) => {
      if (processandoAutomaticamente.current) return;

      processandoAutomaticamente.current = true;

      if (!silencioso) {
        setExecutando(true);
        setErro(null);
        setFeedback(null);
      }

      try {
        if (import.meta.env.DEV) {
          console.log("Buscando mensagens programadas para processamento...");
        }

        if (!usuario?.id_empresa) {
          throw new Error("Empresa da sessão não identificada.");
        }

        const { data, error } = await supabase.functions.invoke("btzap-process-scheduled-messages", {
          body: { id_empresa: usuario.id_empresa },
        });

        if (error) {
          const mensagemErro = `Erro ao executar mensagens programadas: ${error.message}`;
          if (silencioso) {
            console.error(mensagemErro);
          } else {
            setErro(mensagemErro);
          }
          return;
        }

        if (data?.success === false) {
          const mensagemErro = data?.error ?? data?.message ?? "Não foi possível executar mensagens programadas.";
          if (silencioso) {
            console.error(mensagemErro);
          } else {
            setErro(mensagemErro);
          }
          return;
        }

        if (import.meta.env.DEV) {
          console.log(`Mensagens programadas processadas: ${data?.processadas ?? 0}`);
        }

        if (!silencioso) {
          setFeedback(`${data?.processadas ?? 0} mensagem(ns) agendada(s) processada(s).`);
        }

      } catch (error) {
        const mensagemErro = error instanceof Error ? error.message : "Não foi possível executar mensagens programadas.";
        if (silencioso) {
          console.error(mensagemErro);
        } else {
          setErro(mensagemErro);
        }
      } finally {
        await listarMensagensProgramadas();
        processandoAutomaticamente.current = false;
        if (!silencioso) {
          setExecutando(false);
        }
      }
    },
    [listarMensagensProgramadas, usuario?.id_empresa],
  );

  function buscarMensagemProgramadaPorId(id: string) {
    return mensagens.find((mensagem) => mensagem.id_msg_programada === id) ?? null;
  }

  const cards = [
    { label: "Pendentes", value: resumo.pendentes, icon: "pending", color: "laranja", help: "Aguardando processamento", filtro: "PENDENTE" as const },
    { label: "Agendadas", value: resumo.agendadas, icon: "calendar", color: "azul", help: "Programadas para envio", filtro: "AGENDADO" as const },
    { label: "Enviadas", value: resumo.enviadas, icon: "sent", color: "verde", help: "Concluídas com sucesso", filtro: "ENVIADO" as const },
    { label: "Com erro", value: resumo.erros, icon: "error", color: "vermelho", help: "Precisam de atenção", filtro: "ERRO" as const },
    { label: "Total", value: resumo.total, icon: "list", color: "ciano", help: "Todos os agendamentos", filtro: "todos" as const },
  ];

  return (
    <main className="page-shell scheduled-page">
      <GlobalPageHeader title="Mensagens Programadas" subtitle="Controle central de agendamentos automáticos de mensagens." icon="calendar" actions={
        <>
          <button className="secondary-button" type="button" onClick={listarMensagensProgramadas} disabled={carregando}>
            Atualizar
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void executarMensagensProgramadas()}
            disabled={executando}
          >
            {executando ? "Executando..." : "Executar agendadas"}
          </button>
          <button className="primary-button" type="button" onClick={abrirNovoCadastro}>
            Nova mensagem
          </button>
        </>
      } />

      <section className="summary-grid scheduled-summary-grid" aria-label="Resumo de mensagens programadas">
        {cards.map((card) => {
          const ativo =
            filtroCard === card.filtro ||
            (filtroCard === "padrao" && ["PENDENTE", "AGENDADO", "ENVIADO"].includes(card.filtro));

          return (
          <button
            className={`summary-card summary-card-${card.color} scheduled-summary-filter${ativo ? " scheduled-summary-filter-active" : ""}`}
            type="button"
            key={card.label}
            aria-pressed={ativo}
            onClick={() => {
              setFiltroCard(card.filtro);
              setFiltros((atuais) => ({ ...atuais, status: "todos" }));
            }}
          >
            <div>
              <span>{card.label}</span>
              <strong>{carregando ? "..." : card.value}</strong>
              <small>{card.help}</small>
            </div>
            <div className="summary-card-icon" aria-hidden="true"><MetricCardIcon type={card.icon} /></div>
          </button>
          );
        })}
      </section>

      <section className="filters-panel scheduled-filters-panel" aria-label="Filtros">
        <label>
          <span>Busca</span>
          <input
            type="search"
            placeholder="Título, destinatário, telefone ou mensagem"
            value={filtros.busca}
            onChange={(event) => setFiltros({ ...filtros, busca: event.target.value })}
          />
        </label>

        <label>
          <span>Data inicial</span>
          <input
            type="date"
            value={filtros.dataInicial}
            onChange={(event) => setFiltros({ ...filtros, dataInicial: event.target.value })}
          />
        </label>

        <label>
          <span>Data final</span>
          <input
            type="date"
            value={filtros.dataFinal}
            onChange={(event) => setFiltros({ ...filtros, dataFinal: event.target.value })}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={filtros.status}
            onChange={(event) => {
              setFiltroCard("todos");
              setFiltros({ ...filtros, status: event.target.value });
            }}
          >
            <option value="todos">Todos</option>
            <option value="AGENDADO">Agendada</option>
            <option value="PENDENTE">Pendente</option>
            <option value="ENVIADO">Enviada</option>
            <option value="ERRO">Erro</option>
          </select>
        </label>

        <label>
          <span>Origem</span>
          <select
            value={filtros.origemModulo}
            onChange={(event) => setFiltros({ ...filtros, origemModulo: event.target.value })}
          >
            <option value="todos">Todas</option>
            <option value="CONTA_RECEBER">Conta a Receber</option>
            <option value="CAMPANHA">Campanha</option>
            <option value="ANIVERSARIANTE">Aniversariante</option>
          </select>
        </label>

        <label>
          <span>Tipo</span>
          <select
            value={filtros.tipoAgendamento}
            onChange={(event) => setFiltros({ ...filtros, tipoAgendamento: event.target.value })}
          >
            <option value="todos">Todos</option>
            <option value="UNICO">Único</option>
            <option value="RECORRENTE">Recorrente</option>
          </select>
        </label>
      </section>

      {feedback && <div className="feedback-box feedback-success">{feedback}</div>}
      {erro && <div className="feedback-box feedback-error">{erro}</div>}

      <section className="results-section">
        <div className="section-title">
          <h2>Agendamentos</h2>
          <span>{mensagensFiltradas.length} registro(s)</span>
        </div>

        {carregando && <div className="state-box">Carregando mensagens programadas...</div>}
        {!carregando && !erro && mensagensFiltradas.length === 0 && (
          <div className="state-box">Nenhuma mensagem programada encontrada.</div>
        )}

        {!carregando && mensagensFiltradas.length > 0 && (
          <div className="table-wrap">
            <table className="scheduled-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Título</th>
                  <th>Destinatário</th>
                  <th>Telefone</th>
                  <th>Criado em</th>
                  <th>Executar em</th>
                  <th>Tipo</th>
                  <th>Repetição</th>
                  <th>Status</th>
                  <th>Retorno / Erro</th>
                  <th>Enviado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {mensagensFiltradas.map((mensagem) => {
                  const statusVisual = normalizarStatusMensagemProgramada(mensagem);
                  const retornoErro = obterMensagemRetornoProgramada(mensagem);
                  const podeEditar = statusVisual === "pendente" || statusVisual === "agendada";
                  const mensagemAtual = buscarMensagemProgramadaPorId(mensagem.id_msg_programada) ?? mensagem;

                  return (
                    <tr
                      className={`scheduled-message-row scheduled-message-row-${statusVisual}`}
                      key={mensagem.id_msg_programada}
                      tabIndex={0}
                      onClick={() => setMensagemSelecionada(mensagemAtual)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setMensagemSelecionada(mensagemAtual);
                      }}
                    >
                      <td>{formatarModulo(mensagem.origem_modulo)}</td>
                      <td>{mostrarValor(mensagem.titulo)}</td>
                      <td>{mostrarValor(mensagem.destinatario_nome)}</td>
                      <td>{mostrarValor(mensagem.destinatario_telefone)}</td>
                      <td>{formatarDataHora(mensagem.criado_em)}</td>
                      <td>{formatarDataHora(mensagem.executar_em)}</td>
                      <td>{formatarTipoAgendamento(mensagem.tipo_agendamento)}</td>
                      <td>{mensagem.repetir ? mostrarValor(mensagem.tipo_repeticao) : "Não"}</td>
                      <td>
                        <span className={getStatusClassProgramada(mensagem)} title={retornoErro}>
                          {labelStatusMensagemProgramada(mensagem)}
                        </span>
                      </td>
                      <td title={retornoErro}>{mostrarValor(retornoErro)}</td>
                      <td>{formatarDataHora(mensagem.data_hora_envio)}</td>
                      <td>
                        <div className="actions-cell scheduled-actions-cell" onClick={(event) => event.stopPropagation()}>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Visualizar detalhes"
                            onClick={() => setMensagemSelecionada(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="info" />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Editar"
                            disabled={!podeEditar}
                            onClick={() => editarMensagemProgramada(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="edit" />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Cancelar"
                            disabled={
                              mensagem.status === "ENVIADO" ||
                              mensagem.status === "ENVIADA" ||
                              mensagem.status === "CANCELADO" ||
                              mensagem.status === "CANCELADA"
                            }
                            onClick={() => void cancelarMensagemProgramada(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="close" />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Reativar"
                            disabled={mensagem.status !== "CANCELADO" && mensagem.status !== "CANCELADA"}
                            onClick={() => void reativarMensagemProgramada(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="refresh" />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Marcar enviada"
                            disabled={
                              mensagem.status === "ENVIADO" ||
                              mensagem.status === "ENVIADA" ||
                              mensagem.status === "CANCELADO" ||
                              mensagem.status === "CANCELADA"
                            }
                            onClick={() => void marcarMensagemComoEnviada(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="check" />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Marcar erro"
                            disabled={
                              mensagem.status === "ENVIADO" ||
                              mensagem.status === "ENVIADA" ||
                              mensagem.status === "CANCELADO" ||
                              mensagem.status === "CANCELADA"
                            }
                            onClick={() => void marcarMensagemComErro(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="alert" />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            title="Excluir logicamente"
                            disabled={mensagem.status === "ENVIADO" || mensagem.status === "ENVIADA"}
                            onClick={() => void excluirMensagemProgramada(mensagemAtual)}
                          >
                            <ScheduledProgramIcon tipo="trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {exibindoFormulario && (
        <div className="review-modal-backdrop" role="presentation" onClick={fecharFormulario}>
          <section
            className="review-modal scheduled-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mensagem-programada-form-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="review-modal-header">
              <div>
                <h2 id="mensagem-programada-form-titulo">
                  {form.id_msg_programada ? "Editar mensagem programada" : "Nova mensagem programada"}
                </h2>
                <p>Cadastro manual preparado para integrações futuras.</p>
              </div>
              <button className="secondary-button" type="button" onClick={fecharFormulario} disabled={salvando}>
                Fechar
              </button>
            </header>

            <div className="scheduled-form">
              <label>
                <span>Origem do módulo</span>
                <select
                  value={form.origem_modulo}
                  onChange={(event) =>
                    setForm({ ...form, origem_modulo: event.target.value as OrigemModuloMensagemProgramada })
                  }
                  disabled={salvando}
                >
                  <option value="CONTA_RECEBER">Conta a Receber</option>
                  <option value="CAMPANHA">Campanha</option>
                  <option value="ANIVERSARIANTE">Aniversariante</option>
                </select>
              </label>

              <label>
                <span>ID de origem</span>
                <input
                  value={form.id_origem}
                  onChange={(event) => setForm({ ...form, id_origem: event.target.value })}
                  disabled={salvando}
                  placeholder="UUID do registro de origem"
                />
              </label>

              <label>
                <span>Título</span>
                <input
                  value={form.titulo}
                  onChange={(event) => setForm({ ...form, titulo: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label>
                <span>Nome do destinatário</span>
                <input
                  value={form.destinatario_nome}
                  onChange={(event) => setForm({ ...form, destinatario_nome: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label>
                <span>Telefone</span>
                <input
                  value={form.destinatario_telefone}
                  onChange={(event) => setForm({ ...form, destinatario_telefone: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label>
                <span>Tipo de agendamento</span>
                <select
                  value={form.tipo_agendamento}
                  onChange={(event) => {
                    const tipoAgendamento = event.target.value as TipoAgendamentoMensagemProgramada;
                    setForm({
                      ...form,
                      tipo_agendamento: tipoAgendamento,
                      repetir: tipoAgendamento === "RECORRENTE",
                      tipo_repeticao: tipoAgendamento === "RECORRENTE" ? form.tipo_repeticao || "DIARIA" : "",
                    });
                  }}
                  disabled={salvando || Boolean(form.id_msg_programada)}
                >
                  <option value="UNICO">Único</option>
                  <option value="RECORRENTE">Recorrente</option>
                </select>
              </label>

              <label>
                <span>Data do envio</span>
                <input
                  type="date"
                  value={form.data_envio}
                  onChange={(event) => setForm({ ...form, data_envio: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label>
                <span>Hora do envio</span>
                <input
                  type="time"
                  value={form.hora_envio}
                  onChange={(event) => setForm({ ...form, hora_envio: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label>
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as StatusMensagemProgramada })}
                  disabled={salvando}
                >
                  <option value="PENDENTE">Pendente</option>
                  <option value="AGENDADO">Agendado</option>
                  <option value="ENVIADO">Enviado</option>
                  <option value="CANCELADO">Cancelado</option>
                  <option value="ERRO">Erro</option>
                </select>
              </label>

              <label>
                <span>Tipo de repetição</span>
                <select
                  value={form.tipo_repeticao}
                  onChange={(event) =>
                    setForm({ ...form, tipo_repeticao: event.target.value as TipoRepeticaoMensagemProgramada })
                  }
                  disabled={salvando || form.tipo_agendamento !== "RECORRENTE"}
                >
                  <option value="">Selecione</option>
                  <option value="DIARIA">Diária</option>
                  <option value="SEMANAL">Semanal</option>
                  <option value="MENSAL">Mensal</option>
                  <option value="ANUAL">Anual</option>
                  <option value="PERSONALIZADA">Personalizada</option>
                </select>
              </label>

              <label>
                <span>Intervalo</span>
                <input
                  type="number"
                  min="1"
                  value={form.intervalo_repeticao}
                  onChange={(event) => setForm({ ...form, intervalo_repeticao: event.target.value })}
                  disabled={salvando || form.tipo_agendamento !== "RECORRENTE"}
                />
              </label>

              <label>
                <span>Quantidade</span>
                <input
                  type="number"
                  min="1"
                  value={form.quantidade_repeticoes}
                  onChange={(event) => setForm({ ...form, quantidade_repeticoes: event.target.value })}
                  disabled={salvando || form.tipo_agendamento !== "RECORRENTE"}
                />
              </label>

              <label>
                <span>Data final</span>
                <input
                  type="date"
                  value={form.data_fim_repeticao}
                  onChange={(event) => setForm({ ...form, data_fim_repeticao: event.target.value })}
                  disabled={salvando || form.tipo_agendamento !== "RECORRENTE"}
                />
              </label>

              <label className="scheduled-checkbox">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(event) => setForm({ ...form, ativo: event.target.checked })}
                  disabled={salvando}
                />
                <span>Ativo</span>
              </label>

              <label className="scheduled-full-field">
                <span>Descrição</span>
                <textarea
                  value={form.descricao}
                  onChange={(event) => setForm({ ...form, descricao: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label className="scheduled-full-field">
                <span>Mensagem</span>
                <textarea
                  value={form.mensagem}
                  onChange={(event) => setForm({ ...form, mensagem: event.target.value })}
                  disabled={salvando}
                />
              </label>
            </div>

            <footer className="review-actions">
              <button className="secondary-button" type="button" onClick={fecharFormulario} disabled={salvando}>
                Cancelar
              </button>
              <button className="primary-button" type="button" onClick={() => void salvarMensagemProgramada()} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {mensagemSelecionada && (
        <div className="modal-backdrop" role="presentation" onClick={() => setMensagemSelecionada(null)}>
          <aside
            className="details-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detalhes-mensagem-programada-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="details-header">
              <div>
                <h2 id="detalhes-mensagem-programada-titulo">Detalhes da mensagem</h2>
                <p>{mensagemSelecionada.titulo}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => setMensagemSelecionada(null)}>
                Fechar
              </button>
            </div>

            <section className="details-section">
              <h3>Agendamento</h3>
              <dl className="details-grid">
                <div>
                  <dt>Origem</dt>
                  <dd>{formatarModulo(mensagemSelecionada.origem_modulo)}</dd>
                </div>
                <div>
                  <dt>ID de origem</dt>
                  <dd>{mostrarValor(mensagemSelecionada.id_origem)}</dd>
                </div>
                <div>
                  <dt>Criado em</dt>
                  <dd>{formatarDataHora(mensagemSelecionada.criado_em)}</dd>
                </div>
                <div>
                  <dt>Executar em</dt>
                  <dd>{formatarDataHora(mensagemSelecionada.executar_em)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={getStatusClassProgramada(mensagemSelecionada)}>
                      {labelStatusMensagemProgramada(mensagemSelecionada)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Ativo</dt>
                  <dd>{mostrarValor(mensagemSelecionada.ativo)}</dd>
                </div>
              </dl>
            </section>

            <section className="details-section">
              <h3>Destinatário</h3>
              <dl className="details-grid">
                <div>
                  <dt>Nome</dt>
                  <dd>{mostrarValor(mensagemSelecionada.destinatario_nome)}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{mostrarValor(mensagemSelecionada.destinatario_telefone)}</dd>
                </div>
                <div>
                  <dt>Enviado</dt>
                  <dd>{mostrarValor(mensagemSelecionada.enviado)}</dd>
                </div>
                <div>
                  <dt>Enviado em</dt>
                  <dd>{formatarDataHora(mensagemSelecionada.data_hora_envio)}</dd>
                </div>
              </dl>
            </section>

            <section className="details-section">
              <h3>Mensagem</h3>
              <p className="scheduled-detail-text">{mensagemSelecionada.mensagem}</p>
            </section>

            <section className="details-section">
              <h3>Retorno / Erro</h3>
              <p className="scheduled-detail-text">{obterMensagemRetornoProgramada(mensagemSelecionada)}</p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

interface ProgramarMensagemContaReceberModalProps {
  conta: ContaReceber;
  onClose: () => void;
  onSaved: (mensagem: string) => void;
}

function formContaReceberInicial(conta: ContaReceber): FormMensagemProgramada {
  return {
    ...formInicial(),
    origem_modulo: "CONTA_RECEBER",
    id_origem: String(conta.id_ctarec),
    titulo: `Cobrança ${conta.documento ?? conta.id_ctarec}`,
    descricao: `Mensagem programada pela tela Contas a Receber para a conta ${conta.id_ctarec}.`,
    destinatario_nome: conta.cliente_nome ?? "",
    destinatario_telefone: conta.cliente_telefone ?? "",
    mensagem: montarMensagemCobrancaWhatsapp(conta),
    status: "AGENDADO",
  };
}

type ScheduledProgramIconType =
  | "calendar"
  | "file"
  | "money"
  | "phone"
  | "clock"
  | "user"
  | "check"
  | "info"
  | "send"
  | "close"
  | "edit"
  | "refresh"
  | "alert"
  | "trash";

function ScheduledProgramIcon({ tipo }: { tipo: ScheduledProgramIconType }) {
  if (tipo === "file") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }

  if (tipo === "money") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M17 7.5c-.7-1.2-2-2-3.8-2H10c-2 0-3.5 1.2-3.5 2.9 0 1.8 1.4 2.6 3.2 3l4.5 1c1.8.4 3.3 1.2 3.3 3 0 1.8-1.5 3.1-3.6 3.1h-3.1c-2 0-3.4-.8-4.2-2.1" />
      </svg>
    );
  }

  if (tipo === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 16.9v2.8a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4 2 2 0 0 1 4.1 2h2.8a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.8 9.6a16 16 0 0 0 6.6 6.6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 1.8Z" />
      </svg>
    );
  }

  if (tipo === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (tipo === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  if (tipo === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (tipo === "info") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    );
  }

  if (tipo === "send") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    );
  }

  if (tipo === "close") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }

  if (tipo === "edit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </svg>
    );
  }

  if (tipo === "refresh") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8a8 8 0 0 1 13.4 2M17.9 16A8 8 0 0 1 4.5 14" />
      </svg>
    );
  }

  if (tipo === "alert") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2 21h20Z" />
        <path d="M12 9v5M12 18h.01" />
      </svg>
    );
  }

  if (tipo === "trash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3" />
      <path d="M17 3v3" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 14h5" />
    </svg>
  );
}

function ScheduledAccountInfo({ icon, label, value }: { icon: ScheduledProgramIconType; label: string; value: string }) {
  return (
    <div className="scheduled-account-info">
      <span className="scheduled-account-info-icon">
        <ScheduledProgramIcon tipo={icon} />
      </span>
      <div>
        <dt>{label}</dt>
        <dd>{value || "-"}</dd>
      </div>
    </div>
  );
}

export function ProgramarMensagemContaReceberModal({
  conta,
  onClose,
  onSaved,
}: ProgramarMensagemContaReceberModalProps) {
  const { usuario } = useAuth();
  const [form, setForm] = useState<FormMensagemProgramada>(() => formContaReceberInicial(conta));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [exibirDatasProgramadas, setExibirDatasProgramadas] = useState(false);
  const [modelos, setModelos] = useState<ModeloMensagem[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState("");
  const [modeloSugerido, setModeloSugerido] = useState<string | null>(null);
  const [avisoModelo, setAvisoModelo] = useState<string | null>(null);
  const [carregandoModelos, setCarregandoModelos] = useState(true);

  useEffect(() => {
    let ativo = true;
    if (!usuario?.id_empresa) {
      setCarregandoModelos(false);
      return () => { ativo = false; };
    }
    void buscarTodosModelosMensagemAtivos(usuario.id_empresa)
      .then((dados) => {
        if (!ativo) return;
        const sugestao = selecionarModeloPadraoContaReceber(conta, dados);
        const chaveSugerida = sugestao ? getChaveModeloMensagem(sugestao) : "";
        setModelos(dados);
        setModeloSelecionado(chaveSugerida);
        setModeloSugerido(chaveSugerida || null);
        setAvisoModelo(dados.length > 0 && !sugestao ? "Nenhum modelo padrão encontrado para esta situação. Selecione um modelo manualmente." : null);
        if (sugestao) {
          setForm((atual) => ({
            ...atual,
            modelo_id: sugestao.id,
            mensagem: montarMensagemModeloContaReceber(conta, sugestao, {
              nome: usuario?.empresa_nome_fantasia || usuario?.empresa_razao_social,
            }),
          }));
        }
      })
      .catch((error) => { if (ativo) setErro(error instanceof Error ? error.message : "Não foi possível carregar os modelos."); })
      .finally(() => { if (ativo) setCarregandoModelos(false); });
    return () => { ativo = false; };
  }, [conta, usuario?.id_empresa]);

  function selecionarModelo(idModelo: string) {
    setModeloSelecionado(idModelo);
    setAvisoModelo(null);
    const modelo = modelos.find((item) => getChaveModeloMensagem(item) === idModelo);
    if (!modelo) {
      setForm({ ...form, modelo_id: null });
      return;
    }
    const mensagem = montarMensagemModeloContaReceber(conta, modelo, {
      nome: usuario?.empresa_nome_fantasia || usuario?.empresa_razao_social,
    });
    setForm({ ...form, modelo_id: modelo.id, mensagem });
  }

  async function salvarMensagemProgramadaContaReceber() {
    const erroValidacao = validarMensagemProgramada(form);

    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      if (!usuario?.id_empresa) throw new Error("Empresa da sessão não identificada.");

      const registros = gerarMensagensRecorrentes({
        ...form,
        origem_modulo: "CONTA_RECEBER",
        id_origem: String(conta.id_ctarec),
        status: form.status || "AGENDADO",
      }).map((registro) => ({
        ...registro,
        id_empresa: usuario.id_empresa,
      }));
      const { error } = await supabase.from("tb_msg_programadas").insert(registros);

      if (error) throw error;

      onSaved(`${registros.length} programação(ões) criada(s) para a conta ${conta.id_ctarec}.`);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar a programação.");
    } finally {
      setSalvando(false);
    }
  }

  function alternarDiaSemana(dia: number) {
    const selecionados = form.dias_semana.includes(dia)
      ? form.dias_semana.filter((item) => item !== dia)
      : [...form.dias_semana, dia];

    setForm({ ...form, dias_semana: selecionados.sort((a, b) => a - b) });
  }

  function alternarMesAno(mes: number) {
    const selecionados = form.meses_ano.includes(mes)
      ? form.meses_ano.filter((item) => item !== mes)
      : [...form.meses_ano, mes];

    setForm({ ...form, meses_ano: selecionados.sort((a, b) => a - b) });
  }

  const isRecorrente = form.tipo_agendamento === "RECORRENTE";
  const datasProgramadas = gerarDatasProgramadas(form);
  const quantidadeAdicional = form.quantidade_repeticoes === "" ? 0 : Number(form.quantidade_repeticoes);
  const totalProgramacoes = datasProgramadas.length;
  const diasSelecionados = form.dias_semana.map((dia) => diasSemana[dia]?.[1]).filter(Boolean).join(", ");
  const mesesSelecionados = form.meses_ano.map((mes) => mesesAno[mes]?.[1]).filter(Boolean).join(", ");
  const resumoPrincipal = !isRecorrente
    ? `Enviar uma única mensagem em ${formatarData(form.data_envio)} às ${form.hora_envio || "--:--"}`
    : form.tipo_repeticao === "SEMANAL"
      ? `Enviar semanalmente às ${form.hora_envio || "--:--"}`
      : form.tipo_repeticao === "MENSAL"
        ? `Enviar mensalmente às ${form.hora_envio || "--:--"}`
        : `Enviar diariamente às ${form.hora_envio || "--:--"}`;
  const resumoPeriodo = !isRecorrente
    ? `Destinatário: ${form.destinatario_nome || conta.cliente_nome || "-"}`
    : form.tipo_repeticao === "SEMANAL"
      ? `Dias selecionados: ${diasSelecionados || "-"} · Semanas adicionais: ${quantidadeAdicional}`
      : form.tipo_repeticao === "MENSAL"
        ? `Meses selecionados: ${mesesSelecionados || "-"} · Anos adicionais: ${quantidadeAdicional}`
        : `Data inicial: ${formatarData(form.data_envio)} · Repetições adicionais: ${quantidadeAdicional}`;

  return (
    <div className="scheduled-program-backdrop" role="presentation" onClick={salvando ? undefined : onClose}>
      <section
        className="scheduled-program-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="programar-mensagem-cobranca-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="scheduled-program-header">
          <div className="scheduled-program-title">
            <span className="scheduled-program-header-icon" aria-hidden="true">
              <ScheduledProgramIcon tipo="calendar" />
            </span>
            <div>
              <h2 id="programar-mensagem-cobranca-titulo">Programar Mensagem de Cobrança</h2>
              <p>Agendamento automático via WhatsApp para Conta a Receber.</p>
            </div>
          </div>
          <button className="scheduled-close-button" type="button" onClick={onClose} disabled={salvando} aria-label="Fechar">
            <ScheduledProgramIcon tipo="close" />
          </button>
        </header>

        <div className="scheduled-program-body">
          <section className="scheduled-section-card">
            <h3><span>1</span> Identificação do registro</h3>
            <div className="scheduled-account-card">
              <strong>#{conta.id_ctarec} - {conta.cliente_nome ?? "Cliente não informado"}</strong>
              <dl className="scheduled-account-info-grid">
                <ScheduledAccountInfo icon="file" label="Documento" value={conta.documento ?? "-"} />
                <ScheduledAccountInfo icon="money" label="Valor" value={formatarMoeda(conta.vlr_ctarec)} />
                <ScheduledAccountInfo icon="calendar" label="Vencimento" value={formatarData(conta.dt_vencto)} />
                <ScheduledAccountInfo icon="phone" label="Telefone" value={conta.cliente_telefone ?? "-"} />
              </dl>
            </div>
          </section>

          <section className="scheduled-section-card">
            <h3><span>2</span> Tipo de programação</h3>
            <div className="scheduled-type-grid">
              <button
                type="button"
                className={form.tipo_agendamento === "UNICO" ? "scheduled-type-card scheduled-type-card-active" : "scheduled-type-card"}
                onClick={() =>
                  setForm({
                    ...form,
                    tipo_agendamento: "UNICO",
                    repetir: false,
                    tipo_repeticao: "",
                  })
                }
                disabled={salvando}
              >
                <span className="scheduled-radio-dot" />
                <strong>Única</strong>
                <small>Cria um agendamento para uma data e hora.</small>
              </button>
              <button
                type="button"
                className={
                  form.tipo_agendamento === "RECORRENTE"
                    ? "scheduled-type-card scheduled-type-card-active"
                    : "scheduled-type-card"
                }
                onClick={() =>
                  setForm({
                    ...form,
                    tipo_agendamento: "RECORRENTE",
                    repetir: true,
                    tipo_repeticao: form.tipo_repeticao || "DIARIA",
                    quantidade_repeticoes: form.quantidade_repeticoes || "0",
                  })
                }
                disabled={salvando}
              >
                <span className="scheduled-radio-dot" />
                <strong>Replicar para várias datas</strong>
                <small>Gera uma programação para cada execução futura.</small>
              </button>
            </div>
          </section>

          <section className="scheduled-section-card scheduled-section-soft">
            <h3><span>3</span> Configurações do envio</h3>
            <div className="scheduled-form scheduled-program-grid">
              <label>
                <span>Data do envio</span>
                <div className="scheduled-input-icon-wrap">
                  <input
                    type="date"
                    value={form.data_envio}
                    onChange={(event) => setForm({ ...form, data_envio: event.target.value })}
                    disabled={salvando}
                  />
                  <ScheduledProgramIcon tipo="calendar" />
                </div>
              </label>

              <label>
                <span>Horário</span>
                <div className="scheduled-input-icon-wrap">
                  <input
                    type="time"
                    value={form.hora_envio}
                    onChange={(event) => setForm({ ...form, hora_envio: event.target.value })}
                    disabled={salvando}
                  />
                  <ScheduledProgramIcon tipo="clock" />
                </div>
              </label>

              <label>
                <span>Nome do destinatário</span>
                <input
                  value={form.destinatario_nome}
                  onChange={(event) => setForm({ ...form, destinatario_nome: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label>
                <span>Telefone do destinatário</span>
                <input
                  value={form.destinatario_telefone}
                  onChange={(event) => setForm({ ...form, destinatario_telefone: event.target.value })}
                  disabled={salvando}
                />
              </label>

              <label className="scheduled-full-field">
                <span className="scheduled-model-title">
                  Modelo de mensagem
                  {modeloSugerido && modeloSelecionado === modeloSugerido && (
                    <small className="whatsapp-review-model-badge">Modelo sugerido</small>
                  )}
                </span>
                <select value={modeloSelecionado} onChange={(event) => selecionarModelo(event.target.value)} disabled={salvando || carregandoModelos}>
                  <option value="">{carregandoModelos ? "Carregando modelos..." : "Mensagem padrão atual"}</option>
                  {modelos.map((modelo) => (
                    <option key={getChaveModeloMensagem(modelo)} value={getChaveModeloMensagem(modelo)}>
                      {modelo.origem_modelo === "cobranca" ? "[Cobrança]" : modelo.modelo_global ? "[Global]" : "[Empresa]"} {modelo.nome}
                    </option>
                  ))}
                </select>
                <small>Modelo sugerido automaticamente conforme a situação da conta. Você pode alterar antes de enviar.</small>
                {avisoModelo && <small className="whatsapp-review-model-warning">{avisoModelo}</small>}
              </label>

              <label className="scheduled-full-field">
                <span>Mensagem</span>
                <textarea
                  value={form.mensagem}
                  placeholder="Digite a mensagem que será enviada automaticamente pelo WhatsApp..."
                  onChange={(event) => setForm({ ...form, mensagem: event.target.value })}
                  disabled={salvando}
                />
              </label>
            </div>
          </section>

          {isRecorrente && (
            <section className="scheduled-section-card scheduled-replication-section">
              <h3><span>3</span> Configurações da replicação</h3>
              <div className="scheduled-form scheduled-replication-grid">
                <label>
                  <span>Tipo de repetição</span>
                  <select
                    value={form.tipo_repeticao}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        tipo_repeticao: event.target.value as TipoRepeticaoMensagemProgramada,
                        quantidade_repeticoes: form.quantidade_repeticoes || "0",
                        dias_semana: [],
                        meses_ano: [],
                      })
                    }
                    disabled={salvando}
                  >
                    <option value="">Selecione</option>
                    <option value="DIARIA">Diária</option>
                    <option value="SEMANAL">Semanal</option>
                    <option value="MENSAL">Mensal</option>
                  </select>
                </label>

                {form.tipo_repeticao === "SEMANAL" && (
                  <div className="scheduled-picker-group scheduled-full-field">
                    <span>Dias da semana</span>
                    <div className="scheduled-chip-grid scheduled-weekday-grid">
                      {diasSemana.map(([curto, nome], indice) => (
                        <button
                          className={form.dias_semana.includes(indice) ? "scheduled-chip scheduled-chip-active" : "scheduled-chip"}
                          key={nome}
                          type="button"
                          onClick={() => alternarDiaSemana(indice)}
                          disabled={salvando}
                          title={nome}
                        >
                          {curto}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.tipo_repeticao === "MENSAL" && (
                  <div className="scheduled-picker-group scheduled-full-field">
                    <span>Meses do ano</span>
                    <div className="scheduled-chip-grid scheduled-month-grid">
                      {mesesAno.map(([curto, nome], indice) => (
                        <button
                          className={form.meses_ano.includes(indice) ? "scheduled-chip scheduled-chip-active" : "scheduled-chip"}
                          key={nome}
                          type="button"
                          onClick={() => alternarMesAno(indice)}
                          disabled={salvando}
                          title={nome}
                        >
                          {curto}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label>
                  <span>
                    {form.tipo_repeticao === "SEMANAL"
                      ? "Quantidade de semanas de repetições adicionais"
                      : form.tipo_repeticao === "MENSAL"
                        ? "Quantidade de anos de repetições adicionais"
                        : "Quantidade de repetições adicionais"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={form.quantidade_repeticoes}
                    onChange={(event) => setForm({ ...form, quantidade_repeticoes: event.target.value })}
                    disabled={salvando}
                  />
                </label>
              </div>
            </section>
          )}

          <section className="scheduled-section-card scheduled-summary-section">
            <h3><span>4</span> Resumo da programação</h3>
            <button
              className={
                totalProgramacoes > 1
                  ? "scheduled-program-summary scheduled-program-summary-clickable"
                  : "scheduled-program-summary"
              }
              type="button"
              onClick={() => {
                if (totalProgramacoes > 1) setExibirDatasProgramadas(true);
              }}
            >
              <span className="scheduled-summary-icon" aria-hidden="true">
                <ScheduledProgramIcon tipo="check" />
              </span>
              <div>
                <strong>{resumoPrincipal}</strong>
                <p>{resumoPeriodo}</p>
                <p>Telefone: {form.destinatario_telefone || "-"} · Total de programações: {totalProgramacoes} · Origem: Conta a Receber</p>
                {totalProgramacoes > 1 && <p>Clique para visualizar as datas programadas.</p>}
              </div>
            </button>
          </section>

          <section className="scheduled-section-card">
            <h3><span>5</span> Status</h3>
            <div className="scheduled-status-row">
              <label className="scheduled-status-select">
                <span>Status da programação</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as StatusMensagemProgramada })}
                  disabled={salvando}
                >
                  <option value="AGENDADO">Agendado</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </label>
              <div className="scheduled-status-help">
                <span className={getStatusClassFormulario(form.status)}>{form.status === "AGENDADO" ? "Agendado" : form.status}</span>
                <p>Somente programações com status Agendado serão enviadas automaticamente.</p>
              </div>
            </div>
          </section>
        </div>

        {erro && <div className="feedback-box feedback-error">{erro}</div>}

        <footer className="scheduled-program-footer">
          <button className="secondary-button" type="button" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void salvarMensagemProgramadaContaReceber()}
            disabled={salvando}
          >
            <ScheduledProgramIcon tipo="send" />
            {salvando ? "Salvando..." : "Salvar programação"}
          </button>
        </footer>
      </section>
      {exibirDatasProgramadas && (
        <div
          className="scheduled-dates-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            setExibirDatasProgramadas(false);
          }}
        >
          <section
            className="scheduled-dates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="datas-programadas-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="scheduled-program-header">
              <div className="scheduled-program-title">
                <span className="scheduled-program-header-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M7 3v3" />
                    <path d="M17 3v3" />
                    <rect x="4" y="5" width="16" height="16" rx="2" />
                    <path d="M4 10h16" />
                  </svg>
                </span>
                <div>
                  <h2 id="datas-programadas-titulo">Datas programadas</h2>
                  <p>{totalProgramacoes} programação(ões) serão criadas.</p>
                </div>
              </div>
              <button
                className="scheduled-close-button"
                type="button"
                onClick={() => setExibirDatasProgramadas(false)}
                aria-label="Fechar"
              >
                x
              </button>
            </header>

            <ol className="scheduled-dates-list">
              {datasProgramadas.map((item) => (
                <li key={`${item.data}-${item.hora}`}>
                  <span>{formatarData(item.data)}</span>
                  <strong>{item.hora}</strong>
                </li>
              ))}
            </ol>

            <footer className="review-actions scheduled-program-footer">
              <button className="primary-button" type="button" onClick={() => setExibirDatasProgramadas(false)}>
                Fechar
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

