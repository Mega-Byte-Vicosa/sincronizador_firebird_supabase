import { useRef, useState, type FormEvent } from "react";
import { useAuth, type PrimeiroAcessoStatus } from "../auth/AuthContext";

type EtapaLogin = "login" | "criar_senha" | "decisao" | "confirmar_substituicao" | "sucesso";

function formatarCnpj(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function Login() {
  const { entrar, consultarPrimeiroAcesso, definirSenhaInicialAdmin, decidirInstalacaoExistente } = useAuth();
  const [cnpj, setCnpj] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<EtapaLogin>("login");
  const [statusSetup, setStatusSetup] = useState<PrimeiroAcessoStatus | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [confirmacaoSubstituicao, setConfirmacaoSubstituicao] = useState("");
  const [mensagemSucesso, setMensagemSucesso] = useState("");
  const usuarioInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (!cnpj.replace(/\D/g, "")) return setErro("Informe o CNPJ.");
    if (!usuario.trim()) return setErro("Informe o usuário.");
    setEnviando(true);
    try {
      const status = await consultarPrimeiroAcesso(cnpj, usuario.trim());
      if (!status.success) {
        setErro(status.message ?? "Não foi possível consultar o primeiro acesso.");
        return;
      }
      setStatusSetup(status);

      if ((usuario.trim().toLowerCase() === "admin" && status.admin_senha_pendente) || status.deve_definir_senha) {
        setEtapa("criar_senha");
        return;
      }

      if (status.precisa_decidir_substituicao || status.setup_status === "cnpj_existente_aguardando_decisao") {
        setEtapa("decisao");
        return;
      }

      if (!senha) {
        setErro("Informe a senha.");
        return;
      }

      const resultado = await entrar(cnpj, usuario.trim(), senha);
      if (!resultado.success) setErro(resultado.message ?? "CNPJ, usuário ou senha inválidos.");
    } catch {
      setErro("Não foi possível acessar o sistema agora.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleCriarSenha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    if (novaSenha.length < 6) return setErro("A senha deve ter pelo menos 6 caracteres.");
    if (novaSenha !== confirmarSenha) return setErro("A confirmação não confere com a nova senha.");

    setEnviando(true);
    try {
      const resultado = await definirSenhaInicialAdmin(cnpj, usuario.trim(), novaSenha);
      if (!resultado.success) return setErro(resultado.message ?? "Não foi possível criar a senha.");

      const status = await consultarPrimeiroAcesso(cnpj, usuario.trim());
      setStatusSetup(status);
      if (status.success && status.precisa_decidir_substituicao) {
        setEtapa("decisao");
        return;
      }

      const login = await entrar(cnpj, usuario.trim(), novaSenha);
      if (!login.success) setErro(login.message ?? "Senha criada, mas não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  }

  async function salvarDecisao(decisao: "usar_existente" | "substituir_dados") {
    setErro(null);
    if (!statusSetup?.id_empresa || !statusSetup.identificador_base_firebird) {
      setErro("A instalação Firebird pendente não foi identificada. Execute o sincronizador novamente.");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await decidirInstalacaoExistente(
        statusSetup.id_empresa,
        statusSetup.identificador_base_firebird,
        decisao,
        decisao === "substituir_dados" ? confirmacaoSubstituicao : undefined,
      );
      if (!resultado.success) return setErro(resultado.message ?? "Não foi possível salvar a decisão.");
      setMensagemSucesso(resultado.message ?? "Decisão salva com sucesso.");
      setEtapa("sucesso");
    } finally {
      setEnviando(false);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (etapa === "login") return void handleSubmit(event);
    if (etapa === "criar_senha") return void handleCriarSenha(event);
    event.preventDefault();
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
        <form className="login-card" onSubmit={handleFormSubmit} noValidate>
          <div className="login-card-heading">
            <span className="login-lock-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            </span>
            <div>
              <h2>{etapa === "criar_senha" ? "Criar senha do administrador" : etapa === "decisao" || etapa === "confirmar_substituicao" ? "CNPJ já cadastrado no Supabase" : etapa === "sucesso" ? "Configuração salva" : "Entrar no sistema"}</h2>
              <p>{etapa === "login" ? "Informe seus dados para acessar" : statusSetup?.empresa_nome ?? "Configuração do primeiro acesso"}</p>
            </div>
          </div>

          {etapa === "login" && <><label className="login-field">
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
          </label></>}

          {etapa === "criar_senha" && <div className="login-setup-content">
            <p>Defina a senha inicial do usuário <strong>{usuario}</strong>. Não existe senha padrão para esta empresa.</p>
            <label className="login-field"><span>Nova senha</span><input type="password" autoComplete="new-password" value={novaSenha} onChange={(event) => setNovaSenha(event.target.value)} disabled={enviando} minLength={6} autoFocus /></label>
            <label className="login-field"><span>Confirmar senha</span><input type="password" autoComplete="new-password" value={confirmarSenha} onChange={(event) => setConfirmarSenha(event.target.value)} disabled={enviando} minLength={6} /></label>
          </div>}

          {etapa === "decisao" && <div className="login-setup-content">
            <p>Encontramos dados existentes para este CNPJ no Supabase. Você pode usar os dados já existentes ou substituir os dados sincronizados pelos dados desta base Firebird.</p>
            <div className="login-setup-actions">
              <button className="login-submit" type="button" onClick={() => void salvarDecisao("usar_existente")} disabled={enviando}>Usar dados existentes</button>
              <button className="login-danger-button" type="button" onClick={() => setEtapa("confirmar_substituicao")} disabled={enviando}>Substituir dados do Supabase</button>
            </div>
          </div>}

          {etapa === "confirmar_substituicao" && <div className="login-setup-content">
            <div className="login-setup-warning">Esta ação apagará os dados sincronizados antigos deste CNPJ no Supabase, como clientes e contas a receber. Usuários, modelos e configurações SaaS serão mantidos.</div>
            <label className="login-field"><span>Digite SUBSTITUIR para confirmar</span><input value={confirmacaoSubstituicao} onChange={(event) => setConfirmacaoSubstituicao(event.target.value)} disabled={enviando} autoComplete="off" autoFocus /></label>
            <div className="login-setup-actions">
              <button className="secondary-button" type="button" onClick={() => setEtapa("decisao")} disabled={enviando}>Voltar</button>
              <button className="login-danger-button" type="button" onClick={() => void salvarDecisao("substituir_dados")} disabled={enviando || confirmacaoSubstituicao !== "SUBSTITUIR"}>Confirmar substituição</button>
            </div>
          </div>}

          {etapa === "sucesso" && <div className="login-setup-content">
            <div className="login-setup-success">{mensagemSucesso}</div>
            <p>Aguarde o próximo ciclo do sincronizador ou reinicie o serviço para continuar.</p>
            <button className="login-submit" type="button" onClick={() => { setEtapa("login"); setErro(null); }}>Voltar ao login</button>
          </div>}

          {erro && <div className="login-error" role="alert">{erro}</div>}

          {(etapa === "login" || etapa === "criar_senha") && <button className="login-submit" type="submit" disabled={enviando}>
            {enviando ? "Processando..." : etapa === "criar_senha" ? "Criar senha" : "Entrar"}
          </button>}

          <p className="login-security-note">Seus dados são transmitidos de forma segura.</p>
        </form>
      </section>
    </main>
  );
}
