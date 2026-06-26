import { useRef, useState, type FormEvent } from "react";
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
  const usuarioInputRef = useRef<HTMLInputElement>(null);

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
      <section className="login-hero" aria-label="Apresentação MegaByte Connect">
        <div className="login-hero-content">
          <span className="login-kicker">Automação inteligente pelo WhatsApp</span>
          <h1>
            MegaByte
            <br />
            Connect
          </h1>
          <p>
            Transforme mensagens em vendas, cobranças em recebimentos
            <br />
            e contatos em clientes.
          </p>
          <div className="login-feature-list">
            <span>Cobranças automáticas pelo WhatsApp</span>
            <span>Campanhas, aniversários e promoções em um só lugar</span>
            <span>Mais relacionamento, respostas e conversões</span>
          </div>
        </div>

        <div className="login-hero-footer" aria-label="Contatos Mega Byte Informática">
          <div className="login-contact-grid">
            <a href="tel:+553138912344" aria-label="Ligar para Mega Byte">
              <img src="/icons/phone.svg" alt="" aria-hidden="true" />
              <span>(31) 3891-2344</span>
            </a>
            <a
              href="https://wa.me/5531995552344?text=Ol%C3%A1%2C%20vim%20pelo%20MegaByte%20Connect%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es."
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir conversa no WhatsApp da Mega Byte"
            >
              <img src="/icons/whatsapp.svg" alt="" aria-hidden="true" />
              <span>(31) 99555-2344</span>
            </a>
            <a
              href="https://www.instagram.com/megabyte.vicosa"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir Instagram da Mega Byte"
            >
              <img src="/icons/instagram.svg" alt="" aria-hidden="true" />
              <span>@megabyte.vicosa</span>
            </a>
          </div>

          <a className="login-developer-link" href="https://www.megabyteinfo.net" target="_blank" rel="noopener noreferrer">
            Desenvolvido por: Mega Byte Informática LTDA
          </a>
        </div>
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
              onChange={(event) => {
                const valorFormatado = formatarCnpj(event.target.value);
                setCnpj(valorFormatado);
                if (valorFormatado.replace(/\D/g, "").length === 14) {
                  usuarioInputRef.current?.focus();
                }
              }}
              disabled={enviando}
              autoFocus
            />
          </label>

          <label className="login-field">
            <span>Usuário</span>
            <input
              ref={usuarioInputRef}
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
