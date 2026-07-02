import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { supabase } from "../lib/supabaseClient";

type TipoComunicacao = "whatsapp" | "email" | "instagram";
type StatusCampanha = "rascunho" | "programada" | "enviando" | "pausada" | "concluida" | "cancelada";
type AutomacaoStatus = "inativa" | "ativa" | "pausada" | "encerrada" | "erro";
type FiltroStatusCampanha = "padrao" | "todos" | StatusCampanha;
type FiltroPublico =
  | "todos"
  | "campanha_permitida"
  | "campanha_nao_permitida"
  | "aniversariantes_mes"
  | "sem_compra_90_dias"
  | "sem_telefone"
  | "restritos";

interface Campanha {
  id: string;
  id_empresa: string;
  nome: string;
  objetivo: string | null;
  publico_alvo: string | null;
  filtros_publico: Record<string, unknown> | null;
  tags_publico: string[] | null;
  mensagem: string | null;
  id_modelo_mensagem: string | null;
  tipo_comunicacao: TipoComunicacao;
  status: StatusCampanha;
  automatizada: boolean;
  publico_dinamico: boolean;
  tipo_automacao: string | null;
  campanha_continua: boolean;
  termina_em: string | null;
  automacao_status: AutomacaoStatus;
  automacao_ultima_execucao_em: string | null;
  automacao_proxima_execucao_em: string | null;
  automacao_total_envios: number;
  automacao_total_erros: number;
  data_hora_criacao: string;
  data_hora_agendamento: string | null;
  data_hora_inicio_envio: string | null;
  data_hora_fim_envio: string | null;
  percentual_envio: number;
  total_destinatarios: number;
  total_enviados: number;
  total_falhas: number;
  intervalo_envio_segundos: number;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  arquivo_tipo: string | null;
  aos_cuidados: string | null;
  empresa_destino: string | null;
  observacoes: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface ClienteCampanha {
  id_empresa: string | null;
  id_cliente: number | null;
  nome: string | null;
  dt_nascto: string | null;
  dt_pricomp: string | null;
  dt_ultcomp: string | null;
  ddd_celul: string | null;
  fone_celul: string | null;
  email_cont: string | null;
  permite_campanha: boolean | null;
  contato_restrito: boolean | null;
  tags: string[] | null;
}

interface DestinatarioCampanha {
  id_cliente: number;
  nome_cliente: string | null;
  telefone: string | null;
  email: string | null;
  status_envio: string;
}

interface FilaCampanha {
  id_origem: string | null;
  status: string | null;
  enviado: boolean | null;
  ativo: boolean | null;
}

interface ModeloMensagemAtivo {
  id: string;
  modelo_msg_titulo: string;
  modelo_msg: string;
  modelo_global: boolean;
}

interface FormCampanha {
  id: string | null;
  nome: string;
  objetivo: string;
  publicoAlvo: string;
  tipoComunicacao: TipoComunicacao;
  aosCuidados: string;
  empresaDestino: string;
  automatizada: boolean;
  tipoAutomacao: string;
  campanhaContinua: boolean;
  terminaEm: string;
  automacaoStatus: AutomacaoStatus;
  filtroPublico: FiltroPublico;
  buscaCliente: string;
  buscaTag: string;
  tagsPublico: string[];
  mensagem: string;
  dataHoraAgendamento: string;
  intervaloEnvioSegundos: string;
  arquivoNome: string;
  arquivoTipo: string;
  arquivoUrl: string;
  observacoes: string;
}

interface FiltrosListaCampanhas {
  busca: string;
  dataInicial: string;
  dataFinal: string;
  tipoComunicacao: "todos" | TipoComunicacao;
}

const formInicial: FormCampanha = {
  id: null,
  nome: "",
  objetivo: "",
  publicoAlvo: "Todos os clientes",
  tipoComunicacao: "whatsapp",
  aosCuidados: "",
  empresaDestino: "",
  automatizada: false,
  tipoAutomacao: "",
  campanhaContinua: false,
  terminaEm: "",
  automacaoStatus: "inativa",
  filtroPublico: "todos",
  buscaCliente: "",
  buscaTag: "",
  tagsPublico: [],
  mensagem: "",
  dataHoraAgendamento: "",
  intervaloEnvioSegundos: "30",
  arquivoNome: "",
  arquivoTipo: "",
  arquivoUrl: "",
  observacoes: "",
};

const filtrosPublico: Array<{ value: FiltroPublico; label: string }> = [
  { value: "todos", label: "Todos os clientes" },
  { value: "campanha_permitida", label: "Campanha permitida" },
  { value: "campanha_nao_permitida", label: "Campanha não permitida" },
  { value: "aniversariantes_mes", label: "Aniversariantes do mês" },
  { value: "sem_compra_90_dias", label: "Sem compra há mais de 90 dias" },
  { value: "sem_telefone", label: "Sem telefone válido" },
  { value: "restritos", label: "Clientes restritos" },
];

const statusLabels: Record<StatusCampanha, string> = {
  rascunho: "Rascunho",
  programada: "Programada",
  enviando: "Enviando",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const statusExibicaoPadrao: StatusCampanha[] = ["rascunho", "programada", "concluida"];

const tiposAutomacao = [
  { value: "aniversariantes_mes", label: "Aniversariantes do mês" },
  { value: "aniversariantes_dia", label: "Aniversariantes do dia" },
  { value: "clientes_inativos_90_dias", label: "Clientes sem compra há mais de 90 dias" },
  { value: "pos_compra_2_dias", label: "Pós-compra de 2 dias" },
] as const;

function normalizarTipoAutomacao(value: string | null | undefined) {
  const aliases: Record<string, string> = {
    aniversario_mes: "aniversariantes_mes",
    aniversario_dia: "aniversariantes_dia",
    sem_compra_90_dias: "clientes_inativos_90_dias",
    pos_venda_2_dias: "pos_compra_2_dias",
  };
  return aliases[value ?? ""] ?? value ?? "";
}

function labelTipoAutomacao(value: string) {
  return tiposAutomacao.find((item) => item.value === normalizarTipoAutomacao(value))?.label ?? "-";
}

function intervaloMesAtualCampanhas() {
  const hoje = new Date();
  const formatar = (data: Date) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

  return {
    inicio: formatar(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: formatar(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

const mesAtualCampanhas = intervaloMesAtualCampanhas();
const filtrosListaCampanhasIniciais: FiltrosListaCampanhas = {
  busca: "",
  dataInicial: mesAtualCampanhas.inicio,
  dataFinal: mesAtualCampanhas.fim,
  tipoComunicacao: "todos",
};

function normalizarBusca(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarDataHora(valor: string | null) {
  if (!valor) return "-";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function formatarDataInput(valor: string | null) {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const offsetMs = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dataValida(valor: string | null) {
  if (!valor) return null;
  const [dataIso] = valor.split("T");
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const data = ano && mes && dia ? new Date(ano, mes - 1, dia) : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataSimples(valor: string | null) {
  const data = dataValida(valor);
  return data ? new Intl.DateTimeFormat("pt-BR").format(data) : "-";
}

function telefoneNormalizado(cliente: ClienteCampanha) {
  return `${cliente.ddd_celul ?? ""}${cliente.fone_celul ?? ""}`.replace(/\D/g, "");
}

function telefoneValido(cliente: ClienteCampanha) {
  const telefone = telefoneNormalizado(cliente);
  return telefone.length >= 10 && telefone.length <= 11;
}

function formatarTelefone(cliente: ClienteCampanha) {
  const ddd = String(cliente.ddd_celul ?? "").replace(/\D/g, "");
  const telefone = String(cliente.fone_celul ?? "").trim();
  if (!ddd && !telefone) return "-";
  if (!ddd) return telefone || "-";
  if (!telefone) return `(${ddd})`;
  return `(${ddd}) ${telefone}`;
}

const mensagemTelefoneInvalido =
  "O cliente não pode ser usado por não ter um número de telefone válido cadastrado no Clipp, favor conferir.";
const mensagemEmailInvalido =
  "O cliente não pode ser usado por não ter um e-mail válido cadastrado no Clipp, favor conferir.";
const mensagemCampanhaBloqueada =
  "O cliente selecionado está configurado para não permitir envio de campanhas, favor confirmar com o cliente e altere as configurações.";

function aplicarVariaveisMensagem(mensagem: string, cliente: ClienteCampanha, form: FormCampanha) {
  const nome = cliente.nome ?? "";
  const dataAtual = new Intl.DateTimeFormat("pt-BR").format(new Date());
  const formatarDataCliente = (value: string | null) => {
    const data = dataValida(value);
    return data ? new Intl.DateTimeFormat("pt-BR").format(data) : "";
  };
  return mensagem
    .replace(/\{\{\s*nome\s*\}\}/gi, nome)
    .replace(/\{\{\s*cliente\s*\}\}/gi, nome)
    .replace(/\{\{\s*empresa\s*\}\}/gi, form.empresaDestino.trim())
    .replace(/\{\{\s*aos_cuidados\s*\}\}/gi, form.aosCuidados.trim())
    .replace(/\{\{\s*data_atual\s*\}\}/gi, dataAtual)
    .replace(/\{\{\s*documento\s*\}\}/gi, String(cliente.id_cliente ?? ""))
    .replace(/\{\{\s*ultima_compra\s*\}\}/gi, formatarDataCliente(cliente.dt_ultcomp))
    .replace(/\{\{\s*primeira_compra\s*\}\}/gi, formatarDataCliente(cliente.dt_pricomp));
}

function separarDataHoraAgendamento(valor: string) {
  const [dataEnvio, horaCompleta = ""] = valor.split("T");
  const horaEnvio = horaCompleta.slice(0, 5);
  return {
    dataEnvio,
    horaEnvio: horaEnvio ? `${horaEnvio}:00` : "",
  };
}

function clienteAniversarianteMes(cliente: ClienteCampanha) {
  const nascimento = dataValida(cliente.dt_nascto);
  if (!nascimento) return false;
  return nascimento.getMonth() === new Date().getMonth();
}

function clienteAniversarianteDia(cliente: ClienteCampanha) {
  const nascimento = dataValida(cliente.dt_nascto);
  if (!nascimento) return false;
  const hoje = new Date();
  return nascimento.getMonth() === hoje.getMonth() && nascimento.getDate() === hoje.getDate();
}

function clienteSemCompra90Dias(cliente: ClienteCampanha) {
  const ultimaCompra = dataValida(cliente.dt_ultcomp);
  if (!ultimaCompra) return false;
  const limite = new Date();
  limite.setHours(0, 0, 0, 0);
  limite.setDate(limite.getDate() - 90);
  return ultimaCompra <= limite;
}

function clientePosVenda2Dias(cliente: ClienteCampanha) {
  const ultimaCompra = dataValida(cliente.dt_ultcomp);
  if (!ultimaCompra) return false;

  const dataEsperada = new Date();
  dataEsperada.setHours(0, 0, 0, 0);
  dataEsperada.setDate(dataEsperada.getDate() - 2);

  return (
    ultimaCompra.getFullYear() === dataEsperada.getFullYear() &&
    ultimaCompra.getMonth() === dataEsperada.getMonth() &&
    ultimaCompra.getDate() === dataEsperada.getDate()
  );
}

function clienteAtendeTipoAutomacao(cliente: ClienteCampanha, tipoAutomacao: string) {
  const tipo = normalizarTipoAutomacao(tipoAutomacao);
  if (tipo === "aniversariantes_mes") return clienteAniversarianteMes(cliente);
  if (tipo === "aniversariantes_dia") return clienteAniversarianteDia(cliente);
  if (tipo === "clientes_inativos_90_dias") return clienteSemCompra90Dias(cliente);
  if (tipo === "pos_compra_2_dias") return clientePosVenda2Dias(cliente);
  return true;
}

function emailValido(cliente: ClienteCampanha) {
  const email = String(cliente.email_cont ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type CodigoBloqueioCliente = "telefone_invalido" | "email_invalido" | "contato_restrito" | "campanha_nao_permitida";

function obterBloqueioCliente(cliente: ClienteCampanha, tipoComunicacao: TipoComunicacao): {
  codigo: CodigoBloqueioCliente;
  label: string;
  mensagem: string;
} | null {
  if (tipoComunicacao === "whatsapp" && !telefoneValido(cliente)) {
    return { codigo: "telefone_invalido", label: "Telefone inválido", mensagem: mensagemTelefoneInvalido };
  }

  if (tipoComunicacao === "email" && !emailValido(cliente)) {
    return { codigo: "email_invalido", label: "E-mail inválido", mensagem: mensagemEmailInvalido };
  }

  if (cliente.contato_restrito === true) {
    return { codigo: "contato_restrito", label: "Contato restrito", mensagem: mensagemCampanhaBloqueada };
  }

  if (cliente.permite_campanha !== true) {
    return { codigo: "campanha_nao_permitida", label: "Campanha não permitida", mensagem: mensagemCampanhaBloqueada };
  }

  return null;
}

function obterMotivoBloqueioCliente(cliente: ClienteCampanha, tipoComunicacao: TipoComunicacao) {
  return obterBloqueioCliente(cliente, tipoComunicacao)?.mensagem ?? null;
}

function clienteAptoWhatsapp(cliente: ClienteCampanha) {
  return obterMotivoBloqueioCliente(cliente, "whatsapp") === null;
}

function clienteAptoParaCanal(cliente: ClienteCampanha, tipoComunicacao: TipoComunicacao) {
  return obterBloqueioCliente(cliente, tipoComunicacao) === null;
}

function tituloSituacaoCliente(cliente: ClienteCampanha, tipoComunicacao: TipoComunicacao) {
  const bloqueio = obterBloqueioCliente(cliente, tipoComunicacao);
  if (bloqueio?.codigo === "telefone_invalido") return "Cliente sem telefone válido cadastrado no Clipp.";
  if (bloqueio?.codigo === "email_invalido") return "Cliente sem e-mail válido cadastrado no Clipp.";
  if (bloqueio) return "Cliente configurado para não permitir envio de campanhas.";
  return "Cliente apto para receber campanhas.";
}

function situacaoCliente(cliente: ClienteCampanha, tipoComunicacao: TipoComunicacao) {
  const bloqueio = obterBloqueioCliente(cliente, tipoComunicacao);
  if (!bloqueio) return { label: "Apto", className: "campaign-client-status-ok" };

  if (bloqueio.codigo === "telefone_invalido" || bloqueio.codigo === "email_invalido") {
    return { label: bloqueio.label, className: "campaign-client-status-warning" };
  }

  return { label: bloqueio.label, className: "campaign-client-status-restricted" };
}

function clienteAtendeFiltro(cliente: ClienteCampanha, filtro: FiltroPublico, tipoComunicacao: TipoComunicacao) {
  if (filtro === "todos") return true;
  if (filtro === "campanha_permitida") return clienteAptoParaCanal(cliente, tipoComunicacao);
  if (filtro === "campanha_nao_permitida") return !clienteAptoParaCanal(cliente, tipoComunicacao);
  if (filtro === "aniversariantes_mes") return clienteAniversarianteMes(cliente);
  if (filtro === "sem_compra_90_dias") return clienteSemCompra90Dias(cliente);
  if (filtro === "sem_telefone") return !telefoneValido(cliente);
  if (filtro === "restritos") return cliente.contato_restrito === true;
  return true;
}

function filtrarClientes(clientes: ClienteCampanha[], form: FormCampanha) {
  const busca = normalizarBusca(form.buscaCliente);
  const tag = normalizarBusca(form.buscaTag);
  const preservarIgnoradosNoAutomatico = form.automatizada && form.filtroPublico === "campanha_permitida";

  return clientes.filter((cliente) => {
    if (form.automatizada && !clienteAtendeTipoAutomacao(cliente, form.tipoAutomacao)) return false;

    if (!preservarIgnoradosNoAutomatico && !clienteAtendeFiltro(cliente, form.filtroPublico, form.tipoComunicacao)) {
      return false;
    }

    if (busca) {
      const achou = [
        cliente.id_cliente,
        cliente.nome,
        cliente.email_cont,
        cliente.ddd_celul,
        cliente.fone_celul,
        formatarTelefone(cliente),
      ].some((valor) => normalizarBusca(valor).includes(busca));
      if (!achou) return false;
    }

    if (tag) {
      const tags = cliente.tags ?? [];
      if (!tags.some((item) => normalizarBusca(item).includes(tag))) return false;
    }

    return true;
  });
}

function labelFiltroPublico(filtro: { value: FiltroPublico; label: string }, tipoComunicacao: TipoComunicacao) {
  if (filtro.value === "campanha_permitida") return `Clientes aptos para ${tipoLabel(tipoComunicacao)}`;
  if (filtro.value === "campanha_nao_permitida") return `Clientes não aptos para ${tipoLabel(tipoComunicacao)}`;
  return filtro.label;
}

function statusClass(status: StatusCampanha) {
  return `campaign-status campaign-status-${status}`;
}

function tipoLabel(tipo: TipoComunicacao) {
  if (tipo === "whatsapp") return "WhatsApp";
  if (tipo === "email") return "E-mail";
  return "Instagram";
}

type CampaignModalIconName =
  | "megaphone"
  | "close"
  | "filter"
  | "trash"
  | "upload"
  | "email"
  | "back"
  | "next"
  | "save"
  | "info"
  | "edit"
  | "pause"
  | "copy";

function CampaignModalIcon({ name }: { name: CampaignModalIconName }) {
  if (name === "megaphone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 13V8.5c0-.8.6-1.5 1.4-1.6L18 4v16L5.4 17.1A1.7 1.7 0 0 1 4 15.5V13Z" />
        <path d="M8 17v2.2c0 .8.7 1.4 1.5 1.2l1.8-.5" />
        <path d="M18 9.5h2M18 14.5h2" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }

  if (name === "filter") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V4M7 9l5-5 5 5M5 15v5h14v-5" />
      </svg>
    );
  }

  if (name === "email") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  if (name === "info") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </svg>
    );
  }

  if (name === "pause") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5v14M15 5v14" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
    );
  }

  if (name === "back") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
    );
  }

  if (name === "save") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h11l3 3v13H5V4Z" />
        <path d="M8 4v6h8V4M8 20v-6h8v6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CampaignChannelIcon({ type }: { type: TipoComunicacao }) {
  if (type === "whatsapp") return <img src="/icons/whatsapp.svg" alt="" />;
  if (type === "instagram") return <img src="/icons/instagram.svg" alt="" />;

  return (
    <span className="campaign-channel-email-icon">
      <CampaignModalIcon name="email" />
    </span>
  );
}

function parseCampanha(data: unknown): Campanha {
  return data as Campanha;
}

export function CampanhasPromocao() {
  const { usuario } = useAuth();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [clientes, setClientes] = useState<ClienteCampanha[]>([]);
  const [destinatariosPorCampanha, setDestinatariosPorCampanha] = useState<Record<string, DestinatarioCampanha[]>>({});
  const [filasPorCampanha, setFilasPorCampanha] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [detalhes, setDetalhes] = useState<Campanha | null>(null);
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [tipoComunicacaoAberto, setTipoComunicacaoAberto] = useState(false);
  const [avisoPublico, setAvisoPublico] = useState<{ tipo: "erro" | "sucesso"; mensagem: string } | null>(null);
  const [form, setForm] = useState<FormCampanha>(formInicial);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [modelosAtivos, setModelosAtivos] = useState<ModeloMensagemAtivo[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusCampanha>("padrao");
  const [filtrosLista, setFiltrosLista] = useState<FiltrosListaCampanhas>(filtrosListaCampanhasIniciais);

  const carregarModelosAtivos = useCallback(async () => {
    if (!usuario?.id_empresa) {
      setModelosAtivos([]);
      return;
    }

    const { data, error } = await supabase
      .from("tab_modelos_msg")
      .select("id, modelo_msg_titulo, modelo_msg, modelo_global")
      .eq("ativo", true)
      .or(`modelo_global.eq.true,id_empresa.eq.${usuario.id_empresa}`)
      .order("modelo_global", { ascending: false })
      .order("modelo_msg_titulo", { ascending: true });

    setModelosAtivos(error ? [] : ((data ?? []) as ModeloMensagemAtivo[]));
  }, [usuario?.id_empresa]);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    if (!usuario?.id_empresa) {
      setCampanhas([]);
      setClientes([]);
      setFilasPorCampanha({});
      setCarregando(false);
      return;
    }

    const [campanhasResult, clientesResult, destinatariosResult, filasResult] = await Promise.all([
      supabase
        .from("tab_campanha")
        .select("*")
        .eq("id_empresa", usuario.id_empresa)
        .order("criado_em", { ascending: false }),
      supabase
        .from("tab_cliente")
        .select("id_empresa, id_cliente, nome, dt_nascto, dt_pricomp, dt_ultcomp, ddd_celul, fone_celul, email_cont, permite_campanha, contato_restrito, tags")
        .eq("id_empresa", usuario.id_empresa)
        .order("nome", { ascending: true }),
      supabase
        .from("tab_campanha_clientes")
        .select("id_empresa, id_campanha, id_cliente, nome_cliente, telefone, email, status_envio")
        .eq("id_empresa", usuario.id_empresa),
      supabase
        .from("tb_msg_programadas")
        .select("id_origem, status, enviado, ativo")
        .eq("id_empresa", usuario.id_empresa)
        .eq("origem_modulo", "CAMPANHA"),
    ]);

    if (campanhasResult.error || clientesResult.error || destinatariosResult.error || filasResult.error) {
      setErro(
        campanhasResult.error?.message ||
          clientesResult.error?.message ||
          destinatariosResult.error?.message ||
          filasResult.error?.message ||
          "Não foi possível carregar campanhas.",
      );
      setCampanhas([]);
      setClientes([]);
      setDestinatariosPorCampanha({});
      setFilasPorCampanha({});
      setCarregando(false);
      return;
    }

    setCampanhas((campanhasResult.data ?? []).map(parseCampanha));
    setClientes((clientesResult.data ?? []) as ClienteCampanha[]);
    setDestinatariosPorCampanha(
      ((destinatariosResult.data ?? []) as Array<DestinatarioCampanha & { id_campanha: string }>).reduce(
        (acc, destinatario) => {
          acc[destinatario.id_campanha] = [...(acc[destinatario.id_campanha] ?? []), destinatario];
          return acc;
        },
        {} as Record<string, DestinatarioCampanha[]>,
      ),
    );
    setFilasPorCampanha(
      ((filasResult.data ?? []) as FilaCampanha[]).reduce((acc, fila) => {
        if (!fila.id_origem || fila.enviado || fila.ativo === false) return acc;
        if (["CANCELADO", "CANCELADA", "ERRO"].includes(String(fila.status ?? "").toUpperCase())) return acc;
        acc[fila.id_origem] = (acc[fila.id_origem] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    );
    setCarregando(false);
  }, [usuario?.id_empresa]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    void carregarModelosAtivos();
  }, [carregarModelosAtivos]);

  useEffect(() => {
    setTipoComunicacaoAberto(false);
  }, [etapa, modalAberto]);

  useEffect(() => {
    if (!modalAberto) return;

    const idsAptos = new Set(
      clientes
        .filter((cliente) => clienteAptoParaCanal(cliente, form.tipoComunicacao))
        .map((cliente) => cliente.id_cliente)
        .filter((id): id is number => id !== null),
    );

    setSelecionados((atuais) => {
      const validos = new Set([...atuais].filter((id) => idsAptos.has(id)));
      return validos.size === atuais.size ? atuais : validos;
    });
  }, [clientes, form.tipoComunicacao, modalAberto]);

  const cards = useMemo(() => {
    const contar = (status: StatusCampanha) => campanhas.filter((campanha) => campanha.status === status).length;
    return [
      { label: "TOTAL DE CAMPANHAS", value: campanhas.length, help: "Campanhas cadastradas", color: "azul", icon: "list", filtro: "todos" as const },
      { label: "RASCUNHOS", value: contar("rascunho"), help: "Campanhas em criação", color: "ciano", icon: "pending", filtro: "rascunho" as const },
      { label: "PROGRAMADAS", value: contar("programada"), help: "Aguardando envio", color: "azul", icon: "calendar", filtro: "programada" as const },
      { label: "ENVIANDO", value: contar("enviando"), help: "Em andamento", color: "laranja", icon: "sent", filtro: "enviando" as const },
      { label: "CONCLUÍDAS", value: contar("concluida"), help: "Finalizadas", color: "verde", icon: "sent", filtro: "concluida" as const },
      { label: "CANCELADAS", value: contar("cancelada"), help: "Canceladas", color: "vermelho", icon: "error", filtro: "cancelada" as const },
    ];
  }, [campanhas]);

  const campanhasExibidas = useMemo(() => {
    const busca = normalizarBusca(filtrosLista.busca);
    const inicio = filtrosLista.dataInicial ? new Date(`${filtrosLista.dataInicial}T00:00:00`) : null;
    const fim = filtrosLista.dataFinal ? new Date(`${filtrosLista.dataFinal}T00:00:00`) : null;
    if (fim) fim.setDate(fim.getDate() + 1);

    return campanhas.filter((campanha) => {
      if (filtroStatus === "padrao" && !statusExibicaoPadrao.includes(campanha.status)) return false;
      if (filtroStatus !== "padrao" && filtroStatus !== "todos" && campanha.status !== filtroStatus) return false;
      if (busca && !normalizarBusca(campanha.nome).includes(busca)) return false;
      if (filtrosLista.tipoComunicacao !== "todos" && campanha.tipo_comunicacao !== filtrosLista.tipoComunicacao) return false;

      if (filtroStatus === "padrao" && (inicio || fim)) {
        const dataCriacao = new Date(campanha.data_hora_criacao || campanha.criado_em);
        if (Number.isNaN(dataCriacao.getTime())) return false;
        if (inicio && dataCriacao < inicio) return false;
        if (fim && dataCriacao >= fim) return false;
      }

      return true;
    });
  }, [campanhas, filtroStatus, filtrosLista]);

  const clientesFiltrados = useMemo(() => filtrarClientes(clientes, form), [clientes, form]);
  const clientesSelecionados = useMemo(
    () => clientes.filter((cliente) => cliente.id_cliente !== null && selecionados.has(cliente.id_cliente)),
    [clientes, selecionados],
  );
  const clientesAptosFiltrados = clientesFiltrados.filter(
    (cliente) => clienteAptoParaCanal(cliente, form.tipoComunicacao),
  );
  const clientesExibidos = clientesFiltrados;
  const ignoradosFiltrados = Math.max(0, clientesFiltrados.length - clientesAptosFiltrados.length);
  const aptosSelecionados = clientesSelecionados.filter((cliente) =>
    clienteAptoParaCanal(cliente, form.tipoComunicacao),
  );
  const ignoradosSelecionados = Math.max(0, clientesSelecionados.length - aptosSelecionados.length);

  function abrirNovaCampanha() {
    setForm({ ...formInicial, dataHoraAgendamento: "" });
    setSelecionados(new Set());
    setEtapa(1);
    setModalAberto(true);
    setFeedback(null);
    setAvisoPublico(null);
    setErro(null);
    setModeloSelecionado("");
    void carregarModelosAtivos();
  }

  async function editarCampanha(campanha: Campanha) {
    setForm({
      id: campanha.id,
      nome: campanha.nome ?? "",
      objetivo: campanha.objetivo ?? "",
      publicoAlvo: campanha.publico_alvo ?? "Todos os clientes",
      tipoComunicacao: campanha.tipo_comunicacao,
      aosCuidados: campanha.aos_cuidados ?? "",
      empresaDestino: campanha.empresa_destino ?? "",
      automatizada: campanha.automatizada,
      tipoAutomacao: normalizarTipoAutomacao(campanha.tipo_automacao),
      campanhaContinua: campanha.campanha_continua ?? false,
      terminaEm: formatarDataInput(campanha.termina_em),
      automacaoStatus: campanha.automacao_status ?? (campanha.automatizada ? "ativa" : "inativa"),
      filtroPublico: (campanha.filtros_publico?.filtroPublico as FiltroPublico | undefined) ?? "todos",
      buscaCliente: "",
      buscaTag: "",
      tagsPublico: campanha.tags_publico ?? [],
      mensagem: campanha.mensagem ?? "",
      dataHoraAgendamento: formatarDataInput(campanha.data_hora_agendamento),
      intervaloEnvioSegundos: String(campanha.intervalo_envio_segundos ?? 30),
      arquivoNome: campanha.arquivo_nome ?? "",
      arquivoTipo: campanha.arquivo_tipo ?? "",
      arquivoUrl: campanha.arquivo_url ?? "",
      observacoes: campanha.observacoes ?? "",
    });
    setSelecionados(new Set((destinatariosPorCampanha[campanha.id] ?? []).map((item) => item.id_cliente)));
    setEtapa(1);
    setModalAberto(true);
    setFeedback(null);
    setAvisoPublico(null);
    setModeloSelecionado("");
    void carregarModelosAtivos();
  }

  function duplicarCampanha(campanha: Campanha) {
    setForm({
      ...formInicial,
      nome: `${campanha.nome} - cópia`,
      objetivo: campanha.objetivo ?? "",
      publicoAlvo: campanha.publico_alvo ?? "",
      tipoComunicacao: campanha.tipo_comunicacao,
      aosCuidados: campanha.aos_cuidados ?? "",
      empresaDestino: campanha.empresa_destino ?? "",
      automatizada: campanha.automatizada,
      tipoAutomacao: normalizarTipoAutomacao(campanha.tipo_automacao),
      campanhaContinua: campanha.campanha_continua ?? false,
      terminaEm: "",
      automacaoStatus: campanha.automatizada ? "ativa" : "inativa",
      filtroPublico: (campanha.filtros_publico?.filtroPublico as FiltroPublico | undefined) ?? "todos",
      tagsPublico: campanha.tags_publico ?? [],
      mensagem: campanha.mensagem ?? "",
      intervaloEnvioSegundos: String(campanha.intervalo_envio_segundos ?? 30),
      arquivoNome: campanha.arquivo_nome ?? "",
      arquivoTipo: campanha.arquivo_tipo ?? "",
      arquivoUrl: campanha.arquivo_url ?? "",
      observacoes: campanha.observacoes ?? "",
    });
    setSelecionados(new Set((destinatariosPorCampanha[campanha.id] ?? []).map((item) => item.id_cliente)));
    setEtapa(1);
    setModalAberto(true);
    setAvisoPublico(null);
    setModeloSelecionado("");
    void carregarModelosAtivos();
  }

  async function atualizarStatus(campanha: Campanha, status: StatusCampanha) {
    const { error } = await supabase
      .from("tab_campanha")
      .update({ status })
      .eq("id_empresa", usuario?.id_empresa)
      .eq("id", campanha.id);

    if (error) {
      setErro("Não foi possível atualizar o status da campanha.");
      return;
    }

    setFeedback("Status da campanha atualizado.");
    await carregarDados();
  }

  function alternarCliente(cliente: ClienteCampanha) {
    if (cliente.id_cliente === null) return;
    const novaSelecao = new Set(selecionados);

    if (novaSelecao.has(cliente.id_cliente)) {
      novaSelecao.delete(cliente.id_cliente);
      setAvisoPublico(null);
    } else {
      const motivoBloqueio = obterMotivoBloqueioCliente(cliente, form.tipoComunicacao);
      if (motivoBloqueio) {
        setAvisoPublico({ tipo: "erro", mensagem: motivoBloqueio });
        return;
      }
      novaSelecao.add(cliente.id_cliente);
      setAvisoPublico(null);
    }

    setSelecionados(novaSelecao);
  }

  function selecionarFiltrados() {
    const aptos = clientesFiltrados.filter(
      (cliente) => cliente.id_cliente !== null && obterMotivoBloqueioCliente(cliente, form.tipoComunicacao) === null,
    );
    const ignorados = clientesFiltrados.length - aptos.length;

    setSelecionados(new Set(aptos.map((cliente) => cliente.id_cliente).filter((id): id is number => id !== null)));
    setAvisoPublico({
      tipo: "sucesso",
      mensagem: `${aptos.length} cliente(s) selecionado(s). ${ignorados} ignorado(s) por dados inválidos ou restrição.`,
    });
  }

  function irParaEtapa(proximaEtapa: number) {
    if (proximaEtapa === 2 && form.automatizada) {
      const filtroAptos = filtrosPublico.find((item) => item.value === "campanha_permitida")!;
      const formPublico: FormCampanha = {
        ...form,
        filtroPublico: "campanha_permitida",
        publicoAlvo: labelFiltroPublico(filtroAptos, form.tipoComunicacao),
      };
      const candidatos = filtrarClientes(clientes, formPublico);
      const aptos = candidatos.filter(
        (cliente) => cliente.id_cliente !== null && clienteAptoParaCanal(cliente, form.tipoComunicacao),
      );
      const ignorados = Math.max(0, candidatos.length - aptos.length);

      setForm(formPublico);
      setSelecionados(new Set());
      setAvisoPublico({
        tipo: "sucesso",
        mensagem: `Prévia atualizada: ${aptos.length} cliente(s) apto(s) agora e ${ignorados} ignorado(s).`,
      });
    } else if (proximaEtapa === 2) {
      setAvisoPublico(null);
    }

    setEtapa(proximaEtapa);
  }

  function limparSelecao() {
    setSelecionados(new Set());
    setAvisoPublico(null);
  }

  function selecionarArquivo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm({ ...form, arquivoNome: file.name, arquivoTipo: file.type || "application/octet-stream", arquivoUrl: "" });
  }

  function aplicarModeloMensagem(idModelo: string) {
    if (!idModelo) {
      setModeloSelecionado("");
      return;
    }

    const modelo = modelosAtivos.find((item) => item.id === idModelo);
    if (!modelo) return;

    if (form.mensagem.trim() && !window.confirm("Deseja substituir a mensagem atual pelo modelo selecionado?")) {
      return;
    }

    setModeloSelecionado(idModelo);
    setForm({ ...form, mensagem: modelo.modelo_msg });
  }

  function validarFormulario(status: StatusCampanha) {
    if (!form.nome.trim()) return "Informe o nome da campanha.";
    if (!form.tipoComunicacao) return "Informe o tipo de comunicação.";
    if (form.automatizada && form.tipoComunicacao !== "whatsapp") return "Campanhas automatizadas devem usar o canal WhatsApp.";
    if (form.automatizada && !tiposAutomacao.some((item) => item.value === normalizarTipoAutomacao(form.tipoAutomacao))) {
      return "Informe o tipo de automação.";
    }
    if (!form.mensagem.trim()) return "Informe a mensagem da campanha.";
    if (status === "programada" && !form.dataHoraAgendamento) return "Informe data e hora de agendamento.";
    if (form.automatizada && !form.campanhaContinua) {
      if (!form.terminaEm) return "Informe quando a campanha automatizada termina ou marque Campanha contínua.";
      const termino = new Date(form.terminaEm);
      if (Number.isNaN(termino.getTime()) || termino.getTime() <= Date.now()) return "A data de término deve ser futura.";
      if (form.dataHoraAgendamento && termino.getTime() <= new Date(form.dataHoraAgendamento).getTime()) {
        return "A data de término deve ser posterior ao início da automação.";
      }
    }
    if (!form.automatizada && aptosSelecionados.length === 0) return "Selecione ao menos um cliente apto para a campanha.";
    return null;
  }

  async function salvarCampanha(status: StatusCampanha) {
    const erroValidacao = validarFormulario(status);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    if (!usuario?.id_empresa) {
      setErro("Empresa da sessão não identificada.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const clientesParaSalvar = form.automatizada ? [] : aptosSelecionados;
    const aptos = clientesParaSalvar.filter((cliente) => clienteAptoParaCanal(cliente, form.tipoComunicacao));

    const campanhaPayload = {
      id_empresa: usuario.id_empresa,
      nome: form.nome.trim(),
      objetivo: form.objetivo.trim() || null,
      publico_alvo: form.publicoAlvo.trim() || filtrosPublico.find((item) => item.value === form.filtroPublico)?.label || null,
      filtros_publico: {
        filtroPublico: form.filtroPublico,
        buscaCliente: form.buscaCliente,
        buscaTag: form.buscaTag,
        selecionados: clientesParaSalvar.length,
      },
      tags_publico: form.tagsPublico,
      mensagem: form.mensagem.trim(),
      id_modelo_mensagem: null,
      tipo_comunicacao: form.tipoComunicacao,
      status,
      automatizada: form.automatizada,
      publico_dinamico: form.automatizada,
      tipo_automacao: form.automatizada ? normalizarTipoAutomacao(form.tipoAutomacao) : null,
      campanha_continua: form.automatizada ? form.campanhaContinua : false,
      termina_em: form.automatizada && !form.campanhaContinua && form.terminaEm
        ? new Date(form.terminaEm).toISOString()
        : null,
      automacao_status: form.automatizada
        ? status === "rascunho" ? "inativa" : form.id ? form.automacaoStatus : "ativa"
        : "inativa",
      data_hora_agendamento: form.dataHoraAgendamento ? new Date(form.dataHoraAgendamento).toISOString() : null,
      intervalo_envio_segundos: Number(form.intervaloEnvioSegundos) || 30,
      arquivo_url: form.arquivoUrl || null,
      arquivo_nome: form.arquivoNome || null,
      arquivo_tipo: form.arquivoTipo || null,
      aos_cuidados: form.aosCuidados.trim() || null,
      empresa_destino: form.empresaDestino.trim() || null,
      observacoes: form.observacoes.trim() || null,
      total_destinatarios: form.automatizada ? clientesAptosFiltrados.length : aptos.length,
      percentual_envio: 0,
    };

    const query = form.id
      ? supabase.from("tab_campanha").update(campanhaPayload).eq("id_empresa", usuario.id_empresa).eq("id", form.id).select("*").single()
      : supabase.from("tab_campanha").insert(campanhaPayload).select("*").single();

    const { data, error } = await query;
    if (error || !data) {
      setErro(error?.message || "Não foi possível salvar a campanha.");
      setSalvando(false);
      return;
    }

    const campanhaSalva = data as Campanha;

    await supabase
      .from("tab_campanha_clientes")
      .delete()
      .eq("id_empresa", usuario.id_empresa)
      .eq("id_campanha", campanhaSalva.id);

    const destinatarios = clientesParaSalvar
      .filter((cliente) => cliente.id_cliente !== null)
      .map((cliente) => {
        const apto = clienteAptoParaCanal(cliente, form.tipoComunicacao);
        return {
          id_empresa: usuario.id_empresa,
          id_campanha: campanhaSalva.id,
          id_cliente: cliente.id_cliente!,
          nome_cliente: cliente.nome,
          telefone: formatarTelefone(cliente) === "-" ? null : formatarTelefone(cliente),
          email: cliente.email_cont,
          status_envio: apto ? "pendente" : "ignorado",
          mensagem_personalizada: null,
          erro_envio: apto ? null : "Cliente sem permissão, restrito ou sem telefone válido.",
        };
      });

    if (destinatarios.length > 0) {
      const { error: destinatariosError } = await supabase.from("tab_campanha_clientes").insert(destinatarios);
      if (destinatariosError) {
        setErro(destinatariosError.message);
        setSalvando(false);
        return;
      }
    }

    let totalFilaEnvio = 0;
    const deveCriarFilaWhatsapp =
      status === "programada" &&
      !form.automatizada &&
      form.tipoComunicacao.toLowerCase() === "whatsapp" &&
      Boolean(form.dataHoraAgendamento);

    if (deveCriarFilaWhatsapp || status === "rascunho") {
      const { error: cancelarFilaError } = await supabase
        .from("tb_msg_programadas")
        .update({
          status: "CANCELADO",
          ativo: false,
          erro_envio: "Reprogramado pela edição da campanha.",
        })
        .eq("id_empresa", usuario.id_empresa)
        .eq("origem_modulo", "CAMPANHA")
        .eq("id_origem", campanhaSalva.id)
        .eq("enviado", false);

      if (cancelarFilaError) {
        setErro("Campanha salva, mas não foi possível criar a fila de envio.");
        setSalvando(false);
        return;
      }

      if (!deveCriarFilaWhatsapp) {
        setFeedback("Campanha salva como rascunho.");
        setModalAberto(false);
        setSalvando(false);
        await carregarDados();
        return;
      }

      const { dataEnvio, horaEnvio } = separarDataHoraAgendamento(form.dataHoraAgendamento);
      const executarEm = new Date(form.dataHoraAgendamento).toISOString();
      const registrosFila = clientesParaSalvar
        .filter((cliente) => cliente.id_cliente !== null)
        .map((cliente) => {
          const telefone = telefoneNormalizado(cliente);
          if (!telefone) return null;
          if (!clienteAptoWhatsapp(cliente)) return null;

          return {
            id_empresa: usuario.id_empresa,
            origem_modulo: "CAMPANHA",
            id_origem: campanhaSalva.id,
            titulo: campanhaSalva.nome,
            descricao: campanhaSalva.objetivo,
            destinatario_nome: cliente.nome,
            destinatario_telefone: telefone,
            mensagem: aplicarVariaveisMensagem(form.mensagem.trim(), cliente, form),
            tipo_agendamento: "UNICO",
            data_envio: dataEnvio,
            hora_envio: horaEnvio,
            executar_em: executarEm,
            repetir: false,
            tipo_repeticao: null,
            intervalo_repeticao: null,
            quantidade_repeticoes: null,
            data_fim_repeticao: null,
            status: "AGENDADO",
            enviado: false,
            erro_envio: null,
            ativo: true,
          };
        })
        .filter((registro): registro is NonNullable<typeof registro> => registro !== null);

      if (registrosFila.length > 0) {
        const { error: filaError } = await supabase.from("tb_msg_programadas").insert(registrosFila);

        if (filaError) {
          setErro("Campanha salva, mas não foi possível criar a fila de envio.");
          setSalvando(false);
          return;
        }
      }

      totalFilaEnvio = registrosFila.length;
    }

    setFeedback(
      form.automatizada
        ? "Campanha automatizada salva e adicionada ao monitoramento de automações."
        : deveCriarFilaWhatsapp
        ? `Campanha programada com sucesso. ${totalFilaEnvio} mensagem(ns) adicionada(s) à fila de envio.`
        : status === "programada"
          ? "Campanha programada com sucesso."
          : "Campanha salva como rascunho.",
    );
    setModalAberto(false);
    setSalvando(false);
    await carregarDados();
  }

  return (
    <main className="page-shell campaigns-page">
      <header className="page-header">
        <div>
          <h1>Campanhas/Promoções</h1>
          <p>Crie, programe e acompanhe campanhas para seus clientes.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={carregarDados} disabled={carregando}>
            Atualizar
          </button>
          <button className="primary-button" type="button" onClick={abrirNovaCampanha}>
            Nova campanha
          </button>
        </div>
      </header>

      <section className="summary-grid campaigns-card-grid" aria-label="Resumo de campanhas">
        {cards.map((card) => {
          const ativo =
            filtroStatus === card.filtro ||
            (filtroStatus === "padrao" && card.filtro !== "todos" && statusExibicaoPadrao.includes(card.filtro));

          return (
          <button
            className={`summary-card summary-card-${card.color} campaign-summary-filter${ativo ? " campaign-summary-filter-active" : ""}`}
            type="button"
            key={card.label}
            aria-pressed={ativo}
            onClick={() => setFiltroStatus(card.filtro)}
          >
            <div>
              <span>{card.label}</span>
              <strong>{carregando ? "..." : card.value}</strong>
              <small>{card.help}</small>
            </div>
            <div className="summary-card-icon" aria-hidden="true">
              <MetricCardIcon type={card.icon} />
            </div>
          </button>
          );
        })}
      </section>

      <section className="history-filters-panel campaign-list-filters" aria-label="Filtros de campanhas">
        <div className="history-filters-grid campaign-list-filters-grid">
          <label>
            <span>Buscar</span>
            <input
              type="search"
              value={filtrosLista.busca}
              onChange={(event) => setFiltrosLista({ ...filtrosLista, busca: event.target.value })}
              placeholder="Nome da campanha"
            />
          </label>
          <label>
            <span>Data inicial</span>
            <input
              type="date"
              value={filtrosLista.dataInicial}
              onChange={(event) => setFiltrosLista({ ...filtrosLista, dataInicial: event.target.value })}
            />
          </label>
          <label>
            <span>Data final</span>
            <input
              type="date"
              value={filtrosLista.dataFinal}
              onChange={(event) => setFiltrosLista({ ...filtrosLista, dataFinal: event.target.value })}
            />
          </label>
          <label>
            <span>Tipo de comunicação</span>
            <select
              value={filtrosLista.tipoComunicacao}
              onChange={(event) => setFiltrosLista({ ...filtrosLista, tipoComunicacao: event.target.value as FiltrosListaCampanhas["tipoComunicacao"] })}
            >
              <option value="todos">Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
        </div>
      </section>

      {feedback && <div className="feedback-box feedback-success">{feedback}</div>}
      {erro && <div className="feedback-box feedback-error">{erro}</div>}

      <section className="results-section">
        <div className="section-title">
          <h2>Campanhas cadastradas</h2>
          <span>{campanhasExibidas.length} campanha(s)</span>
        </div>

        {carregando && <div className="state-box">Carregando campanhas...</div>}
        {!carregando && !erro && campanhas.length === 0 && <div className="state-box">Nenhuma campanha cadastrada.</div>}
        {!carregando && !erro && campanhas.length > 0 && campanhasExibidas.length === 0 && (
          <div className="state-box">Nenhuma campanha encontrada para os filtros selecionados.</div>
        )}

        {!carregando && campanhasExibidas.length > 0 && (
          <div className="table-wrap">
            <table className="campaigns-table">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Objetivo</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Progresso</th>
                  <th>Agendamento</th>
                  <th>Destinatários</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {campanhasExibidas.map((campanha) => (
                  <tr
                    className={`campaign-row-card campaign-row-card-${campanha.status}`}
                    key={campanha.id}
                    tabIndex={0}
                    onClick={() => setDetalhes(campanha)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setDetalhes(campanha);
                    }}
                  >
                    <td>
                      <strong>{campanha.nome}</strong>
                      <small>{campanha.automatizada ? "Automatizada" : "Manual/programada"}</small>
                    </td>
                    <td>{campanha.objetivo || "-"}</td>
                    <td>{tipoLabel(campanha.tipo_comunicacao)}</td>
                    <td>
                      <span className={statusClass(campanha.status)}>{statusLabels[campanha.status]}</span>
                      {campanha.status === "programada" && !filasPorCampanha[campanha.id] && (
                        <span className="campaign-queue-warning">Sem fila de envio</span>
                      )}
                    </td>
                    <td>
                      <div className="campaign-progress">
                        <span>{campanha.status === "enviando" ? `Enviando ${campanha.percentual_envio}%` : `${campanha.percentual_envio}%`}</span>
                        <div><span style={{ width: `${campanha.percentual_envio}%` }} /></div>
                      </div>
                    </td>
                    <td>{formatarDataHora(campanha.data_hora_agendamento)}</td>
                    <td>{campanha.total_destinatarios} cliente(s)</td>
                    <td>
                      <div className="actions-cell campaign-row-actions" onClick={(event) => event.stopPropagation()}>
                        <button className="table-icon-button" type="button" title="Ver" onClick={() => setDetalhes(campanha)}>
                          <CampaignModalIcon name="info" />
                        </button>
                        <button
                          className="table-icon-button"
                          type="button"
                          title="Editar"
                          disabled={!["rascunho", "programada", "pausada"].includes(campanha.status)}
                          onClick={() => void editarCampanha(campanha)}
                        >
                          <CampaignModalIcon name="edit" />
                        </button>
                        <button
                          className="table-icon-button"
                          type="button"
                          title="Pausar"
                          disabled={campanha.status !== "enviando"}
                          onClick={() => void atualizarStatus(campanha, "pausada")}
                        >
                          <CampaignModalIcon name="pause" />
                        </button>
                        <button
                          className="table-icon-button"
                          type="button"
                          title="Cancelar"
                          disabled={["cancelada", "concluida"].includes(campanha.status)}
                          onClick={() => void atualizarStatus(campanha, "cancelada")}
                        >
                          <CampaignModalIcon name="close" />
                        </button>
                        <button className="table-icon-button" type="button" title="Duplicar" onClick={() => duplicarCampanha(campanha)}>
                          <CampaignModalIcon name="copy" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAberto && (
        <div className="review-modal-backdrop campaign-modal-backdrop" role="presentation" onClick={salvando ? undefined : () => setModalAberto(false)}>
          <section
            className="review-modal campaign-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="campanha-form-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="campaign-modal-header">
              <div className="campaign-modal-title">
                <span className="campaign-modal-header-icon" aria-hidden="true">
                  <CampaignModalIcon name="megaphone" />
                </span>
                <div>
                  <h2 id="campanha-form-titulo">{form.id ? "Editar campanha" : "Nova campanha"}</h2>
                  <p>Etapa {etapa} de 4</p>
                </div>
              </div>
              <button className="campaign-modal-close" type="button" onClick={() => setModalAberto(false)} disabled={salvando} aria-label="Fechar">
                <CampaignModalIcon name="close" />
              </button>
            </header>

            <div className="campaign-stepper" aria-label="Etapas da campanha">
              {["Dados", "Público", "Mensagem", "Revisão"].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={etapa === index + 1 ? "campaign-step campaign-step-active" : "campaign-step"}
                  onClick={() => irParaEtapa(index + 1)}
                >
                  <span>{index + 1}</span>
                  <strong>{label}</strong>
                </button>
              ))}
            </div>

            <div className="campaign-form-body">
              {etapa === 1 && (
                <section className="campaign-form-grid">
                  <label className="campaign-full-field">
                    <span>Nome da campanha</span>
                    <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} disabled={salvando} />
                  </label>
                  <label className="campaign-full-field">
                    <span>Objetivo da campanha</span>
                    <textarea value={form.objetivo} onChange={(event) => setForm({ ...form, objetivo: event.target.value })} disabled={salvando} />
                  </label>
                  <div className="campaign-channel-field">
                    <span className="campaign-channel-label">Tipo de comunicação</span>
                    <div className="campaign-channel-listbox">
                      <button
                        className="campaign-channel-trigger"
                         type="button"
                         onClick={() => setTipoComunicacaoAberto((aberto) => !aberto)}
                         disabled={salvando || form.automatizada}
                        role="combobox"
                        aria-expanded={tipoComunicacaoAberto}
                        aria-controls="campaign-channel-options"
                      >
                        <span className="campaign-channel-selected">
                          <CampaignChannelIcon type={form.tipoComunicacao} />
                          {tipoLabel(form.tipoComunicacao)}
                        </span>
                        <span className="campaign-channel-chevron"><CampaignModalIcon name="next" /></span>
                      </button>
                      {tipoComunicacaoAberto && (
                        <div className="campaign-channel-menu" id="campaign-channel-options" role="listbox">
                          {(["whatsapp", "email", "instagram"] as TipoComunicacao[]).map((tipo) => (
                            <button
                              className={`campaign-channel-menu-option${form.tipoComunicacao === tipo ? " campaign-channel-menu-option-active" : ""}`}
                              type="button"
                              role="option"
                              aria-selected={form.tipoComunicacao === tipo}
                              key={tipo}
                              onClick={() => {
                                setForm({ ...form, tipoComunicacao: tipo });
                                setTipoComunicacaoAberto(false);
                              }}
                            >
                              <CampaignChannelIcon type={tipo} />
                              <span>{tipoLabel(tipo)}</span>
                              {form.tipoComunicacao === tipo && <strong>Selecionado</strong>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <label>
                    <span>Aos cuidados</span>
                    <input value={form.aosCuidados} onChange={(event) => setForm({ ...form, aosCuidados: event.target.value })} disabled={salvando} />
                  </label>
                  <label>
                    <span>Empresa</span>
                    <input value={form.empresaDestino} onChange={(event) => setForm({ ...form, empresaDestino: event.target.value })} disabled={salvando} />
                  </label>
                  <label className="campaign-full-field">
                    <span>Automatizada</span>
                    <select
                      value={form.automatizada ? "sim" : "nao"}
                      onChange={(event) => {
                        const automatizada = event.target.value === "sim";
                        setTipoComunicacaoAberto(false);
                        setForm({
                          ...form,
                          automatizada,
                          tipoComunicacao: automatizada ? "whatsapp" : form.tipoComunicacao,
                          tipoAutomacao: automatizada ? form.tipoAutomacao : "",
                          campanhaContinua: automatizada ? form.campanhaContinua : false,
                          terminaEm: automatizada ? form.terminaEm : "",
                          automacaoStatus: automatizada ? "ativa" : "inativa",
                        });
                      }}
                      disabled={salvando}
                    >
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </label>
                  {form.automatizada && (
                    <label>
                      <span>Tipo de automação</span>
                      <select value={form.tipoAutomacao} onChange={(event) => setForm({ ...form, tipoAutomacao: event.target.value })}>
                        <option value="">Selecione</option>
                        {tiposAutomacao.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  )}
                </section>
              )}

              {etapa === 2 && (
                <section className="campaign-audience-layout">
                  {form.automatizada && (
                    <div className="campaign-dynamic-audience-intro">
                      <div>
                        <h3>Público dinâmico da automação</h3>
                        <strong>Regra aplicada: {labelTipoAutomacao(form.tipoAutomacao)}</strong>
                      </div>
                      <p>Este público é dinâmico. A lista abaixo é apenas uma prévia com base nos clientes cadastrados agora. Novos clientes que se enquadrarem nesta regra serão incluídos automaticamente quando a automação for executada.</p>
                    </div>
                  )}
                  <div className="campaign-audience-filters">
                    <label>
                      <span>Filtro rápido</span>
                      <select
                        value={form.filtroPublico}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            filtroPublico: event.target.value as FiltroPublico,
                            publicoAlvo: (() => {
                              const filtro = filtrosPublico.find((item) => item.value === event.target.value);
                              return filtro ? labelFiltroPublico(filtro, form.tipoComunicacao) : form.publicoAlvo;
                            })(),
                          })
                        }
                      >
                        {filtrosPublico.map((filtro) => (
                          <option value={filtro.value} key={filtro.value}>
                            {labelFiltroPublico(filtro, form.tipoComunicacao)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Buscar cliente</span>
                      <input
                        value={form.buscaCliente}
                        onChange={(event) => setForm({ ...form, buscaCliente: event.target.value })}
                        placeholder="Nome, código, telefone ou e-mail"
                      />
                    </label>
                    <label>
                      <span>Buscar por tag</span>
                      <input value={form.buscaTag} onChange={(event) => setForm({ ...form, buscaTag: event.target.value })} placeholder="Tag" />
                    </label>
                    <div className="campaign-audience-actions campaign-full-field">
                      {form.automatizada ? (
                        <button className="secondary-button" type="button" onClick={() => void carregarDados()} disabled={carregando}>
                          <CampaignModalIcon name="filter" />
                          Atualizar prévia
                        </button>
                      ) : (
                        <>
                          <button className="secondary-button" type="button" onClick={selecionarFiltrados}>
                            <CampaignModalIcon name="filter" />
                            Selecionar filtrados
                          </button>
                          <button className="secondary-button" type="button" onClick={limparSelecao}>
                            <CampaignModalIcon name="trash" />
                            Limpar seleção
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {avisoPublico && (
                    <div
                      className={`campaign-audience-notice campaign-audience-notice-${avisoPublico.tipo}`}
                      role={avisoPublico.tipo === "erro" ? "alert" : "status"}
                    >
                      {avisoPublico.mensagem}
                    </div>
                  )}

                  <div className="campaign-audience-summary">
                    <span>{form.automatizada ? "Encontrados agora" : "Encontrados"}: {clientesFiltrados.length}</span>
                    {!form.automatizada && <span>Selecionados: {aptosSelecionados.length}</span>}
                    <span>{form.automatizada ? "Aptos para WhatsApp agora" : "Aptos"}: {clientesAptosFiltrados.length}</span>
                    <span>{form.automatizada ? "Ignorados agora" : "Ignorados"}: {ignoradosFiltrados}</span>
                  </div>

                  <div className="table-wrap campaign-clients-wrap">
                    <table className="campaign-clients-table">
                      <colgroup>
                        {!form.automatizada && <col className="campaign-client-col-select" />}
                        <col className="campaign-client-col-code" />
                        <col className="campaign-client-col-name" />
                        <col className="campaign-client-col-phone" />
                        <col className="campaign-client-col-email" />
                        <col />
                        <col />
                        <col className="campaign-client-col-status" />
                        <col />
                        <col className="campaign-client-col-tags" />
                      </colgroup>
                      <thead>
                        <tr>
                          {!form.automatizada && <th>
                            <input
                              type="checkbox"
                              aria-label="Selecionar todos os clientes filtrados"
                              checked={
                                clientesAptosFiltrados.length > 0 &&
                                clientesAptosFiltrados.every(
                                  (cliente) => cliente.id_cliente !== null && selecionados.has(cliente.id_cliente),
                                )
                              }
                              onChange={(event) => {
                                if (event.target.checked) selecionarFiltrados();
                                else limparSelecao();
                              }}
                              disabled={clientesAptosFiltrados.length === 0}
                            />
                          </th>}
                          <th>Código</th>
                          <th>Nome</th>
                          <th>Celular</th>
                          <th>E-mail</th>
                          <th>Nascimento</th>
                          <th>Última compra</th>
                          <th>Situação</th>
                          <th>Motivo</th>
                          <th>Tags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesExibidos.length === 0 && (
                          <tr><td colSpan={form.automatizada ? 9 : 10}>Nenhum cliente encontrado.</td></tr>
                        )}
                        {clientesExibidos.map((cliente) => {
                          const situacao = situacaoCliente(cliente, form.tipoComunicacao);
                          const idCliente = cliente.id_cliente;
                          const motivoBloqueio = obterMotivoBloqueioCliente(cliente, form.tipoComunicacao);
                          const bloqueio = obterBloqueioCliente(cliente, form.tipoComunicacao);
                          return (
                            <tr key={`${cliente.id_empresa}-${cliente.id_cliente}`}>
                              {!form.automatizada && <td>
                                <input
                                  className={motivoBloqueio ? "campaign-client-checkbox-blocked" : undefined}
                                  type="checkbox"
                                  checked={idCliente !== null && selecionados.has(idCliente)}
                                  onChange={() => alternarCliente(cliente)}
                                  disabled={idCliente === null}
                                  aria-disabled={Boolean(motivoBloqueio)}
                                  title={motivoBloqueio ?? "Selecionar cliente"}
                                />
                              </td>}
                              <td>{cliente.id_cliente ?? "-"}</td>
                              <td>{cliente.nome ?? "-"}</td>
                              <td>{formatarTelefone(cliente)}</td>
                              <td>{cliente.email_cont ?? "-"}</td>
                              <td>{formatarDataSimples(cliente.dt_nascto)}</td>
                              <td>{formatarDataSimples(cliente.dt_ultcomp)}</td>
                              <td>
                                <span
                                  className={`campaign-client-status ${situacao.className}`}
                                  title={tituloSituacaoCliente(cliente, form.tipoComunicacao)}
                                >
                                  {situacao.label}
                                </span>
                              </td>
                              <td>{bloqueio?.label ?? "-"}</td>
                              <td>{cliente.tags?.length ? cliente.tags.join(", ") : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {etapa === 3 && (
                <section className="campaign-form-grid">
                  <label className="campaign-full-field campaign-template-field">
                    <span>Selecionar modelo de mensagem</span>
                    <select value={modeloSelecionado} onChange={(event) => aplicarModeloMensagem(event.target.value)}>
                      <option value="">Nenhum modelo</option>
                      {modelosAtivos.map((modelo) => (
                        <option value={modelo.id} key={modelo.id}>
                          [{modelo.modelo_global ? "Global" : "Empresa"}] {modelo.modelo_msg_titulo}
                        </option>
                      ))}
                    </select>
                    {modelosAtivos.length === 0 && (
                      <small>Nenhum modelo cadastrado. Cadastre modelos em Campanhas/Promoções &gt; Modelos.</small>
                    )}
                  </label>
                  <label className="campaign-full-field">
                    <span>Mensagem da campanha</span>
                    <textarea
                      className="campaign-message-input"
                      value={form.mensagem}
                      onChange={(event) => setForm({ ...form, mensagem: event.target.value })}
                      placeholder="Olá, {{nome}}! Temos uma promoção especial para você."
                      disabled={salvando}
                    />
                  </label>
                  <p className="field-help campaign-full-field">
                    A mensagem continuará editável. Variáveis disponíveis: {"{{nome}}"}, {"{{cliente}}"}, {"{{empresa}}"}, {"{{documento}}"}, {"{{data_atual}}"}, {"{{ultima_compra}}"} e {"{{primeira_compra}}"}.
                  </p>
                  <label className="campaign-upload-field">
                    <span>Arquivo ou imagem</span>
                    <input type="file" onChange={selecionarArquivo} disabled={salvando} />
                  </label>
                  <label>
                    <span>Arquivo selecionado</span>
                    <input value={form.arquivoNome || "-"} readOnly />
                  </label>
                  <label className="campaign-full-field">
                    <span>Observações</span>
                    <textarea value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} />
                  </label>
                </section>
              )}

              {etapa === 4 && (
                <section className="campaign-review-grid">
                  <label>
                    <span>Data e hora de criação</span>
                    <input value={formatarDataHora(new Date().toISOString())} readOnly />
                  </label>
                  <label>
                    <span>{form.automatizada ? "Início da automação" : "Data e hora de envio/agendamento"}</span>
                    <input
                      type="datetime-local"
                      value={form.dataHoraAgendamento}
                      onChange={(event) => setForm({ ...form, dataHoraAgendamento: event.target.value })}
                    />
                  </label>
                  {form.automatizada && (
                    <>
                      <label>
                        <span>Termina em</span>
                        <input
                          type="datetime-local"
                          value={form.terminaEm}
                          onChange={(event) => setForm({ ...form, terminaEm: event.target.value })}
                          disabled={form.campanhaContinua}
                        />
                      </label>
                      <label className="campaign-automation-continuous">
                        <span>Campanha contínua</span>
                        <div>
                          <input
                            type="checkbox"
                            checked={form.campanhaContinua}
                            onChange={(event) => setForm({ ...form, campanhaContinua: event.target.checked, terminaEm: event.target.checked ? "" : form.terminaEm })}
                          />
                          <small>Sem data de término</small>
                        </div>
                      </label>
                    </>
                  )}
                  <label>
                    <span>Intervalo entre envios (segundos)</span>
                    <input
                      type="number"
                      min="0"
                      value={form.intervaloEnvioSegundos}
                      onChange={(event) => setForm({ ...form, intervaloEnvioSegundos: event.target.value })}
                    />
                  </label>
                  <div className="campaign-review-card">
                    <strong>{form.nome || "Campanha sem nome"}</strong>
                    <span>{tipoLabel(form.tipoComunicacao)} · {form.publicoAlvo || "-"}</span>
                    <p>{form.automatizada
                      ? `Automatizada: Sim · ${labelTipoAutomacao(form.tipoAutomacao)} · ${form.campanhaContinua ? "Campanha contínua" : `Termina em ${formatarDataHora(form.terminaEm ? new Date(form.terminaEm).toISOString() : null)}`}`
                      : form.objetivo || "-"}</p>
                  </div>
                  <div className="campaign-review-card">
                    <strong>{form.automatizada ? "Prévia do público dinâmico" : "Público selecionado"}</strong>
                    <span>{form.automatizada
                      ? `Encontrados agora: ${clientesFiltrados.length} · Aptos agora: ${clientesAptosFiltrados.length} · Ignorados agora: ${ignoradosFiltrados}`
                      : `Total: ${clientesSelecionados.length} · Aptos: ${aptosSelecionados.length} · Ignorados: ${ignoradosSelecionados}`}</span>
                    <p>{form.automatizada ? "A execução buscará novamente os clientes que atenderem à regra." : form.mensagem || "-"}</p>
                  </div>
                </section>
              )}
            </div>

            <footer className={`campaign-modal-footer campaign-modal-footer-step-${etapa}`}>
              <button className="secondary-button" type="button" onClick={() => setModalAberto(false)} disabled={salvando}>Cancelar</button>
              {etapa > 1 && (
                <button className="secondary-button" type="button" onClick={() => setEtapa(etapa - 1)} disabled={salvando}>
                  <CampaignModalIcon name="back" />
                  Voltar
                </button>
              )}
              {etapa < 4 && (
                <button className="primary-button" type="button" onClick={() => irParaEtapa(etapa + 1)} disabled={salvando}>
                  Avançar
                  <CampaignModalIcon name="next" />
                </button>
              )}
              {etapa === 4 && (
                <>
                  <button className="secondary-button" type="button" onClick={() => void salvarCampanha("rascunho")} disabled={salvando}>
                    <CampaignModalIcon name="save" />
                    Salvar rascunho
                  </button>
                  <button className="primary-button" type="button" onClick={() => void salvarCampanha("programada")} disabled={salvando}>
                    {salvando ? "Salvando..." : form.automatizada ? "Ativar automação" : "Programar campanha"}
                    {!salvando && <CampaignModalIcon name="next" />}
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}

      {detalhes && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetalhes(null)}>
          <aside className="details-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="details-header">
              <div>
                <h2>{detalhes.nome}</h2>
                <p>{statusLabels[detalhes.status]} · {tipoLabel(detalhes.tipo_comunicacao)}</p>
              </div>
              <button type="button" onClick={() => setDetalhes(null)}>Fechar</button>
            </header>
            <section className="details-section">
              <h3>Resumo</h3>
              <dl className="details-grid">
                <div><dt>Objetivo</dt><dd>{detalhes.objetivo ?? "-"}</dd></div>
                <div><dt>Público</dt><dd>{detalhes.publico_alvo ?? "-"}</dd></div>
                <div><dt>Agendamento</dt><dd>{formatarDataHora(detalhes.data_hora_agendamento)}</dd></div>
                <div><dt>Progresso</dt><dd>{detalhes.percentual_envio}%</dd></div>
                <div><dt>Destinatários</dt><dd>{detalhes.total_destinatarios}</dd></div>
                <div><dt>Intervalo</dt><dd>{detalhes.intervalo_envio_segundos}s</dd></div>
              </dl>
            </section>
            <section className="details-section">
              <h3>Mensagem</h3>
              <p className="scheduled-detail-text">{detalhes.mensagem ?? "-"}</p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
