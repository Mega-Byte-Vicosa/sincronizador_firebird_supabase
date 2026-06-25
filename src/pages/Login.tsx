import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

function formatarCnpj(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function Login() {
  const { entrar } = useAuth();
  const [cnpj, setCnpj] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (!cnpj.replace(/\D/g, "")) return setErro("Informe o CNPJ.");
    if (!usuario.trim()) return setErro("Informe o usuário.");
    if (!senha) return setErro("Informe a senha.");

    setEnviando(true);
    try {
      const resultado = await entrar(cnpj, usuario.trim(), senha);
      if (!resultado.success) setErro(resultado.message ?? "CNPJ, usuário ou senha inválidos.");
    } catch {
      setErro("Não foi possível acessar o sistema agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="Apresentação Consulta Clipp Pro">
        <div className="login-brand">
          <span className="login-brand-mark">CP</span>
          <span>Consulta Clipp Pro</span>
        </div>
        <div className="login-hero-content">
          <span className="login-kicker">Gestão inteligente</span>
          <h1>Seu negócio organizado, conectado e em movimento.</h1>
          <p>Sistema SaaS de gestão financeira e automação de mensagens para sua empresa.</p>
          <div className="login-feature-list">
            <span>Contas a receber em tempo real</span>
            <span>Automação segura pelo WhatsApp</span>
            <span>Indicadores claros para decidir melhor</span>
          </div>
        </div>
        <small>Consulta Clipp Pro · Ambiente seguro</small>
      </section>

      <section className="login-form-area">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card-heading">
            <span className="login-lock-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            </span>
            <div>
              <h2>Entrar no sistema</h2>
              <p>Informe seus dados para acessar</p>
            </div>
          </div>

          <label className="login-field">
            <span>CNPJ</span>
            <input
              autoComplete="organization"
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(event) => setCnpj(formatarCnpj(event.target.value))}
              disabled={enviando}
              autoFocus
            />
          </label>

          <label className="login-field">
            <span>Usuário</span>
            <input
              autoComplete="username"
              placeholder="Digite seu usuário"
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
              disabled={enviando}
            />
          </label>

          <label className="login-field">
            <span>Senha</span>
            <span className="login-password-field">
              <input
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                disabled={enviando}
              />
              <button type="button" onClick={() => setMostrarSenha((valor) => !valor)} aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>
                {mostrarSenha ? "Ocultar" : "Mostrar"}
              </button>
            </span>
          </label>

          {erro && <div className="login-error" role="alert">{erro}</div>}

          <button className="login-submit" type="submit" disabled={enviando}>
            {enviando ? "Validando acesso..." : "Entrar"}
          </button>

          <p className="login-security-note">Seus dados são transmitidos de forma segura.</p>
        </form>
      </section>
    </main>
  );
}
