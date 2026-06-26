import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
      label: "Sem compra",
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
      },
      {
        titulo: "SEM TELEFONE",
        descricao: "Clientes sem celular válido",
        valor: clientes.filter((cliente) => !telefoneValido(cliente)).length,
        classe: "client-summary-warning",
        filtro: "telefone_invalido" as const,
      },
      {
        titulo: "CLIENTES RESTRITOS",
        descricao: "Bloqueados para envio",
        valor: clientes.filter((cliente) => cliente.contato_restrito === true).length,
        classe: "client-summary-danger",
        filtro: "contato_restrito" as const,
      },
      {
        titulo: "CAMPANHA PERMITIDA",
        descricao: "Liberados para campanhas",
        valor: situacoes.filter((situacao) => situacao === "campanha_permitida").length,
        classe: "client-summary-success",
        filtro: "campanha_permitida" as const,
      },
      {
        titulo: "CAMPANHA NÃO PERMITIDA",
        descricao: "Não liberados para campanhas",
        valor: situacoes.filter((situacao) => situacao === "campanha_nao_permitida").length,
        classe: "client-summary-muted",
        filtro: "campanha_nao_permitida" as const,
      },
      {
        titulo: "ANIVERSARIANTES DO MÊS",
        descricao: "Clientes do mês atual",
        valor: clientes.filter(clienteDoMesAtual).length,
        classe: "client-summary-info",
        filtro: "aniversariantes_mes" as const,
      },
      {
        titulo: "SEM COMPRA HÁ MAIS DE 90 DIAS",
        descricao: "Sem movimentação recente",
        valor: clientes.filter(clienteSemCompraMaisDe90Dias).length,
        classe: "client-summary-orange",
        filtro: "sem_compra_90_dias" as const,
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
            <span>{card.titulo}</span>
            <strong>{carregando ? "..." : card.valor}</strong>
            <small>{card.descricao}</small>
          </button>
        ))}
      </section>

      <section className="history-filters-panel" aria-label="Filtros de clientes">
        <div className="panel-title history-filters-title">
          <h2>Filtros</h2>
          <span>Resultados: {clientesFiltrados.length}</span>
        </div>

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
                    <strong>{formatarValor(cliente.nome)}</strong>
                    <span>Cliente {formatarValor(cliente.id_cliente)}</span>
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

                  <dl className="client-info-block client-action-block">
                    <div>
                      <dt>Situação</dt>
                      <dd>
                        <span className={situacao.className}>{situacao.label}</span>
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

function PermissoesContatoModal({ cliente, onClose, onSave }: PermissoesContatoModalProps) {
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
