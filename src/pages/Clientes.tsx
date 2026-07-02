import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabaseClient";

type FiltroSituacao =
  | "todos"
  | "campanha_permitida"
  | "campanha_nao_permitida"
  | "telefone_invalido"
  | "contato_restrito"
  | "aniversariantes_mes"
  | "sem_compra_90_dias";

type ClienteResumoIcone =
  | "users"
  | "phone-off"
  | "ban"
  | "check-circle"
  | "x-circle"
  | "cake"
  | "history";

interface ClienteSincronizado {
  id_empresa: string | null;
  id_cliente: string | number | null;
  dt_cadastro: string | null;
  dt_nascto: string | null;
  nome: string | null;
  dt_pricomp: string | null;
  dt_ultcomp: string | null;
  ddd_celul: string | null;
  fone_celul: string | null;
  email_cont: string | null;
  sincronizado_em: string | null;
  permite_campanha: boolean | null;
  permite_cobranca_aviso: boolean | null;
  contato_restrito: boolean | null;
  motivo_restricao: string | null;
  restrito_em: string | null;
  atualizado_em: string | null;
}

interface SituacaoCliente {
  tipo: "campanha_permitida" | "campanha_nao_permitida" | "telefone_invalido" | "contato_restrito";
  label: string;
  className: string;
}

interface SituacaoMovimentoCliente {
  label: string;
  className: string;
}

const motivosRestricao = [
  "Cliente pediu para não receber mensagens",
  "Telefone incorreto ou não pertence ao cliente",
  "Reclamação",
  "Bloqueio manual",
  "Outro",
];

