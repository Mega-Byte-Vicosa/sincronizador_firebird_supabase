import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { GlobalHeaderIcon } from "./GlobalPageHeader";
import { supabase } from "../../lib/supabaseClient";

interface TopbarProps {
  activePath: string;
  onNavigate: (path: string) => void;
  onOpenMenu: () => void;
}

const breadcrumbPorRota: Record<string, [string, string]> = {
  "/dashboard": ["Início", "Dashboard"],
  "/clientes": ["Operacional", "Clientes"],
  "/contas-a-receber": ["Operacional", "Contas a Receber"],
  "/automacoes": ["Operacional", "Automações"],
  "/campanhas-promocao": ["Marketing", "Campanhas/Promoções"],
  "/campanhas-promocao/modelos": ["Marketing", "Modelos"],
  "/mensagens-programadas": ["Comunicação", "Mensagens Programadas"],
  "/historico-envios": ["Sistema", "Histórico"],
  "/configuracoes": ["Sistema", "Configurações"],
};

export function Topbar({ activePath, onNavigate, onOpenMenu }: TopbarProps) {
  const { usuario, sair, alterarSenha } = useAuth();
  const [saindo, setSaindo] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [feedbackSenha, setFeedbackSenha] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);
  const [menuUsuarioAberto, setMenuUsuarioAberto] = useState(false);
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [senhaReset, setSenhaReset] = useState("");
  const [confirmacaoReset, setConfirmacaoReset] = useState("");
  const [resetando, setResetando] = useState(false);
  const [feedbackReset, setFeedbackReset] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);
  const nome = usuario?.nome || usuario?.usuario || "Usuário";
  const empresa = usuario?.empresa_nome_fantasia || usuario?.empresa_razao_social || "Empresa";
  const iniciais = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
  const ultimoAcesso = usuario?.ultimo_login_anterior
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(usuario.ultimo_login_anterior))
    : "Primeiro acesso";
  const [, paginaAtual] = breadcrumbPorRota[activePath] ?? ["Início", "Dashboard"];

  async function handleLogout() {
    setSaindo(true);
    await sair();
  }

  function fecharModalSenha() {
    if (alterandoSenha) return;

    setModalSenhaAberto(false);
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmacaoSenha("");
    setFeedbackSenha(null);
  }

  async function handleAlterarSenha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackSenha(null);

    if (novaSenha.length < 6) {
      setFeedbackSenha({ tipo: "erro", mensagem: "A nova senha deve ter pelo menos 6 caracteres." });
      return;
    }

    if (novaSenha !== confirmacaoSenha) {
      setFeedbackSenha({ tipo: "erro", mensagem: "A confirmação não confere com a nova senha." });
      return;
    }

    setAlterandoSenha(true);
    const resultado = await alterarSenha(senhaAtual, novaSenha);
    setAlterandoSenha(false);

    if (!resultado.success) {
      setFeedbackSenha({ tipo: "erro", mensagem: resultado.message || "Não foi possível alterar a senha." });
      return;
    }

    setSenhaAtual("");
    setNovaSenha("");
    setConfirmacaoSenha("");
    setFeedbackSenha({ tipo: "sucesso", mensagem: "Senha alterada com sucesso. Faça login novamente com a nova senha." });
    setAlterandoSenha(true);

    window.setTimeout(() => {
      void sair();
    }, 900);
  }

  function fecharModalReset() {
    if (resetando) return;
    setModalResetAberto(false); setSenhaReset(""); setConfirmacaoReset(""); setFeedbackReset(null);
  }

  async function handleResetEmpresa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!usuario?.id_empresa || !senhaReset || confirmacaoReset !== "LIMPAR") return;
    const sessionToken = sessionStorage.getItem("consulta_clipp_pro_saas_session") ?? "";
    setResetando(true); setFeedbackReset(null);
    const { data, error } = await supabase.functions.invoke("reset-empresa", {
      body: { empresa_id: usuario.id_empresa, session_token: sessionToken, senha: senhaReset, confirmacao: confirmacaoReset },
    });
    if (error || data?.success === false) {
      setResetando(false);
      let detalhe = data?.message || error?.message || "Não foi possível redefinir a empresa.";
      const context = (error as { context?: unknown } | null)?.context;
      if (context instanceof Response) {
        try { const body = await context.clone().json(); detalhe = body?.message || body?.detail || detalhe; } catch { /* resposta sem JSON */ }
      }
      setFeedbackReset({ tipo: "erro", mensagem: detalhe }); return;
    }
    setSenhaReset(""); setConfirmacaoReset("");
    setFeedbackReset({ tipo: "sucesso", mensagem: `Empresa redefinida com sucesso. Você será redirecionado para a tela de login. Total de registros removidos: ${Number(data?.total_registros_apagados ?? 0)}.` });
    window.setTimeout(async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        await sair();
        window.location.replace("/login");
      }
    }, 1500);
  }

  return (
    <>
      <header className="topbar page-global-header-top">
        <button className="mobile-menu-button" type="button" aria-label="Abrir menu" onClick={onOpenMenu}>
          <span />
          <span />
          <span />
        </button>
        <div className="page-global-header-left">
          <button className="page-global-icon-button page-global-home" type="button" aria-label="Ir para o Dashboard" onClick={() => onNavigate("/dashboard")}>
            <GlobalHeaderIcon name="home" />
          </button>
          <nav className="page-global-breadcrumb" aria-label="Navegação estrutural">
            <strong>{paginaAtual}</strong>
          </nav>
        </div>

        <div className="page-global-header-actions">
          <div className="page-global-user-menu">
            <button className="page-global-user-card" type="button" onClick={() => setMenuUsuarioAberto((aberto) => !aberto)} aria-expanded={menuUsuarioAberto}>
              <div className="page-global-avatar" aria-hidden="true">{iniciais.charAt(0) || "M"}<span /></div>
              <div className="page-global-user-info">
                <strong>{nome}</strong>
                <small title={`Último acesso: ${ultimoAcesso}`}>{empresa}</small>
                <small>CNPJ {usuario?.cnpj}</small>
              </div>
              <GlobalHeaderIcon name="down" />
            </button>
            {menuUsuarioAberto && (
              <div className="page-global-user-dropdown">
                <button type="button" onClick={() => { setMenuUsuarioAberto(false); setModalSenhaAberto(true); }}>Alterar senha</button>
                <button className="user-menu-danger" type="button" onClick={() => { setMenuUsuarioAberto(false); setModalResetAberto(true); }}>Redefinir empresa</button>
                <button type="button" onClick={() => void handleLogout()} disabled={saindo}>{saindo ? "Saindo..." : "Sair"}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {modalSenhaAberto && (
        <div className="password-modal-backdrop" role="presentation" onClick={fecharModalSenha}>
          <section
            className="password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="password-modal-header">
              <div>
                <h2 id="password-modal-title">Alterar senha</h2>
                <p>Informe sua senha atual e defina uma nova senha de acesso.</p>
              </div>
              <button type="button" aria-label="Fechar alteração de senha" onClick={fecharModalSenha} disabled={alterandoSenha}>
                &times;
              </button>
            </header>

            <form className="password-form" onSubmit={(event) => void handleAlterarSenha(event)}>
              <label>
                <span>Senha atual</span>
                <input
                  type="password"
                  value={senhaAtual}
                  onChange={(event) => setSenhaAtual(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                <span>Nova senha</span>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(event) => setNovaSenha(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label>
                <span>Confirmar nova senha</span>
                <input
                  type="password"
                  value={confirmacaoSenha}
                  onChange={(event) => setConfirmacaoSenha(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              {feedbackSenha && (
                <div className={`password-feedback password-feedback-${feedbackSenha.tipo}`} role="alert">
                  {feedbackSenha.mensagem}
                </div>
              )}

              <div className="password-modal-actions">
                <button className="secondary-button" type="button" onClick={fecharModalSenha} disabled={alterandoSenha}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={alterandoSenha}>
                  {alterandoSenha ? "Alterando..." : "Salvar senha"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modalResetAberto && (
        <div className="password-modal-backdrop" role="presentation" onClick={fecharModalReset}>
          <section className="password-modal reset-company-modal" role="dialog" aria-modal="true" aria-labelledby="reset-company-title" onClick={(event) => event.stopPropagation()}>
            <header className="password-modal-header reset-company-header">
              <div><h2 id="reset-company-title">Redefinir empresa</h2><p>Essa ação irá apagar todos os dados operacionais da empresa logada. Essa ação não poderá ser desfeita.</p></div>
              <button type="button" aria-label="Fechar redefinição" onClick={fecharModalReset} disabled={resetando}>&times;</button>
            </header>
            <form className="password-form" onSubmit={(event) => void handleResetEmpresa(event)}>
              <div className="reset-company-warning"><strong>Ação irreversível</strong><p>Não serão apagados: usuários, empresa, login, parâmetros gerais de envio WhatsApp e modelos de campanhas/promoções.</p></div>
              <label><span>Senha de confirmação</span><input type="password" value={senhaReset} onChange={(event) => setSenhaReset(event.target.value)} autoComplete="off" required /></label>
              <label><span>Digite LIMPAR para confirmar</span><input type="text" value={confirmacaoReset} onChange={(event) => setConfirmacaoReset(event.target.value)} autoComplete="off" required /></label>
              {feedbackReset && <div className={`password-feedback password-feedback-${feedbackReset.tipo}`} role="alert">{feedbackReset.mensagem}</div>}
              <div className="password-modal-actions"><button className="secondary-button" type="button" onClick={fecharModalReset} disabled={resetando}>Cancelar</button><button className="danger-button" type="submit" disabled={resetando || !senhaReset || confirmacaoReset !== "LIMPAR"}>{resetando ? "Redefinindo empresa e encerrando sessão..." : "Redefinir empresa"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
