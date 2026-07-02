import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { usuario, sair, alterarSenha } = useAuth();
  const [saindo, setSaindo] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [feedbackSenha, setFeedbackSenha] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);
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

  return (
    <>
      <header className="topbar">
        <button className="mobile-menu-button" type="button" aria-label="Abrir menu" onClick={onOpenMenu}>
          <span />
          <span />
          <span />
        </button>
        <span className="topbar-context">MegaByte Connect</span>
        <div className="topbar-user">
          <div className="topbar-user-copy">
            <strong>{nome}</strong>
            <span title={`Último acesso: ${ultimoAcesso}`}>{empresa}</span>
            <span>{usuario?.cnpj}</span>
          </div>
          <div className="topbar-avatar" aria-label={`Usuário do sistema: ${nome}`}>
            {iniciais || "MBC"}
          </div>
          <div className="topbar-user-actions">
            <button className="topbar-password-button" type="button" onClick={() => setModalSenhaAberto(true)}>
              Alterar senha
            </button>
            <button className="topbar-logout" type="button" onClick={() => void handleLogout()} disabled={saindo}>
              {saindo ? "Saindo..." : "Sair"}
            </button>
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
    </>
  );
}