function normalizarBusca(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarTelefoneCliente(cliente: ClienteSincronizado) {
  return `${cliente.ddd_celul ?? ""}${cliente.fone_celul ?? ""}`.replace(/\D/g, "");
}

function telefoneValido(cliente: ClienteSincronizado) {
  const telefone = normalizarTelefoneCliente(cliente);
  return telefone.length >= 10 && telefone.length <= 11;
}

function formatarData(valor: string | null) {
  if (!valor) return "-";

  const [ano, mes, dia] = valor.split("T")[0].split("-");
  if (!ano || !mes || !dia) return "-";

  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor: string | null) {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return formatarData(valor);

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarValor(valor: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function formatarTelefone(cliente: ClienteSincronizado) {
  const ddd = String(cliente.ddd_celul ?? "").replace(/\D/g, "");
  const telefone = String(cliente.fone_celul ?? "").trim();

  if (!ddd && !telefone) return "-";
  if (!ddd) return telefone || "-";
  if (!telefone) return `(${ddd})`;

  return `(${ddd}) ${telefone}`;
}

function obterSituacaoCliente(cliente: ClienteSincronizado): SituacaoCliente {
  if (cliente.contato_restrito) {
    return {
      tipo: "contato_restrito",
      label: "Contato Restrito",
      className: "client-status client-status-restricted",
    };
  }

  if (!telefoneValido(cliente)) {
    return {
      tipo: "telefone_invalido",
      label: "Telefone Inválido",
      className: "client-status client-status-warning",
    };
  }

  if (cliente.permite_campanha) {
    return {
      tipo: "campanha_permitida",
      label: "Campanha Permitida",
      className: "client-status client-status-allowed",
    };
  }

  return {
    tipo: "campanha_nao_permitida",
    label: "Campanha não Permitida",
    className: "client-status client-status-neutral",
  };
}

function clienteAtendeBusca(cliente: ClienteSincronizado, busca: string) {
  const termo = normalizarBusca(busca);
  if (!termo) return true;

  return [
    cliente.nome,
    cliente.id_cliente,
    cliente.ddd_celul,
    cliente.fone_celul,
    formatarTelefone(cliente),
    cliente.email_cont,
  ].some((valor) => normalizarBusca(valor).includes(termo));
}

function clienteAtendeSituacao(cliente: ClienteSincronizado, filtro: FiltroSituacao) {
  if (filtro === "todos") return true;
  if (filtro === "aniversariantes_mes") return clienteDoMesAtual(cliente);
  if (filtro === "sem_compra_90_dias") return clienteSemCompraMaisDe90Dias(cliente);
  return obterSituacaoCliente(cliente).tipo === filtro;
}

function dataValida(valor: string | null) {
  if (!valor) return null;

  const [dataIso] = valor.split("T");
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const data = ano && mes && dia ? new Date(ano, mes - 1, dia) : new Date(valor);

  return Number.isNaN(data.getTime()) ? null : data;
}

function clienteDoMesAtual(cliente: ClienteSincronizado) {
  const nascimento = dataValida(cliente.dt_nascto);
  if (!nascimento) return false;

  const hoje = new Date();
  return nascimento.getMonth() === hoje.getMonth();
}

function clienteSemCompraMaisDe90Dias(cliente: ClienteSincronizado) {
  const ultimaCompra = dataValida(cliente.dt_ultcomp);
  if (!ultimaCompra) return false;

  const limite = new Date();
  limite.setDate(limite.getDate() - 90);

  return ultimaCompra < limite;
}

function obterSituacaoMovimentoCliente(cliente: ClienteSincronizado): SituacaoMovimentoCliente {
  const ultimaCompra = dataValida(cliente.dt_ultcomp);

  if (!ultimaCompra) {
    return {
      label: "Sem Compra",
      className: "client-status client-status-neutral",
    };
  }

  if (clienteSemCompraMaisDe90Dias(cliente)) {
    return {
      label: "Inativo +90 dias",
      className: "client-status client-status-warning",
    };
  }

  return {
    label: "Ativo",
    className: "client-status client-status-allowed",
  };
}

function ClienteResumoIcon({ tipo }: { tipo: ClienteResumoIcone }) {
  if (tipo === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (tipo === "phone-off") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.2 6.2 9 3H5a2 2 0 0 0-2 2c0 9.39 7.61 17 17 17a2 2 0 0 0 2-2v-4l-3.2-1.2" />
        <path d="M15 7v.01" />
        <path d="m2 2 20 20" />
      </svg>
    );
  }

  if (tipo === "ban") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m5.6 5.6 12.8 12.8" />
      </svg>
    );
  }

  if (tipo === "check-circle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.2 2.2 4.8-5.4" />
      </svg>
    );
  }

  if (tipo === "x-circle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-6 6" />
        <path d="m9 9 6 6" />
      </svg>
    );
  }

  if (tipo === "cake") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11h16v9H4z" />
        <path d="M4 15c2 1.3 4 1.3 6 0s4-1.3 6 0 4 1.3 6 0" />
        <path d="M12 3v4" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Clientes() {
  const { usuario, atualizarPermissoesCliente } = useAuth();
  const [clientes, setClientes] = useState<ClienteSincronizado[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>("todos");
  const [clienteEmEdicao, setClienteEmEdicao] = useState<ClienteSincronizado | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarClientes = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    if (!usuario?.id_empresa) {
      setClientes([]);
      setCarregando(false);
      return;
    }

    const { data, error } = await supabase
      .from("tab_cliente")
      .select(
        "id_empresa, id_cliente, dt_cadastro, dt_nascto, nome, dt_pricomp, dt_ultcomp, ddd_celul, fone_celul, email_cont, sincronizado_em, permite_campanha, permite_cobranca_aviso, contato_restrito, motivo_restricao, restrito_em, atualizado_em",
      )
      .eq("id_empresa", usuario.id_empresa)
      .order("nome", { ascending: true });

    if (error) {
      setClientes([]);
      setErro(error.message);
    } else {
      setClientes((data ?? []) as ClienteSincronizado[]);
    }

    setCarregando(false);
  }, [usuario?.id_empresa]);

  useEffect(() => {
    void carregarClientes();
  }, [carregarClientes]);

  const clientesFiltrados = useMemo(
    () =>
      clientes.filter(
        (cliente) => clienteAtendeBusca(cliente, busca) && clienteAtendeSituacao(cliente, filtroSituacao),
      ),
    [busca, clientes, filtroSituacao],
  );

  const resumoClientes = useMemo(() => {
    const situacoes = clientes.map((cliente) => obterSituacaoCliente(cliente).tipo);

    return [
      {
        titulo: "TOTAL DE CLIENTES",
        descricao: "Clientes cadastrados",
        valor: clientes.length,
        classe: "client-summary-primary",
        filtro: "todos" as const,
        icone: "users" as const,
      },
      {
        titulo: "SEM TELEFONE",
        descricao: "Clientes sem celular válido",
        valor: clientes.filter((cliente) => !telefoneValido(cliente)).length,
        classe: "client-summary-warning",
        filtro: "telefone_invalido" as const,
        icone: "phone-off" as const,
      },
      {
        titulo: "CLIENTES RESTRITOS",
        descricao: "Bloqueados para envio",
        valor: clientes.filter((cliente) => cliente.contato_restrito === true).length,
        classe: "client-summary-danger",
        filtro: "contato_restrito" as const,
        icone: "ban" as const,
      },
      {
        titulo: "CAMPANHA PERMITIDA",
        descricao: "Liberados para campanhas",
        valor: situacoes.filter((situacao) => situacao === "campanha_permitida").length,
        classe: "client-summary-success",
        filtro: "campanha_permitida" as const,
        icone: "check-circle" as const,
      },
      {
        titulo: "CAMPANHA NÃO PERMITIDA",
        descricao: "Não liberados para campanhas",
        valor: situacoes.filter((situacao) => situacao === "campanha_nao_permitida").length,
        classe: "client-summary-muted",
        filtro: "campanha_nao_permitida" as const,
        icone: "x-circle" as const,
      },
      {
        titulo: "ANIVERSARIANTES DO MÊS",
        descricao: "Clientes do mês atual",
        valor: clientes.filter(clienteDoMesAtual).length,
        classe: "client-summary-info",
        filtro: "aniversariantes_mes" as const,
        icone: "cake" as const,
      },
      {
        titulo: "SEM COMPRA HÁ MAIS DE 90 DIAS",
        descricao: "Sem movimentação recente",
        valor: clientes.filter(clienteSemCompraMaisDe90Dias).length,
        classe: "client-summary-orange",
        filtro: "sem_compra_90_dias" as const,
        icone: "history" as const,
      },
    ];
  }, [clientes]);

  function atualizarClienteNaLista(clienteAtualizado: ClienteSincronizado) {
    setClientes((atuais) =>
      atuais.map((cliente) =>
        String(cliente.id_cliente) === String(clienteAtualizado.id_cliente) &&
        cliente.id_empresa === clienteAtualizado.id_empresa
          ? { ...cliente, ...clienteAtualizado }
          : cliente,
      ),
    );
  }

  async function salvarPermissoes(
    cliente: ClienteSincronizado,
    valores: {
      permiteCampanha: boolean;
      permiteCobrancaAviso: boolean;
      contatoRestrito: boolean;
      motivoRestricao: string;
    },
  ) {
    if (cliente.id_cliente === null || cliente.id_cliente === undefined) {
      return {
        success: false,
        message: "Cliente não informado.",
      };
    }

    const resultado = await atualizarPermissoesCliente({
      idCliente: cliente.id_cliente,
      permiteCampanha: valores.permiteCampanha,
      permiteCobrancaAviso: valores.permiteCobrancaAviso,
      contatoRestrito: valores.contatoRestrito,
      motivoRestricao: valores.motivoRestricao || null,
    });

    if (resultado.success && resultado.cliente) {
      atualizarClienteNaLista(resultado.cliente as ClienteSincronizado);
      setFeedback("Permissões de contato atualizadas com sucesso.");
      setClienteEmEdicao(null);
    }

    return resultado;
  }

  return (
    <main className="clients-page">
      <header className="dashboard-header">
        <div>
          <h1>Clientes</h1>
          <p>Clientes sincronizados da base local Firebird.</p>
        </div>
        <button className="secondary-button" type="button" onClick={carregarClientes} disabled={carregando}>
          Atualizar
        </button>
      </header>

      <section className="clients-summary-grid" aria-label="Resumo de clientes">
        {resumoClientes.map((card) => (
          <button
            className={`client-summary-card ${card.classe}${filtroSituacao === card.filtro ? " client-summary-card-active" : ""}`}
            type="button"
            key={card.titulo}
            onClick={() => setFiltroSituacao(card.filtro)}
            aria-pressed={filtroSituacao === card.filtro}
          >
            <div className="client-summary-copy">
              <span>{card.titulo}</span>
              <strong>{carregando ? "..." : card.valor}</strong>
              <small>{card.descricao}</small>
            </div>
            <div className="client-summary-icon" aria-hidden="true">
              <ClienteResumoIcon tipo={card.icone} />
            </div>
          </button>
        ))}
      </section>

      <section className="history-filters-panel" aria-label="Filtros de clientes">
        <div className="clients-filters-grid">
          <label>
            <span>Buscar</span>
            <input
              type="search"
              placeholder="Nome, código, telefone ou e-mail"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </label>
        </div>
      </section>

      {feedback && <div className="feedback-box feedback-success">{feedback}</div>}

      <section className="results-section">
        <div className="section-title">
          <h2>Clientes sincronizados</h2>
          <span>{clientesFiltrados.length} cliente(s)</span>
        </div>

        {erro && <div className="state-box state-box-error">Erro ao carregar clientes.</div>}

        <div className="clients-card-list">
          {carregando && <div className="state-box">Carregando clientes...</div>}

          {!carregando && !erro && clientesFiltrados.length === 0 && (
            <div className="state-box">Nenhum cliente encontrado.</div>
          )}

          {!carregando &&
            !erro &&
            clientesFiltrados.map((cliente) => {
              const situacao = obterSituacaoMovimentoCliente(cliente);

              return (
                <article className="client-row-card" key={`${cliente.id_empresa}-${cliente.id_cliente}`}>
                  <div className="client-main-cell">
                    <span>Cliente {formatarValor(cliente.id_cliente)}</span>
                    <strong>{formatarValor(cliente.nome)}</strong>
                    <small>Sincronizado em {formatarDataHora(cliente.sincronizado_em)}</small>
                  </div>

                  <dl className="client-info-block">
                    <div>
                      <dt>Cadastro</dt>
                      <dd>{formatarData(cliente.dt_cadastro)}</dd>
                    </div>
                    <div>
                      <dt>Nascimento</dt>
                      <dd>{formatarData(cliente.dt_nascto)}</dd>
                    </div>
                  </dl>

                  <dl className="client-info-block">
                    <div>
                      <dt>Primeira Compra</dt>
                      <dd>{formatarData(cliente.dt_pricomp)}</dd>
                    </div>
                    <div>
                      <dt>Última Compra</dt>
                      <dd>{formatarData(cliente.dt_ultcomp)}</dd>
                    </div>
                  </dl>

                  <dl className="client-info-block client-action-block">
                    <div>
                      <dt>Situação</dt>
                      <dd>
                        <div className="client-status-list">
                          <span
                            className={`client-status ${
                              cliente.contato_restrito === true ? "client-status-restricted" : "client-status-allowed"
                            }`}
                          >
                            {cliente.contato_restrito === true ? "Bloqueado" : "Liberado"}
                          </span>
                          <span className={situacao.className}>{situacao.label}</span>
                          <span
                            className={`client-status ${
                              cliente.permite_campanha === true ? "client-status-allowed" : "client-status-restricted"
                            }`}
                          >
                            {cliente.permite_campanha === true ? "Campanha Liberada" : "Campanha Bloqueada"}
                          </span>
                        </div>
                      </dd>
                    </div>
                    <div>
                      <dt>Ação</dt>
                      <dd>
                        <button
                          className="client-permissions-button"
                          type="button"
                          onClick={() => {
                            setFeedback(null);
                            setClienteEmEdicao(cliente);
                          }}
                        >
                          Editar permissões
                        </button>
                      </dd>
                    </div>
                  </dl>

                  <dl className="client-info-block client-contact-block">
                    <div>
                      <dt>Celular</dt>
                      <dd>{formatarTelefone(cliente)}</dd>
                    </div>
                    <div>
                      <dt>E-mail</dt>
                      <dd>{formatarValor(cliente.email_cont)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
        </div>
      </section>

      {clienteEmEdicao && (
        <PermissoesContatoModal
          cliente={clienteEmEdicao}
          onClose={() => setClienteEmEdicao(null)}
          onSave={salvarPermissoes}
        />
      )}
    </main>
  );
}

interface PermissoesContatoModalProps {
  cliente: ClienteSincronizado;
  onClose: () => void;
  onSave: (
    cliente: ClienteSincronizado,
    valores: {
      permiteCampanha: boolean;
      permiteCobrancaAviso: boolean;
      contatoRestrito: boolean;
      motivoRestricao: string;
    },
  ) => Promise<{ success: boolean; message?: string }>;
}

function ClientPermissionIcon({
  tipo,
}: {
  tipo: "shield" | "campaign" | "billing" | "lock" | "user" | "phone" | "mail" | "hash" | "info" | "close";
}) {
  if (tipo === "campaign") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 13V8.5c0-.8.6-1.5 1.4-1.6L18 4v16L5.4 17.1A1.7 1.7 0 0 1 4 15.5V13Z" />
        <path d="M8 17v2.2c0 .8.7 1.4 1.5 1.2l1.8-.5" />
        <path d="M18 9.5h2" />
        <path d="M18 14.5h2" />
      </svg>
    );
  }

  if (tipo === "billing") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 10h16" />
        <path d="M8 15h4" />
        <path d="M16 14v3" />
        <path d="M14.5 15.5h3" />
      </svg>
    );
  }

  if (tipo === "lock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
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

  if (tipo === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 16.9v2.8a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4 2 2 0 0 1 4.1 2h2.8a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.8 9.6a16 16 0 0 0 6.6 6.6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 1.8Z" />
      </svg>
    );
  }

  if (tipo === "mail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }

  if (tipo === "hash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 9h14" />
        <path d="M5 15h14" />
        <path d="M10 4 8 20" />
        <path d="m16 4-2 16" />
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

  if (tipo === "close") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.7-4" />
    </svg>
  );
}

function ContactSection({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="contact-permissions-section">
      <h3>
        <span>{numero}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function ContactInfoItem({
  icon,
  label,
  value,
}: {
  icon: "user" | "hash" | "phone" | "mail";
  label: string;
  value: string;
}) {
  return (
    <div className="contact-info-item">
      <span className="contact-info-icon">
        <ClientPermissionIcon tipo={icon} />
      </span>
      <div>
        <dt>{label}</dt>
        <dd>{value || "-"}</dd>
      </div>
    </div>
  );
}

function ContactPermissionRow({
  icon,
  title,
  description,
  children,
}: {
  icon: "campaign" | "billing" | "lock";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <label className="contact-permission-row">
      <span className="contact-permission-row-icon">
        <ClientPermissionIcon tipo={icon} />
      </span>
      <span className="contact-permission-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {children}
    </label>
  );
}

function PermissoesContatoModalLegacy({ cliente, onClose, onSave }: PermissoesContatoModalProps) {
  const [permiteCampanha, setPermiteCampanha] = useState(Boolean(cliente.permite_campanha));
  const [permiteCobrancaAviso, setPermiteCobrancaAviso] = useState(cliente.permite_cobranca_aviso !== false);
  const [contatoRestrito, setContatoRestrito] = useState(Boolean(cliente.contato_restrito));
  const [motivoRestricao, setMotivoRestricao] = useState(cliente.motivo_restricao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (contatoRestrito && !motivoRestricao.trim()) {
      setErro("Informe o motivo da restrição.");
      return;
    }

    setSalvando(true);
    const resultado = await onSave(cliente, {
      permiteCampanha,
      permiteCobrancaAviso,
      contatoRestrito,
      motivoRestricao: contatoRestrito ? motivoRestricao.trim() : "",
    });
    setSalvando(false);

    if (!resultado.success) {
      setErro(resultado.message || "Não foi possível atualizar as permissões de contato. Tente novamente.");
    }
  }

  return (
    <div className="review-modal-backdrop" role="presentation" onClick={salvando ? undefined : onClose}>
      <section
        className="review-modal client-permissions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permissoes-contato-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="review-modal-header">
          <div>
            <h2 id="permissoes-contato-titulo">Permissões de contato</h2>
            <p>Edite apenas as permissões da plataforma. Os dados cadastrais são sincronizados do Firebird e não podem ser alterados aqui.</p>
          </div>
          <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar">
            x
          </button>
        </header>

        <form className="client-permissions-form" onSubmit={(event) => void salvar(event)}>
          <section className="client-readonly-card" aria-label="Dados sincronizados do cliente">
            <div>
              <span>Código</span>
              <strong>{formatarValor(cliente.id_cliente)}</strong>
            </div>
            <div>
              <span>Nome</span>
              <strong>{formatarValor(cliente.nome)}</strong>
            </div>
            <div>
              <span>Celular</span>
              <strong>{formatarTelefone(cliente)}</strong>
            </div>
            <div>
              <span>E-mail</span>
              <strong>{formatarValor(cliente.email_cont)}</strong>
            </div>
          </section>

          <div className="client-permissions-grid">
            <label>
              <span>Campanhas promocionais</span>
              <select
                value={permiteCampanha ? "permitido" : "nao_permitido"}
                onChange={(event) => setPermiteCampanha(event.target.value === "permitido")}
                disabled={salvando}
              >
                <option value="permitido">Permitido</option>
                <option value="nao_permitido">Não permitido</option>
              </select>
            </label>

            <label>
              <span>Cobranças e avisos</span>
              <select
                value={permiteCobrancaAviso ? "permitido" : "nao_permitido"}
                onChange={(event) => setPermiteCobrancaAviso(event.target.value === "permitido")}
                disabled={salvando}
              >
                <option value="permitido">Permitido</option>
                <option value="nao_permitido">Não permitido</option>
              </select>
            </label>

            <label>
              <span>Contato Restrito</span>
              <select
                value={contatoRestrito ? "sim" : "nao"}
                onChange={(event) => {
                  const restrito = event.target.value === "sim";
                  setContatoRestrito(restrito);

                  if (restrito) {
                    setPermiteCampanha(false);
                    setPermiteCobrancaAviso(false);
                  }
                }}
                disabled={salvando}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>

            <label className="client-permissions-full">
              <span>Motivo da restrição</span>
              <select
                value={motivosRestricao.includes(motivoRestricao) ? motivoRestricao : "Outro"}
                onChange={(event) => setMotivoRestricao(event.target.value === "Outro" ? "" : event.target.value)}
                disabled={salvando || !contatoRestrito}
              >
                {motivosRestricao.map((motivo) => (
                  <option key={motivo} value={motivo}>
                    {motivo}
                  </option>
                ))}
              </select>
            </label>

            <label className="client-permissions-full">
              <span>Detalhes do motivo</span>
              <textarea
                value={motivoRestricao}
                onChange={(event) => setMotivoRestricao(event.target.value)}
                disabled={salvando || !contatoRestrito}
                required={contatoRestrito}
                placeholder="Descreva o motivo da restrição"
              />
            </label>
          </div>

          {erro && <div className="feedback-box feedback-error">{erro}</div>}

          <footer className="client-permissions-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button className="primary-button" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar permissões"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function PermissoesContatoModalPrevious({ cliente, onClose, onSave }: PermissoesContatoModalProps) {
  const [permiteCampanha, setPermiteCampanha] = useState(Boolean(cliente.permite_campanha));
  const [permiteCobrancaAviso, setPermiteCobrancaAviso] = useState(cliente.permite_cobranca_aviso !== false);
  const [contatoRestrito, setContatoRestrito] = useState(Boolean(cliente.contato_restrito));
  const [motivoRestricao, setMotivoRestricao] = useState(cliente.motivo_restricao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const restricaoInativa = !contatoRestrito;

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (contatoRestrito && !motivoRestricao.trim()) {
      setErro("Informe o motivo da restrição.");
      return;
    }

    setSalvando(true);
    const resultado = await onSave(cliente, {
      permiteCampanha,
      permiteCobrancaAviso,
      contatoRestrito,
      motivoRestricao: contatoRestrito ? motivoRestricao.trim() : "",
    });
    setSalvando(false);

    if (!resultado.success) {
      setErro(resultado.message || "Não foi possível atualizar as permissões de contato. Tente novamente.");
    }
  }

  return (
    <div className="review-modal-backdrop client-permissions-backdrop" role="presentation" onClick={salvando ? undefined : onClose}>
      <section
        className="review-modal client-permissions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permissoes-contato-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="client-permissions-header">
          <div className="client-permissions-title-block">
            <span className="client-permissions-title-icon">
              <ClientPermissionIcon tipo="shield" />
            </span>
            <div>
              <h2 id="permissoes-contato-titulo">Permissões de contato</h2>
              <p>
                Edite apenas as permissões da plataforma. Os dados cadastrais são sincronizados do Firebird e não podem
                ser alterados aqui.
              </p>
            </div>
          </div>
          <button className="client-permissions-close" type="button" onClick={onClose} disabled={salvando} aria-label="Fechar">
            ×
          </button>
        </header>

        <form className="client-permissions-form" onSubmit={(event) => void salvar(event)}>
          <div className="client-permissions-layout">
            <aside className="client-readonly-card" aria-label="Dados sincronizados do cliente">
              <div className="client-readonly-hero">
                <span className="client-readonly-icon">
                  <ClientPermissionIcon tipo="user" />
                </span>
                <div>
                  <span>Cliente</span>
                  <strong>{formatarValor(cliente.nome)}</strong>
                  <small>Código {formatarValor(cliente.id_cliente)}</small>
                </div>
              </div>

              <dl className="client-readonly-list">
                <div>
                  <dt>Código</dt>
                  <dd>{formatarValor(cliente.id_cliente)}</dd>
                </div>
                <div>
                  <dt>Nome</dt>
                  <dd>{formatarValor(cliente.nome)}</dd>
                </div>
                <div>
                  <dt>Celular</dt>
                  <dd>{formatarTelefone(cliente)}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{formatarValor(cliente.email_cont)}</dd>
                </div>
              </dl>

              <p className="client-readonly-note">
                Dados cadastrais protegidos e sincronizados do Firebird. Apenas as permissões desta plataforma podem ser
                editadas neste painel.
              </p>
            </aside>

            <section className="client-permissions-editor" aria-label="Permissões editáveis">
              <div className="client-permissions-section-title">
                <span>Permissões de contato</span>
                <strong>Controle de comunicação</strong>
              </div>

              <div className="client-permissions-grid">
                <label className="client-permission-card">
                  <span className="client-permission-icon">
                    <ClientPermissionIcon tipo="campaign" />
                  </span>
                  <span className="client-permission-copy">
                    <strong>Campanhas promocionais</strong>
                    <small>Autoriza comunicações de ofertas e ações comerciais.</small>
                  </span>
                  <select
                    value={permiteCampanha ? "permitido" : "nao_permitido"}
                    onChange={(event) => setPermiteCampanha(event.target.value === "permitido")}
                    disabled={salvando}
                  >
                    <option value="permitido">Permitido</option>
                    <option value="nao_permitido">Não permitido</option>
                  </select>
                </label>

                <label className="client-permission-card">
                  <span className="client-permission-icon">
                    <ClientPermissionIcon tipo="billing" />
                  </span>
                  <span className="client-permission-copy">
                    <strong>Cobranças e avisos</strong>
                    <small>Permite lembretes, notificações financeiras e avisos.</small>
                  </span>
                  <select
                    value={permiteCobrancaAviso ? "permitido" : "nao_permitido"}
                    onChange={(event) => setPermiteCobrancaAviso(event.target.value === "permitido")}
                    disabled={salvando}
                  >
                    <option value="permitido">Permitido</option>
                    <option value="nao_permitido">Não permitido</option>
                  </select>
                </label>

                <label className="client-permission-card">
                  <span className="client-permission-icon client-permission-icon-danger">
                    <ClientPermissionIcon tipo="lock" />
                  </span>
                  <span className="client-permission-copy">
                    <strong>Contato restrito</strong>
                    <small>Bloqueia comunicações quando há solicitação ou risco.</small>
                  </span>
                  <select
                    value={contatoRestrito ? "sim" : "nao"}
                    onChange={(event) => {
                      const restrito = event.target.value === "sim";
                      setContatoRestrito(restrito);

                      if (restrito) {
                        setPermiteCampanha(false);
                        setPermiteCobrancaAviso(false);
                      }
                    }}
                    disabled={salvando}
                  >
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </label>
              </div>

              <section className={restricaoInativa ? "restriction-details restriction-details-disabled" : "restriction-details"}>
                <div className="restriction-details-header">
                  <div>
                    <span>Detalhes da restrição</span>
                    <strong>{contatoRestrito ? "Campos habilitados" : "Campos inativos"}</strong>
                  </div>
                  <p>Os campos abaixo ficam disponíveis apenas quando “Contato restrito” estiver definido como “Sim”.</p>
                </div>

                <div className="restriction-details-grid">
                  <label>
                    <span>Motivo da restrição</span>
                    <select
                      value={motivosRestricao.includes(motivoRestricao) ? motivoRestricao : "Outro"}
                      onChange={(event) => setMotivoRestricao(event.target.value === "Outro" ? "" : event.target.value)}
                      disabled={salvando || !contatoRestrito}
                    >
                      {motivosRestricao.map((motivo) => (
                        <option key={motivo} value={motivo}>
                          {motivo}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Detalhes do motivo</span>
                    <textarea
                      value={motivoRestricao}
                      onChange={(event) => setMotivoRestricao(event.target.value)}
                      disabled={salvando || !contatoRestrito}
                      required={contatoRestrito}
                      placeholder="Descreva o motivo da restrição"
                    />
                  </label>
                </div>
              </section>
            </section>
          </div>

          {erro && <div className="feedback-box feedback-error">{erro}</div>}

          <footer className="client-permissions-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button className="primary-button" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar permissões"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function PermissoesContatoModal({ cliente, onClose, onSave }: PermissoesContatoModalProps) {
  const [permiteCampanha, setPermiteCampanha] = useState(Boolean(cliente.permite_campanha));
  const [permiteCobrancaAviso, setPermiteCobrancaAviso] = useState(cliente.permite_cobranca_aviso !== false);
  const [contatoRestrito, setContatoRestrito] = useState(Boolean(cliente.contato_restrito));
  const [motivoRestricao, setMotivoRestricao] = useState(cliente.motivo_restricao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const motivoLength = motivoRestricao.length;

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (contatoRestrito && !motivoRestricao.trim()) {
      setErro("Informe o motivo da restrição.");
      return;
    }

    setSalvando(true);
    const resultado = await onSave(cliente, {
      permiteCampanha,
      permiteCobrancaAviso,
      contatoRestrito,
      motivoRestricao: contatoRestrito ? motivoRestricao.trim() : "",
    });
    setSalvando(false);

    if (!resultado.success) {
      setErro(resultado.message || "Não foi possível atualizar as permissões de contato. Tente novamente.");
    }
  }

  return (
    <div className="contact-permissions-backdrop" role="presentation" onClick={salvando ? undefined : onClose}>
      <section
        className="contact-permissions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permissoes-contato-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="contact-permissions-shell" onSubmit={(event) => void salvar(event)}>
          <header className="contact-permissions-header">
            <div className="contact-permissions-title-block">
              <span className="contact-permissions-title-icon">
                <ClientPermissionIcon tipo="shield" />
              </span>
              <div>
                <h2 id="permissoes-contato-titulo">Permissões de contato</h2>
                <p>Defina como a plataforma pode se comunicar com este cliente.</p>
              </div>
            </div>
            <button className="contact-permissions-close" type="button" onClick={onClose} disabled={salvando} aria-label="Fechar">
              <ClientPermissionIcon tipo="close" />
            </button>
          </header>

          <div className="contact-permissions-content">
            <ContactSection numero="1" titulo="Identificação do cliente">
              <dl className="contact-info-grid">
                <ContactInfoItem icon="hash" label="Código" value={formatarValor(cliente.id_cliente)} />
                <ContactInfoItem icon="user" label="Cliente" value={formatarValor(cliente.nome)} />
                <div className="contact-info-secondary-row">
                  <ContactInfoItem icon="phone" label="Celular" value={formatarTelefone(cliente)} />
                  <ContactInfoItem icon="mail" label="E-mail" value={formatarValor(cliente.email_cont)} />
                </div>
              </dl>
            </ContactSection>

            <ContactSection numero="2" titulo="Permissões de comunicação">
              <div className="contact-permission-list">
                <ContactPermissionRow
                  icon="campaign"
                  title="Campanhas promocionais"
                  description="Envio de ofertas, novidades e promoções."
                >
                  <select
                    value={permiteCampanha ? "permitido" : "nao_permitido"}
                    onChange={(event) => setPermiteCampanha(event.target.value === "permitido")}
                    disabled={salvando}
                  >
                    <option value="permitido">Permitido</option>
                    <option value="nao_permitido">Não permitido</option>
                  </select>
                </ContactPermissionRow>

                <ContactPermissionRow
                  icon="billing"
                  title="Cobranças e avisos"
                  description="Avisos de vencimento e cobranças."
                >
                  <select
                    value={permiteCobrancaAviso ? "permitido" : "nao_permitido"}
                    onChange={(event) => setPermiteCobrancaAviso(event.target.value === "permitido")}
                    disabled={salvando}
                  >
                    <option value="permitido">Permitido</option>
                    <option value="nao_permitido">Não permitido</option>
                  </select>
                </ContactPermissionRow>

                <ContactPermissionRow
                  icon="lock"
                  title="Contato restrito"
                  description="Restringe todos os tipos de comunicação."
                >
                  <select
                    value={contatoRestrito ? "sim" : "nao"}
                    onChange={(event) => {
                      const restrito = event.target.value === "sim";
                      setContatoRestrito(restrito);

                      if (restrito) {
                        setPermiteCampanha(false);
                        setPermiteCobrancaAviso(false);
                      }
                    }}
                    disabled={salvando}
                  >
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </ContactPermissionRow>
              </div>
            </ContactSection>

            <ContactSection numero="3" titulo="Detalhes da restrição">
              <div className="contact-restriction-grid">
                <label>
                  <span>Motivo da restrição</span>
                  <select
                    value={motivosRestricao.includes(motivoRestricao) ? motivoRestricao : "Outro"}
                    onChange={(event) => setMotivoRestricao(event.target.value === "Outro" ? "" : event.target.value)}
                    disabled={salvando || !contatoRestrito}
                  >
                    {motivosRestricao.map((motivo) => (
                      <option key={motivo} value={motivo}>
                        {motivo}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Detalhes do motivo</span>
                  <div className="contact-restriction-textarea-wrap">
                    <textarea
                      value={motivoRestricao}
                      onChange={(event) => setMotivoRestricao(event.target.value)}
                      disabled={salvando || !contatoRestrito}
                      required={contatoRestrito}
                      placeholder="Descreva o motivo da restrição"
                      maxLength={500}
                    />
                    <small>{motivoLength}/500</small>
                  </div>
                </label>
              </div>

              <p className="contact-restriction-help">
                <ClientPermissionIcon tipo="info" />
                Os campos acima ficam disponíveis apenas quando a opção “Contato restrito” estiver definida como “Sim”.
              </p>
            </ContactSection>

            {erro && <div className="feedback-box feedback-error">{erro}</div>}
          </div>

          <footer className="contact-permissions-footer">
            <button className="contact-permissions-secondary" type="button" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button className="contact-permissions-primary" type="submit" disabled={salvando}>
              <ClientPermissionIcon tipo="shield" />
              {salvando ? "Salvando..." : "Salvar permissões"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
