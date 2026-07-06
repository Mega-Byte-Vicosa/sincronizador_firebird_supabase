import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { MetricCardIcon } from "../components/layout/MetricCardIcon";
import { supabase } from "../lib/supabaseClient";

interface ModeloMensagem {
  id: string;
  id_empresa: string | null;
  modelo_msg_titulo: string;
  modelo_msg: string;
  ativo: boolean;
  modelo_global: boolean;
  modelo_sistema: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  criado_em: string;
  atualizado_em: string;
  origem: "geral" | "cobranca";
  categoria: string | null;
}

interface ModeloForm {
  id: string | null;
  titulo: string;
  mensagem: string;
  ativo: boolean;
  modeloGlobal: boolean;
  origem: "geral" | "cobranca";
}

const modeloFormInicial: ModeloForm = {
  id: null,
  titulo: "",
  mensagem: "",
  ativo: true,
  modeloGlobal: false,
  origem: "geral",
};

function normalizarBusca(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarDataHora(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function criarPrevia(value: string) {
  const texto = value.replace(/\s+/g, " ").trim();
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;
}

type ModelIconName = "plus" | "refresh" | "view" | "edit" | "toggle" | "close" | "save" | "message";

function ModelIcon({ name }: { name: ModelIconName }) {
  const paths: Record<ModelIconName, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: <><path d="M20 11a8 8 0 1 0 1 5" /><path d="M20 4v7h-7" /></>,
    view: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    toggle: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    save: <><path d="M5 4h11l3 3v13H5V4Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
    message: <><path d="M4 5h16v12H8l-4 3V5Z" /><path d="M8 9h8M8 13h6" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function ModelosMensagem() {
  const { usuario } = useAuth();
  const [modelos, setModelos] = useState<ModeloMensagem[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<ModeloForm>(modeloFormInicial);
  const [visualizando, setVisualizando] = useState<ModeloMensagem | null>(null);

  const carregarModelos = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    if (!usuario?.id_empresa) {
      setModelos([]);
      setCarregando(false);
      return;
    }

    const { data, error } = await supabase
      .from("tab_modelos_msg")
      .select("id, id_empresa, modelo_msg_titulo, modelo_msg, ativo, modelo_global, modelo_sistema, criado_por, atualizado_por, criado_em, atualizado_em")
      .or(`modelo_global.eq.true,id_empresa.eq.${usuario.id_empresa}`)
      .order("modelo_global", { ascending: false })
      .order("modelo_msg_titulo", { ascending: true });

    const { data: modelosCobranca, error: erroCobranca } = await supabase
      .from("tab_modelos_mensagem")
      .select("id, id_empresa, nome, categoria, corpo, ativo, padrao, criado_em, atualizado_em")
      .eq("id_empresa", usuario.id_empresa)
      .order("categoria", { ascending: true })
      .order("nome", { ascending: true });

    if (error || erroCobranca) {
      setModelos([]);
      setErro("Não foi possível carregar os modelos de mensagem.");
    } else {
      const gerais = (data ?? []).map((modelo) => ({
        ...modelo,
        origem: "geral" as const,
        categoria: null,
      }));
      const cobranca = (modelosCobranca ?? []).map((modelo) => ({
        id: modelo.id,
        id_empresa: modelo.id_empresa,
        modelo_msg_titulo: modelo.nome,
        modelo_msg: modelo.corpo,
        ativo: modelo.ativo,
        modelo_global: false,
        modelo_sistema: modelo.padrao,
        criado_por: null,
        atualizado_por: null,
        criado_em: modelo.criado_em,
        atualizado_em: modelo.atualizado_em,
        origem: "cobranca" as const,
        categoria: modelo.categoria,
      }));
      setModelos([...cobranca, ...gerais]);
    }

    setCarregando(false);
  }, [usuario?.id_empresa]);

  useEffect(() => {
    void carregarModelos();
  }, [carregarModelos]);

  const modelosFiltrados = useMemo(() => {
    const termo = normalizarBusca(busca);
    return modelos.filter((modelo) => {
      if (status === "ativos" && !modelo.ativo) return false;
      if (status === "inativos" && modelo.ativo) return false;
      if (!termo) return true;
      return [modelo.modelo_msg_titulo, modelo.modelo_msg].some((value) => normalizarBusca(value).includes(termo));
    });
  }, [busca, modelos, status]);

  const totalAtivos = modelos.filter((modelo) => modelo.ativo).length;
  const totalInativos = modelos.length - totalAtivos;

  function abrirNovoModelo() {
    setForm(modeloFormInicial);
    setErro(null);
    setFeedback(null);
    setModalAberto(true);
  }

  function abrirEdicao(modelo: ModeloMensagem) {
    setForm({
      id: modelo.id,
      titulo: modelo.modelo_msg_titulo,
      mensagem: modelo.modelo_msg,
      ativo: modelo.ativo,
      modeloGlobal: modelo.modelo_global,
      origem: modelo.origem,
    });
    setErro(null);
    setFeedback(null);
    setModalAberto(true);
  }

  async function salvarModelo(event: FormEvent) {
    event.preventDefault();
    const titulo = form.titulo.trim();
    const mensagem = form.mensagem.trim();

    if (!titulo || !mensagem) {
      setErro("Informe o título e a mensagem do modelo.");
      return;
    }

    if (!usuario?.id_empresa) {
      setErro("Empresa da sessão não identificada.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const payloadGeral = {
      modelo_msg_titulo: titulo,
      modelo_msg: mensagem,
      ativo: form.ativo,
      atualizado_por: usuario.id,
    };

    const query = form.id
      ? form.origem === "cobranca"
        ? supabase
            .from("tab_modelos_mensagem")
            .update({ nome: titulo, corpo: mensagem, ativo: form.ativo })
            .eq("id", form.id)
            .eq("id_empresa", usuario.id_empresa)
        : form.modeloGlobal
        ? supabase
            .from("tab_modelos_msg")
            .update(payloadGeral)
            .eq("id", form.id)
            .eq("modelo_global", true)
        : supabase
            .from("tab_modelos_msg")
            .update(payloadGeral)
            .eq("id", form.id)
            .eq("id_empresa", usuario.id_empresa)
      : supabase.from("tab_modelos_msg").insert({
          ...payloadGeral,
          id_empresa: usuario.id_empresa,
          modelo_global: false,
          modelo_sistema: false,
          criado_por: usuario.id,
        });

    const { error } = await query;
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar o modelo de mensagem.");
      return;
    }

    setModalAberto(false);
    setFeedback(form.id ? "Modelo atualizado com sucesso." : "Modelo criado com sucesso.");
    await carregarModelos();
  }

  async function alternarStatus(modelo: ModeloMensagem) {
    if (!usuario?.id_empresa) return;
    setErro(null);
    setFeedback(null);

    const { error } = modelo.origem === "cobranca"
      ? await supabase
          .from("tab_modelos_mensagem")
          .update({ ativo: !modelo.ativo })
          .eq("id", modelo.id)
          .eq("id_empresa", usuario.id_empresa)
      : modelo.modelo_global
        ? await supabase
            .from("tab_modelos_msg")
            .update({ ativo: !modelo.ativo, atualizado_por: usuario.id })
            .eq("id", modelo.id)
            .eq("modelo_global", true)
        : await supabase
            .from("tab_modelos_msg")
            .update({ ativo: !modelo.ativo, atualizado_por: usuario.id })
            .eq("id", modelo.id)
            .eq("id_empresa", usuario.id_empresa);

    if (error) {
      setErro("Não foi possível alterar o status do modelo.");
      return;
    }

    setFeedback(modelo.ativo ? "Modelo inativado." : "Modelo ativado.");
    await carregarModelos();
  }

  return (
    <main className="page-shell models-page">
      <header className="page-header models-page-header">
        <div>
          <h1>Modelos de mensagens</h1>
          <p>Cadastre modelos de mensagens para usar nas campanhas de WhatsApp.</p>
        </div>
        <div className="models-header-actions">
          <button className="secondary-button" type="button" onClick={() => void carregarModelos()} disabled={carregando}>
            <ModelIcon name="refresh" />
            Atualizar
          </button>
          <button className="primary-button" type="button" onClick={abrirNovoModelo}>
            <ModelIcon name="plus" />
            Novo modelo
          </button>
        </div>
      </header>

      <section className="summary-grid models-summary-grid" aria-label="Resumo dos modelos">
        <article className="summary-card summary-card-azul">
          <div><span>Total de modelos</span><strong>{modelos.length}</strong><small>Modelos cadastrados</small></div>
          <div className="summary-card-icon"><MetricCardIcon type="list" /></div>
        </article>
        <article className="summary-card summary-card-verde">
          <div><span>Ativos</span><strong>{totalAtivos}</strong><small>Disponíveis nas campanhas</small></div>
          <div className="summary-card-icon"><MetricCardIcon type="sent" /></div>
        </article>
        <article className="summary-card summary-card-vermelho">
          <div><span>Inativos</span><strong>{totalInativos}</strong><small>Ocultos na seleção</small></div>
          <div className="summary-card-icon"><MetricCardIcon type="pending" /></div>
        </article>
      </section>

      <section className="filters-panel models-filters" aria-label="Filtros de modelos">
        <label>
          <span>Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Título ou conteúdo da mensagem"
          />
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </label>
      </section>

      {feedback && <div className="state-box state-box-success">{feedback}</div>}
      {erro && <div className="state-box state-box-error">{erro}</div>}

      <section className="results-section models-results">
        <div className="section-title">
          <h2>Biblioteca de mensagens</h2>
          <span>Resultados: {modelosFiltrados.length}</span>
        </div>

        <div className="table-wrap models-table-wrap">
          <table className="models-table">
            <thead><tr><th>Título</th><th>Prévia da mensagem</th><th>Status</th><th>Origem</th><th>Criado em</th><th>Ações</th></tr></thead>
            <tbody>
              {!carregando && modelosFiltrados.length === 0 && (
                <tr><td colSpan={6}><div className="empty-table-message">Nenhum modelo encontrado.</div></td></tr>
              )}
              {modelosFiltrados.map((modelo) => (
                <tr key={modelo.id}>
                  <td><strong>{modelo.modelo_msg_titulo}</strong></td>
                  <td><span className="models-message-preview">{criarPrevia(modelo.modelo_msg)}</span></td>
                  <td><span className={`models-status-badge ${modelo.ativo ? "models-status-active" : "models-status-inactive"}`}>{modelo.ativo ? "Ativo" : "Inativo"}</span></td>
                  <td><span className={`models-origin-badge ${modelo.modelo_global ? "models-origin-global" : "models-origin-company"}`}>{modelo.origem === "cobranca" ? "Cobrança" : modelo.modelo_global ? "Global" : "Empresa"}</span></td>
                  <td>{formatarDataHora(modelo.criado_em)}</td>
                  <td>
                    <div className="models-row-actions">
                      <button type="button" onClick={() => setVisualizando(modelo)} title="Visualizar" aria-label={`Visualizar ${modelo.modelo_msg_titulo}`}><ModelIcon name="view" /></button>
                      <button type="button" onClick={() => abrirEdicao(modelo)} title="Editar" aria-label={`Editar ${modelo.modelo_msg_titulo}`}><ModelIcon name="edit" /></button>
                      <button type="button" onClick={() => void alternarStatus(modelo)} title={modelo.ativo ? "Inativar" : "Ativar"} aria-label={`${modelo.ativo ? "Inativar" : "Ativar"} ${modelo.modelo_msg_titulo}`}><ModelIcon name="toggle" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="models-mobile-list">
          {modelosFiltrados.map((modelo) => (
            <article className="models-mobile-card" key={modelo.id}>
              <div><strong>{modelo.modelo_msg_titulo}</strong><span className={`models-status-badge ${modelo.ativo ? "models-status-active" : "models-status-inactive"}`}>{modelo.ativo ? "Ativo" : "Inativo"}</span></div>
              <span className={`models-origin-badge ${modelo.modelo_global ? "models-origin-global" : "models-origin-company"}`}>{modelo.origem === "cobranca" ? "Cobrança" : modelo.modelo_global ? "Global" : "Empresa"}</span>
              <p>{criarPrevia(modelo.modelo_msg)}</p>
              <small>Criado em {formatarDataHora(modelo.criado_em)}</small>
              <div className="models-row-actions">
                <button type="button" onClick={() => setVisualizando(modelo)} title="Visualizar"><ModelIcon name="view" /><span>Visualizar</span></button>
                <button type="button" onClick={() => abrirEdicao(modelo)} title="Editar"><ModelIcon name="edit" /><span>Editar</span></button>
                <button type="button" onClick={() => void alternarStatus(modelo)} title={modelo.ativo ? "Inativar" : "Ativar"}><ModelIcon name="toggle" /><span>{modelo.ativo ? "Inativar" : "Ativar"}</span></button>
              </div>
            </article>
          ))}
          {!carregando && modelosFiltrados.length === 0 && <div className="empty-table-message">Nenhum modelo encontrado.</div>}
        </div>
      </section>

      {modalAberto && (
        <div className="review-modal-backdrop models-modal-backdrop" role="presentation" onClick={salvando ? undefined : () => setModalAberto(false)}>
          <form className="models-modal" role="dialog" aria-modal="true" aria-labelledby="models-modal-title" onSubmit={salvarModelo} onClick={(event) => event.stopPropagation()}>
            <header className="models-modal-header">
              <span className="models-modal-icon"><ModelIcon name="message" /></span>
              <div><h2 id="models-modal-title">{form.id ? "Editar modelo" : "Novo modelo"}</h2><p>Crie um texto reutilizável para suas campanhas.</p></div>
              <button className="models-modal-close" type="button" onClick={() => setModalAberto(false)} disabled={salvando} aria-label="Fechar"><ModelIcon name="close" /></button>
            </header>
            <div className="models-modal-body">
              <label><span>Título do modelo</span><input value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} placeholder="Ex: Aniversariante do dia" maxLength={120} autoFocus /></label>
              <label><span>Mensagem do modelo</span><textarea value={form.mensagem} onChange={(event) => setForm({ ...form, mensagem: event.target.value })} placeholder="Olá, {{nome}}! Temos uma mensagem especial para você." rows={8} /></label>
              <div className="models-variable-note">Você pode usar variáveis como {"{{nome}}"}, {"{{empresa}}"}, {"{{aos_cuidados}}"} e {"{{data_atual}}"}. Elas serão substituídas na campanha quando disponível.</div>
              <label className="models-active-control"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} /><span><strong>Modelo ativo</strong><small>Disponível para seleção em novas campanhas.</small></span></label>
              {erro && <div className="state-box state-box-error">{erro}</div>}
            </div>
            <footer className="models-modal-footer">
              <button className="secondary-button" type="button" onClick={() => setModalAberto(false)} disabled={salvando}>Cancelar</button>
              <button className="primary-button" type="submit" disabled={salvando}><ModelIcon name="save" />{salvando ? "Salvando..." : "Salvar modelo"}</button>
            </footer>
          </form>
        </div>
      )}

      {visualizando && (
        <div className="modal-backdrop" role="presentation" onClick={() => setVisualizando(null)}>
          <aside className="models-view-modal" role="dialog" aria-modal="true" aria-labelledby="models-view-title" onClick={(event) => event.stopPropagation()}>
            <header><div><h2 id="models-view-title">{visualizando.modelo_msg_titulo}</h2><span className={`models-status-badge ${visualizando.ativo ? "models-status-active" : "models-status-inactive"}`}>{visualizando.ativo ? "Ativo" : "Inativo"}</span></div><button type="button" onClick={() => setVisualizando(null)} aria-label="Fechar"><ModelIcon name="close" /></button></header>
            <p>{visualizando.modelo_msg}</p>
            <footer><button className="primary-button" type="button" onClick={() => { setVisualizando(null); abrirEdicao(visualizando); }}><ModelIcon name="edit" />Editar modelo</button></footer>
          </aside>
        </div>
      )}
    </main>
  );
}
