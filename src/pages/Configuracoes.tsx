import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";

interface BtzapInstanceData {
  connected?: boolean;
  loggedIn?: boolean;
  status?: string | null;
  qrcode?: string | null;
  paircode?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  lastStatusAt?: string | null;
  lastQrCodeAt?: string | null;
  lastDisconnect?: unknown;
  lastDisconnectReason?: string | null;
}

interface BtzapConfigData {
  id: number;
  id_empresa?: string | null;
  nome_instancia: string | null;
  url_servidor: string | null;
  ativo: boolean | null;
  endpoint_envio_texto: string | null;
  metodo_envio_texto: string | null;
  formato_payload: string | null;
  token_instancia: string | null;
  ultimo_status_instancia: string | null;
  ultimo_status_em: string | null;
  ultimo_profile_name: string | null;
  ultimo_profile_pic_url: string | null;
  ultimo_connected: boolean | null;
  ultimo_logged_in: boolean | null;
  ultimo_qrcode_em: string | null;
}

type ParametroWhats = {
  id: string; empresa_id: string; tipo_envio: string; descricao: string | null; ativo: boolean;
  intervalo_min_segundos: number; intervalo_max_segundos: number; max_mensagens_por_minuto: number;
  max_mensagens_cliente_categoria_dia: number;
  max_mensagens_por_dia_inicial: number | null; max_mensagens_por_dia_estavel: number | null; usar_limite_estavel: boolean;
  horario_inicio: string | null; horario_fim: string | null; usar_janelas_envio: boolean;
  janela_manha_inicio: string | null; janela_manha_fim: string | null; janela_tarde_inicio: string | null; janela_tarde_fim: string | null;
  permite_segunda: boolean; permite_terca: boolean; permite_quarta: boolean; permite_quinta: boolean; permite_sexta: boolean;
  permite_sabado: boolean; permite_domingo: boolean; enviar_feriado: boolean; max_tentativas_reenvio: number;
  intervalo_primeira_tentativa_horas: number | null; intervalo_segunda_tentativa_horas: number | null;
  intervalo_reenvio_min_horas: number | null; intervalo_reenvio_max_horas: number | null; frequencia_minima_cliente_dias: number | null;
};

const PARAMETROS_PADRAO: Record<string, Partial<ParametroWhats>> = {
  geral: { ativo: true, intervalo_min_segundos: 30, intervalo_max_segundos: 60, max_mensagens_por_minuto: 2, max_mensagens_cliente_categoria_dia: 2, max_mensagens_por_dia_inicial: 50, max_mensagens_por_dia_estavel: 100, usar_limite_estavel: false, horario_inicio: "08:00", horario_fim: "19:00", usar_janelas_envio: false, janela_manha_inicio: null, janela_manha_fim: null, janela_tarde_inicio: null, janela_tarde_fim: null, permite_segunda: true, permite_terca: true, permite_quarta: true, permite_quinta: true, permite_sexta: true, permite_sabado: false, permite_domingo: false, enviar_feriado: false, max_tentativas_reenvio: 2, intervalo_primeira_tentativa_horas: 2, intervalo_segunda_tentativa_horas: 24, intervalo_reenvio_min_horas: null, intervalo_reenvio_max_horas: null, frequencia_minima_cliente_dias: 1 },
  cobranca: { ativo: true, intervalo_min_segundos: 30, intervalo_max_segundos: 60, max_mensagens_por_minuto: 2, max_mensagens_por_dia_inicial: 50, max_mensagens_por_dia_estavel: 100, usar_limite_estavel: false, horario_inicio: "08:00", horario_fim: "18:00", usar_janelas_envio: false, permite_segunda: true, permite_terca: true, permite_quarta: true, permite_quinta: true, permite_sexta: true, permite_sabado: false, permite_domingo: false, enviar_feriado: false, max_tentativas_reenvio: 2, intervalo_primeira_tentativa_horas: 2, intervalo_segunda_tentativa_horas: 24, intervalo_reenvio_min_horas: null, intervalo_reenvio_max_horas: null, frequencia_minima_cliente_dias: 1 },
  campanha_promocao: { ativo: true, intervalo_min_segundos: 60, intervalo_max_segundos: 120, max_mensagens_por_minuto: 1, max_mensagens_por_dia_inicial: 30, max_mensagens_por_dia_estavel: 100, usar_limite_estavel: false, horario_inicio: null, horario_fim: null, usar_janelas_envio: true, janela_manha_inicio: "09:00", janela_manha_fim: "11:30", janela_tarde_inicio: "14:00", janela_tarde_fim: "17:30", permite_segunda: true, permite_terca: true, permite_quarta: true, permite_quinta: true, permite_sexta: true, permite_sabado: false, permite_domingo: false, enviar_feriado: false, max_tentativas_reenvio: 1, intervalo_primeira_tentativa_horas: null, intervalo_segunda_tentativa_horas: null, intervalo_reenvio_min_horas: 24, intervalo_reenvio_max_horas: 48, frequencia_minima_cliente_dias: 7 },
  aniversario: { ativo: true, intervalo_min_segundos: 45, intervalo_max_segundos: 90, max_mensagens_por_minuto: 1, max_mensagens_por_dia_inicial: 50, max_mensagens_por_dia_estavel: 100, usar_limite_estavel: false, horario_inicio: "08:00", horario_fim: "18:00", usar_janelas_envio: false, permite_segunda: true, permite_terca: true, permite_quarta: true, permite_quinta: true, permite_sexta: true, permite_sabado: false, permite_domingo: false, enviar_feriado: false, max_tentativas_reenvio: 1, intervalo_primeira_tentativa_horas: 24, intervalo_segunda_tentativa_horas: null, intervalo_reenvio_min_horas: null, intervalo_reenvio_max_horas: null, frequencia_minima_cliente_dias: 1 },
  mensagem_programada: { ativo: true, intervalo_min_segundos: 45, intervalo_max_segundos: 90, max_mensagens_por_minuto: 1, max_mensagens_por_dia_inicial: 50, max_mensagens_por_dia_estavel: 100, usar_limite_estavel: false, horario_inicio: "08:00", horario_fim: "18:00", usar_janelas_envio: false, permite_segunda: true, permite_terca: true, permite_quarta: true, permite_quinta: true, permite_sexta: true, permite_sabado: false, permite_domingo: false, enviar_feriado: false, max_tentativas_reenvio: 2, intervalo_primeira_tentativa_horas: 2, intervalo_segunda_tentativa_horas: 24, intervalo_reenvio_min_horas: null, intervalo_reenvio_max_horas: null, frequencia_minima_cliente_dias: 1 },
};

function ParametrosWhatsForm({ empresaId }: { empresaId: string }) {
  const [itens, setItens] = useState<ParametroWhats[]>([]);
  const tipo = "geral";
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ erro: boolean; texto: string } | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      const token = sessionStorage.getItem("consulta_clipp_pro_saas_session") ?? "";
      const { data, error } = await supabase.rpc("fn_listar_parametros_whats", { p_token: token });
      if (!ativo) return;
      setFeedback(error ? { erro: true, texto: `Não foi possível carregar os parâmetros: ${error.message}` } : null);
      setItens(((data ?? []) as ParametroWhats[]).filter((item) => item.tipo_envio === "geral")); setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [empresaId]);

  const atual = itens.find((item) => item.tipo_envio === tipo);
  const alterar = (campo: keyof ParametroWhats, valor: unknown) => setItens((lista) => lista.map((item) => item.tipo_envio === tipo ? { ...item, [campo]: valor } : item));
  const numero = (campo: keyof ParametroWhats, permiteNulo = false) => (event: ChangeEvent<HTMLInputElement>) => {
    const valor = event.target.value; alterar(campo, permiteNulo && valor === "" ? null : Number(valor));
  };
  function restaurarPadrao() {
    const padrao = PARAMETROS_PADRAO[tipo];
    setItens((lista) => lista.map((item) => item.tipo_envio === tipo ? { ...item, ...padrao } : item));
    setFeedback({ erro: false, texto: "Padrão recomendado preenchido. Clique em Salvar parâmetros para aplicar." });
  }
  async function salvar() {
    if (!atual) return;
    if (atual.intervalo_min_segundos > atual.intervalo_max_segundos) return setFeedback({ erro: true, texto: "O intervalo mínimo não pode ser maior que o máximo." });
    if (atual.max_mensagens_por_minuto < 1) return setFeedback({ erro: true, texto: "O máximo por minuto deve ser pelo menos 1." });
    if (atual.max_mensagens_cliente_categoria_dia < 1) return setFeedback({ erro: true, texto: "O limite por categoria deve ser maior que zero." });
    const numericos = Object.entries(atual).filter(([chave]) => /intervalo|max_mensagens|frequencia/.test(chave));
    if (numericos.some(([, valor]) => valor != null && Number(valor) < 0)) return setFeedback({ erro: true, texto: "Os valores não podem ser negativos." });
    if (!atual.horario_inicio || !atual.horario_fim) return setFeedback({ erro: true, texto: "Informe o horário inicial e final." });
    if (atual.horario_inicio >= atual.horario_fim) return setFeedback({ erro: true, texto: "O horário inicial deve ser anterior ao horário final." });
    setSalvando(true); setFeedback(null);
    const { id: _id, empresa_id: _empresa, tipo_envio: _tipo, descricao: _descricao, ...dadosAtuais } = atual;
    const dados = { ...dadosAtuais, usar_janelas_envio: false, janela_manha_inicio: null, janela_manha_fim: null, janela_tarde_inicio: null, janela_tarde_fim: null };
    const token = sessionStorage.getItem("consulta_clipp_pro_saas_session") ?? "";
    const { error } = await supabase.rpc("fn_salvar_parametro_whats", { p_token: token, p_tipo_envio: tipo, p_dados: dados });
    setSalvando(false); setFeedback(error ? { erro: true, texto: error.message } : { erro: false, texto: "Parâmetros salvos com sucesso." });
  }
  if (carregando) return <article className="settings-card settings-whatsapp-parameters"><h2>Parâmetros de envio</h2><p>Carregando parâmetros...</p></article>;
  if (!atual) return <article className="settings-card settings-whatsapp-parameters"><h2>Parâmetros de envio</h2><p>Nenhum parâmetro disponível para esta empresa.</p></article>;
  const dias = [["permite_segunda","Seg"],["permite_terca","Ter"],["permite_quarta","Qua"],["permite_quinta","Qui"],["permite_sexta","Sex"],["permite_sabado","Sáb"],["permite_domingo","Dom"]] as const;
  const horarioResumo = `${atual.horario_inicio?.slice(0,5) ?? "-"}–${atual.horario_fim?.slice(0,5) ?? "-"}`;
  const fimSemanaAtivo = atual.permite_sabado || atual.permite_domingo || atual.enviar_feriado;
  const Field = ({ label, campo, min = 0, nulo = true }: { label: string; campo: keyof ParametroWhats; min?: number; nulo?: boolean }) => <label className="parameter-field"><span>{label}</span><input type="number" min={min} value={(atual[campo] as number | null) ?? ""} onChange={numero(campo, nulo)} /></label>;
  return <article className="settings-card settings-whatsapp-parameters">
    <header className="settings-parameter-header">
      <div><h2>Parâmetros gerais de envio WhatsApp</h2><p>Essas regras serão aplicadas a todos os envios antes do envio ao BTZap.</p></div>
      <span className="settings-protection-badge">Proteção ativa antes do BTZap</span>
    </header>
    <div className="settings-parameter-summary-grid">
      {[['Intervalo', `${atual.intervalo_min_segundos}–${atual.intervalo_max_segundos}s`, 'Tempo aleatório entre mensagens'], ['Limite/min', `${atual.max_mensagens_por_minuto}/min`, 'Máximo por minuto'], ['Limite diário', `${atual.usar_limite_estavel ? atual.max_mensagens_por_dia_estavel : atual.max_mensagens_por_dia_inicial}/dia`, 'Controle diário de envios'], ['Por categoria', `${atual.max_mensagens_cliente_categoria_dia}/dia`, 'Por cliente e tipo'], ['Horário', horarioResumo, 'Janela permitida'], ['Feriados', atual.enviar_feriado ? 'Permitido' : 'Bloqueado', 'Envio em feriados']].map(([titulo,valor,descricao]) => <div className="settings-parameter-summary-card" key={titulo}><span>{titulo}</span><strong>{valor}</strong><small>{descricao}</small></div>)}
    </div>

    <div className="settings-parameter-sections">
      <section className="settings-parameter-section parameter-status-section">
        <div className="parameter-section-heading"><h3>Status do parâmetro geral</h3><p>Defina se a proteção geral está ativa para os envios WhatsApp.</p></div>
        <label className="parameter-switch"><input type="checkbox" checked={atual.ativo} onChange={(e) => alterar("ativo", e.target.checked)} /><span className="parameter-switch-track" /><span><strong>Parâmetro {atual.ativo ? "ativo" : "inativo"}</strong><small>{atual.ativo ? "Esta configuração será usada em todos os envios." : "Os envios serão bloqueados até a proteção geral ser ativada."}</small></span></label>
      </section>

      <section className="settings-parameter-section">
        <div className="parameter-section-heading"><h3>Ritmo de envio</h3><p>O intervalo é sorteado aleatoriamente entre o mínimo e o máximo para evitar comportamento robótico.</p></div>
        <div className="parameter-fields-grid">
          <Field label="Intervalo mínimo (segundos)" campo="intervalo_min_segundos" nulo={false} />
          <Field label="Intervalo máximo (segundos)" campo="intervalo_max_segundos" nulo={false} />
          <Field label="Máximo por minuto" campo="max_mensagens_por_minuto" min={1} nulo={false} />
        </div>
        {atual.intervalo_min_segundos > atual.intervalo_max_segundos && <p className="parameter-inline-error">O intervalo mínimo não pode ser maior que o máximo.</p>}
      </section>

      <section className="settings-parameter-section">
        <div className="parameter-section-heading"><h3>Limite diário</h3><p>Máximo diário é o total de mensagens enviadas no dia. Não é um limite por cliente.</p></div>
        <div className="parameter-fields-grid">
          <Field label="Máximo diário inicial" campo="max_mensagens_por_dia_inicial" />
          <Field label="Máximo diário estável" campo="max_mensagens_por_dia_estavel" />
          <label className="parameter-switch compact"><input type="checkbox" checked={atual.usar_limite_estavel} onChange={(e) => alterar("usar_limite_estavel", e.target.checked)} /><span className="parameter-switch-track" /><span><strong>Usar limite estável</strong><small>Aplica o limite diário estável.</small></span></label>
        </div>
      </section>

      <section className="settings-parameter-section">
        <div className="parameter-section-heading"><h3>Limite por categoria</h3><p>Define quantas mensagens o mesmo cliente pode receber por categoria no mesmo dia.</p></div>
        <div className="parameter-fields-grid">
          <Field label="Máximo de mensagens por categoria no dia" campo="max_mensagens_cliente_categoria_dia" min={1} nulo={false} />
        </div>
        <p className="parameter-help">Com limite 2, o cliente pode receber até 2 cobranças, 2 campanhas, 2 aniversários e 2 mensagens programadas no mesmo dia. A 3ª mensagem da mesma categoria será bloqueada antes do BTZap.</p>
        {atual.max_mensagens_cliente_categoria_dia > 5 && <p className="parameter-warning">Limites altos por categoria podem aumentar reclamações e risco de bloqueio.</p>}
        {atual.max_mensagens_cliente_categoria_dia < 1 && <p className="parameter-inline-error">O limite por categoria deve ser maior que zero.</p>}
      </section>

      <section className="settings-parameter-section">
        <div className="parameter-section-heading"><h3>Horários permitidos</h3><p>Fora desses horários, a mensagem não será enviada ao BTZap e ficará aguardando nova tentativa.</p></div>
        <div className="parameter-fields-grid time-grid">
          <label className="parameter-field"><span>Horário inicial</span><input type="time" value={atual.horario_inicio?.slice(0,5) ?? ""} onChange={(e) => alterar("horario_inicio", e.target.value)} /></label>
          <label className="parameter-field"><span>Horário final</span><input type="time" value={atual.horario_fim?.slice(0,5) ?? ""} onChange={(e) => alterar("horario_fim", e.target.value)} /></label>
        </div>
      </section>

      <section className="settings-parameter-section">
        <div className="parameter-section-heading"><h3>Dias permitidos</h3><p>Selecione em quais dias os envios podem ser processados.</p></div>
        <div className="settings-parameter-days">{dias.map(([campo,label]) => <label className={atual[campo] ? "selected" : ""} key={campo}><input type="checkbox" checked={atual[campo]} onChange={(e) => alterar(campo, e.target.checked)} /><span>{label}</span></label>)}</div>
        <label className="parameter-switch compact holiday-switch"><input type="checkbox" checked={atual.enviar_feriado} onChange={(e) => alterar("enviar_feriado", e.target.checked)} /><span className="parameter-switch-track" /><span><strong>Enviar em feriados</strong><small>{atual.enviar_feriado ? "Permitido" : "Bloqueado"}</small></span></label>
        {fimSemanaAtivo && <p className="parameter-warning">Atenção: envios em finais de semana ou feriados podem aumentar o risco de bloqueio ou reclamação.</p>}
      </section>

      <section className="settings-parameter-section">
        <div className="parameter-section-heading"><h3>Reenvio por erro técnico</h3><p>Reenvio é usado apenas em falha no BTZap, timeout ou conexão. Nunca em opt-out, número inválido ou cliente sem permissão.</p></div>
        <div className="parameter-fields-grid">
          <Field label="Máximo de reenvios" campo="max_tentativas_reenvio" nulo={false} />
          <Field label="Primeira tentativa (horas)" campo="intervalo_primeira_tentativa_horas" />
          <Field label="Segunda tentativa (horas)" campo="intervalo_segunda_tentativa_horas" />
          <Field label="Reenvio mínimo (horas)" campo="intervalo_reenvio_min_horas" />
          <Field label="Reenvio máximo (horas)" campo="intervalo_reenvio_max_horas" />
        </div>
      </section>

    </div>
    {feedback && <div className={`feedback-box ${feedback.erro ? "feedback-error" : "feedback-success"}`}>{feedback.texto}</div>}
    <footer className="settings-parameter-actions"><span>As alterações serão aplicadas nos próximos envios.</span><div><button className="secondary-button" type="button" onClick={restaurarPadrao} disabled={salvando}>Restaurar padrão recomendado</button><button className="primary-button" type="button" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar parâmetros"}</button></div></footer>
  </article>;
}

function TokenFieldIcon({ name }: { name: "eye" | "eyeOff" | "copy" }) {
  if (name === "copy") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
  if (name === "eyeOff") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.6 10.6 0 0 1 12 4c6 0 9 8 9 8a15.4 15.4 0 0 1-2.1 3.2M6.6 6.6C4.2 8.1 3 12 3 12s3 8 9 8a9.8 9.8 0 0 0 4.1-.9" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3-8 9-8 9 8 9 8-3 8-9 8-9-8-9-8Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "-";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function isStatusConectado(status: string | null | undefined) {
  const statusNormalizado = String(status ?? "").trim().toLowerCase();

  return (
    statusNormalizado === "connected" ||
    statusNormalizado === "open" ||
    statusNormalizado === "conectado"
  );
}

function isInstanciaConectada(data: BtzapInstanceData | null) {
  return Boolean(
    data?.connected === true ||
      data?.loggedIn === true ||
      isStatusConectado(data?.status)
  );
}

function formatarStatusSalvoWhatsapp(status: string | null | undefined) {
  const valor = String(status ?? "").trim().toLowerCase();
  if (["connected", "open", "conectado"].includes(valor)) return "Conectado";
  if (["connecting", "conectando"].includes(valor)) return "Conectando";
  if (["disconnected", "close", "closed", "desconectado"].includes(valor)) return "Desconectado";
  return status || "-";
}

function existeStatusSalvo(config: BtzapConfigData | null) {
  return Boolean(
    config?.ultimo_status_instancia ||
      config?.ultimo_status_em ||
      config?.ultimo_connected === true ||
      config?.ultimo_logged_in === true ||
      config?.ultimo_connected === false ||
      config?.ultimo_logged_in === false ||
      config?.ultimo_profile_name ||
      config?.ultimo_profile_pic_url
  );
}

function montarStatusSalvoWhatsapp(config: BtzapConfigData | null): BtzapInstanceData | null {
  if (!config || !existeStatusSalvo(config)) {
    return null;
  }

  const conectado = Boolean(
    config.ultimo_connected === true ||
      config.ultimo_logged_in === true ||
      isStatusConectado(config.ultimo_status_instancia)
  );

  return {
    connected: conectado,
    loggedIn: Boolean(config.ultimo_logged_in === true || conectado),
    status: config.ultimo_status_instancia || (conectado ? "connected" : "disconnected"),
    profileName: config.ultimo_profile_name || "-",
    profilePicUrl: config.ultimo_profile_pic_url || null,
    lastStatusAt: config.ultimo_status_em || null,
    lastQrCodeAt: config.ultimo_qrcode_em || null,
    qrcode: null,
    paircode: null,
  };
}

function mapFunctionToInstanceData(data: BtzapInstanceData): BtzapInstanceData {
  const conectado = Boolean(
    data.connected === true ||
      data.loggedIn === true ||
      isStatusConectado(data.status)
  );

  return {
    ...data,
    connected: conectado,
    loggedIn: Boolean(data.loggedIn === true || conectado),
    status: data.status || (conectado ? "connected" : "disconnected"),
    profileName: data.profileName || "-",
    profilePicUrl: data.profilePicUrl || null,
    lastStatusAt: data.lastStatusAt ?? new Date().toISOString(),
    lastQrCodeAt: data.lastQrCodeAt ?? (data.qrcode ? new Date().toISOString() : null),
    qrcode: data.qrcode || null,
    paircode: data.paircode || null,
  };
}

function getMensagemStatusInstancia(data: BtzapInstanceData | null) {
  if (!data) return null;

  if (isInstanciaConectada(data)) {
    return "WhatsApp conectado com sucesso.";
  }

  if (data.qrcode) {
    return "Aguardando leitura do QR Code.";
  }

  if (data.status || data.lastStatusAt) {
    return "Último status consultado.";
  }

  return null;
}

export function Configuracoes() {
  const { usuario } = useAuth();
  const [nomeInstancia, setNomeInstancia] = useState("");
  const [urlServidor, setUrlServidor] = useState("");
  const [endpointEnvioTexto, setEndpointEnvioTexto] = useState("/send/text");
  const [metodoEnvioTexto, setMetodoEnvioTexto] = useState("POST");
  const [formatoPayload, setFormatoPayload] = useState("btzap");
  const [tokenInstancia, setTokenInstancia] = useState("");
  const [mostrarToken, setMostrarToken] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [configEncontrada, setConfigEncontrada] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [telefoneConexao, setTelefoneConexao] = useState("");
  const [gerandoQrCode, setGerandoQrCode] = useState(false);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);

  const [dadosInstancia, setDadosInstancia] = useState<BtzapInstanceData | null>(null);
  const [mensagemInstancia, setMensagemInstancia] = useState<string | null>(null);
  const [erroInstancia, setErroInstancia] = useState<string | null>(null);

  const [pollingAtivo, setPollingAtivo] = useState(false);
  const [carregandoConfiguracoes, setCarregandoConfiguracoes] = useState(true);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const dadosInstanciaAtualRef = useRef<BtzapInstanceData | null>(null);

  function definirDadosInstancia(dados: BtzapInstanceData | null) {
    dadosInstanciaAtualRef.current = dados;
    setDadosInstancia(dados);
  }

  function limparFormularioConfiguracao() {
    setNomeInstancia("");
    setUrlServidor("");
    setEndpointEnvioTexto("/send/text");
    setMetodoEnvioTexto("POST");
    setFormatoPayload("btzap");
    setTokenInstancia("");
    setAtivo(true);
    setConfigEncontrada(false);
    definirDadosInstancia(null);
    setMensagemInstancia("WhatsApp não configurado para esta empresa.");
    setErroInstancia(null);
  }

 async function carregarConfiguracoes() {
  setCarregandoConfiguracoes(true);
  setErro(null);
  setMensagem(null);

  if (!usuario?.id_empresa) {
    limparFormularioConfiguracao();
    setErro("Empresa da sessão não identificada.");
    setCarregandoConfiguracoes(false);
    return;
  }

  const { data, error } = await supabase.functions.invoke("btzap-get-config", {
    body: { id_empresa: usuario.id_empresa },
  });

  if (error) {
    console.error("Erro ao chamar Edge Function btzap-get-config:", error);
    setErro(`Erro ao carregar configurações da BTZap: ${error.message}`);
    definirDadosInstancia(null);
    setMensagemInstancia(null);
    setCarregandoConfiguracoes(false);
    return;
  }

  if (data?.success === false) {
    console.error("Erro retornado pela btzap-get-config:", data);
    setErro(data?.message ?? "Erro ao carregar configurações da BTZap.");
    definirDadosInstancia(null);
    setMensagemInstancia(null);
    setCarregandoConfiguracoes(false);
    return;
  }

  if (!data?.config) {
    limparFormularioConfiguracao();
    setMensagem(data?.message ?? "Nenhuma configuração BTZap cadastrada para esta empresa.");
    setCarregandoConfiguracoes(false);
    return;
  }

  const config = data.config as BtzapConfigData;
  setConfigEncontrada(true);

  setNomeInstancia(config.nome_instancia ?? "");
  setUrlServidor(config.url_servidor ?? "");
  setEndpointEnvioTexto(config.endpoint_envio_texto ?? "/send/text");
  setMetodoEnvioTexto(config.metodo_envio_texto ?? "POST");
  setFormatoPayload(config.formato_payload ?? "btzap");
  setAtivo(config.ativo !== false);
  setTokenInstancia(config.token_instancia ?? "");

  const dadosSalvos = montarStatusSalvoWhatsapp(config);

  definirDadosInstancia(dadosSalvos);
  setMensagemInstancia(getMensagemStatusInstancia(dadosSalvos));

  setCarregandoConfiguracoes(false);
}

  async function salvarConfiguracoes() {
    setMensagem(null);
    setErro(null);

    if (!nomeInstancia.trim() || !urlServidor.trim()) {
      setErro("Nome da instância e URL do servidor são obrigatórios.");
      return;
    }

    if (!usuario?.id_empresa) {
      setErro("Empresa da sessão não identificada.");
      return;
    }

    setSalvando(true);

    const { data, error } = await supabase.functions.invoke("btzap-save-config", {
      body: {
        id_empresa: usuario.id_empresa,
        nome_instancia: nomeInstancia.trim(),
        token_instancia: tokenInstancia.trim(),
        url_servidor: urlServidor.trim(),
        endpoint_envio_texto: endpointEnvioTexto.trim(),
        metodo_envio_texto: metodoEnvioTexto.trim(),
        formato_payload: formatoPayload.trim(),
        ativo,
      },
    });

    setSalvando(false);

    if (error) {
      setErro(`Erro ao chamar Edge Function btzap-save-config: ${error.message}`);
      return;
    }

    if (data?.success === false) {
      setErro(data?.message ?? "Erro ao salvar configurações da BTZap.");
      return;
    }

    setMensagem(data?.message ?? "Configurações salvas com sucesso.");
    await carregarConfiguracoes();
  }

  async function copiarTokenInstancia() {
    setMensagem(null);
    setErro(null);
    if (!tokenInstancia.trim()) {
      setErro("Nenhum token para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(tokenInstancia);
      setMensagem("Token copiado com sucesso.");
    } catch {
      setErro("Não foi possível copiar o token.");
    }
  }

  async function testarConexao() {
    setMensagem(null);
    setErro(null);

    if (!usuario?.id_empresa) {
      setErro("Empresa da sessão não identificada.");
      return;
    }

    if (!configEncontrada) {
      setErro("Nenhuma configuração BTZap cadastrada para esta empresa.");
      return;
    }

    setTestando(true);

    const { data, error } = await supabase.functions.invoke("btzap-test-connection", {
      body: { id_empresa: usuario.id_empresa },
    });

    setTestando(false);

    if (error) {
      setErro(`Erro ao chamar Edge Function btzap-test-connection: ${error.message}`);
      return;
    }

    if (data?.success === false) {
      setErro(
        data?.error
          ? `${data.message} ${data.error}`
          : data?.message ?? "Não foi possível validar a conexão BTZap."
      );
      return;
    }

    setMensagem(data?.message ?? "Conexão BTZap validada com sucesso.");
  }

  function getStatusInstanciaLabel(data: BtzapInstanceData | null) {
    if (carregandoConfiguracoes && !data) {
      return "Carregando status da conexão...";
    }

    if (!data) {
      return "WhatsApp não configurado para esta empresa.";
    }

    if (isInstanciaConectada(data)) {
      return "WhatsApp Conectado";
    }

    if (data.qrcode) {
      return "Aguardando leitura do QR Code";
    }

    if (data.status || data.lastStatusAt) {
      return "WhatsApp Desconectado";
    }

    return "Status ainda não consultado";
  }

  function atualizarDadosInstancia(data: BtzapInstanceData, mensagemPadrao?: string) {
    const dadosRecebidos = mapFunctionToInstanceData(data);
    const dadosAnteriores = dadosInstanciaAtualRef.current;
    const conectado = isInstanciaConectada(dadosRecebidos);
    const dadosAtualizados: BtzapInstanceData = {
      ...dadosRecebidos,
      qrcode: conectado ? null : dadosRecebidos.qrcode || dadosAnteriores?.qrcode || null,
      paircode: conectado ? null : dadosRecebidos.paircode || dadosAnteriores?.paircode || null,
      lastQrCodeAt: dadosRecebidos.lastQrCodeAt || dadosAnteriores?.lastQrCodeAt || null,
    };

    definirDadosInstancia(dadosAtualizados);
    setMensagemInstancia(getMensagemStatusInstancia(dadosAtualizados) || mensagemPadrao || null);

    if (isInstanciaConectada(dadosAtualizados)) {
      setPollingAtivo(false);
    }

    return dadosAtualizados;
  }

  async function gerarQrCode() {
    setErroInstancia(null);

    if (!usuario?.id_empresa || !configEncontrada) {
      setErroInstancia("WhatsApp não configurado para esta empresa.");
      return;
    }

    setGerandoQrCode(true);

    const { data, error } = await supabase.functions.invoke("btzap-connect-instance", {
      body: {
        id_empresa: usuario.id_empresa,
        phone: telefoneConexao.trim(),
      },
    });

    setGerandoQrCode(false);

    if (error) {
      setErroInstancia(`Erro ao chamar Edge Function btzap-connect-instance: ${error.message}`);
      return;
    }

    if (data?.success === false) {
      setErroInstancia(
        data?.error
          ? `${data.message} ${data.error}`
          : data?.message ?? "Não foi possível gerar o QR Code."
      );
      return;
    }

    const dadosAtualizados = atualizarDadosInstancia(
      data,
      data?.message || "QR Code gerado com sucesso."
    );

    if (dadosAtualizados.qrcode && !isInstanciaConectada(dadosAtualizados)) {
      setPollingAtivo(true);
    }

  }

  async function atualizarStatusInstancia(silencioso = false) {
    if (!usuario?.id_empresa || !configEncontrada) {
      if (!silencioso) {
        setErroInstancia("WhatsApp não configurado para esta empresa.");
      }
      return;
    }

    if (!silencioso) {
      setErroInstancia(null);
      setAtualizandoStatus(true);
    }

    const { data, error } = await supabase.functions.invoke("btzap-instance-status", {
      body: { id_empresa: usuario.id_empresa },
    });

    if (!silencioso) {
      setAtualizandoStatus(false);
    }

    if (error) {
      if (!silencioso) {
        setErroInstancia(`Erro ao chamar Edge Function btzap-instance-status: ${error.message}`);
      }
      return;
    }

    if (data?.success === false) {
      if (!silencioso) {
        setErroInstancia(
          data?.error
            ? `${data.message} ${data.error}`
            : data?.message ?? "Não foi possível atualizar o status."
        );
      }
      return;
    }

    const dadosAtualizados = atualizarDadosInstancia(
      data,
      data?.message || "Status atualizado."
    );

    if (!silencioso) {
      setMensagemInstancia(
        getMensagemStatusInstancia(dadosAtualizados) || data?.message || "Status atualizado."
      );
    }

  }

  useEffect(() => {
    if (!usuario?.id_empresa) return;
    void carregarConfiguracoes();
  }, [usuario?.id_empresa]);

  useEffect(() => {
    if (!pollingAtivo) return undefined;

    const iniciouEm = Date.now();

    const intervalId = window.setInterval(() => {
      if (Date.now() - iniciouEm >= 120000) {
        setPollingAtivo(false);
        return;
      }

      void atualizarStatusInstancia(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [pollingAtivo]);

  return (
    <main className="settings-page">
      <GlobalPageHeader title="Configurações" subtitle="Gerencie as configurações do sistema e da integração com WhatsApp." icon="settings" />

      <section className="settings-panel">
        <div className="panel-title">
          <h2>Configuração BTZap / WhatsApp</h2>
        </div>

        <div className="btzap-debug-card" aria-label="Diagnóstico da configuração BTZap">
          <div>
            <span>Empresa atual</span>
            <strong>{usuario?.empresa_nome_fantasia || usuario?.empresa_razao_social || usuario?.cnpj || "-"}</strong>
          </div>
          <div>
            <span>id_empresa atual</span>
            <strong>{usuario?.id_empresa || "-"}</strong>
          </div>
          <div>
            <span>Configuração BTZap encontrada</span>
            <strong>{configEncontrada ? "Sim" : "Não"}</strong>
          </div>
        </div>

        <div className="btzap-form">
          <label>
            <span>Nome da Instância</span>
            <input
              value={nomeInstancia}
              onChange={(event) => setNomeInstancia(event.target.value)}
            />
          </label>

          <label>
            <span>Token da Instância</span>
            <div className="btzap-token-field">
              <input
                type={mostrarToken ? "text" : "password"}
                placeholder="digite aqui"
                value={tokenInstancia}
                onChange={(event) => setTokenInstancia(event.target.value)}
                autoComplete="off"
              />
              <div className="btzap-token-actions">
                <button type="button" title={mostrarToken ? "Ocultar token" : "Visualizar token"} aria-label={mostrarToken ? "Ocultar token" : "Visualizar token"} onClick={() => setMostrarToken((visivel) => !visivel)}>
                  <TokenFieldIcon name={mostrarToken ? "eyeOff" : "eye"} />
                </button>
                <button type="button" title="Copiar token" aria-label="Copiar token" onClick={() => void copiarTokenInstancia()}>
                  <TokenFieldIcon name="copy" />
                </button>
              </div>
            </div>
            <small className="field-help">
              O token fica oculto por padrão e é usado apenas pelas funções seguras do servidor.
            </small>
          </label>

          <label>
            <span>URL do Servidor</span>
            <input
              value={urlServidor}
              onChange={(event) => setUrlServidor(event.target.value)}
            />
          </label>

          <label>
            <span>Endpoint de envio de texto</span>
            <input
              value={endpointEnvioTexto}
              onChange={(event) => setEndpointEnvioTexto(event.target.value)}
            />
          </label>

          <label>
            <span>Método de envio</span>
            <select
              value={metodoEnvioTexto}
              onChange={(event) => setMetodoEnvioTexto(event.target.value)}
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </select>
          </label>

          <label>
            <span>Formato do payload</span>
            <select
              value={formatoPayload}
              onChange={(event) => setFormatoPayload(event.target.value)}
            >
              <option value="btzap">btzap</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label className="toggle-field">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(event) => setAtivo(event.target.checked)}
            />
            <span>Ativo</span>
          </label>
        </div>

        <div className="settings-actions">
          <button
            className="primary-button"
            type="button"
            onClick={salvarConfiguracoes}
            disabled={salvando}
          >
            {salvando ? "Salvando..." : "Salvar configurações"}
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={testarConexao}
            disabled={testando}
          >
            {testando ? "Testando..." : "Testar conexão"}
          </button>
        </div>

        {mensagem && <div className="feedback-box feedback-success">{mensagem}</div>}
        {erro && <div className="feedback-box feedback-error">{erro}</div>}

        <div className="btzap-connection-panel">
          <div className="btzap-connection-layout">
            <div className="btzap-connection-left">
              <div className="connection-title">
                <h2>Conexão WhatsApp</h2>
                <p>Gerencie o status da conexão e o pareamento da instância WhatsApp.</p>
              </div>

              <div className="btzap-connection-form">
                <label>
                  <span>Telefone para pareamento</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="553199999888"
                    value={telefoneConexao}
                    onChange={(event) => setTelefoneConexao(event.target.value)}
                  />
                  <small className="field-help">
                    Informe apenas se for gerar um novo QR Code para parear outro aparelho.
                    <br />
                    Para atualizar o status da conexão atual, este campo pode ficar vazio.
                  </small>
                </label>

                <div className="settings-actions btzap-connection-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={gerarQrCode}
                    disabled={gerandoQrCode}
                  >
                    {gerandoQrCode ? "Gerando QR Code..." : "Gerar novo QR-Code"}
                  </button>

                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void atualizarStatusInstancia()}
                    disabled={atualizandoStatus}
                  >
                    {atualizandoStatus ? "Atualizando..." : "Atualizar Status"}
                  </button>
                </div>
              </div>
              {dadosInstancia?.qrcode && !isInstanciaConectada(dadosInstancia) && (
                <div className="btzap-qrcode-box btzap-qrcode-connection-card">
                  <img src={dadosInstancia.qrcode} alt="QR Code WhatsApp" />
                  <p>
                    Abra o WhatsApp no celular, vá em Aparelhos conectados e escaneie o QR Code.
                  </p>
                </div>
              )}
            </div>
          </div>

            <div className="btzap-connection-right">
              <div className="btzap-status-card-heading">
                <h3>Status da Conexão</h3>
                <p>Informações retornadas pela última consulta da instância WhatsApp.</p>
              </div>
              {mensagemInstancia && (
                <div className="feedback-box feedback-success">{mensagemInstancia}</div>
              )}

              {erroInstancia && (
                <div className="feedback-box feedback-error">{erroInstancia}</div>
              )}

              <div className="btzap-instance-status">
                <div className="btzap-instance-details">
                  <dl>
                    <div className="btzap-status-main-row">
                      <div>
                        <dt>Status</dt>
                        <dd>{getStatusInstanciaLabel(dadosInstancia)}</dd>
                      </div>
                      {dadosInstancia?.profilePicUrl && isInstanciaConectada(dadosInstancia) && (
                        <img src={dadosInstancia.profilePicUrl} alt="Perfil WhatsApp" />
                      )}
                    </div>

                    {dadosInstancia ? (
                      <>
                        <div>
                          <dt>Status salvo</dt>
                          <dd>{formatarStatusSalvoWhatsapp(dadosInstancia.status)}</dd>
                        </div>

                        <div>
                          <dt>Conectado</dt>
                          <dd>{isInstanciaConectada(dadosInstancia) ? "Sim" : "Não"}</dd>
                        </div>

                        <div>
                          <dt>Perfil</dt>
                          <dd>{dadosInstancia.profileName || "-"}</dd>
                        </div>

                        <div>
                          <dt>Última verificação</dt>
                          <dd>{formatarDataHora(dadosInstancia.lastStatusAt)}</dd>
                        </div>

                        <div>
                          <dt>Código de pareamento</dt>
                          <dd>{dadosInstancia.paircode || "-"}</dd>
                        </div>
                      </>
                    ) : (
                      <div>
                        <dt>Orientação</dt>
                        <dd>Clique em Atualizar status ou Gerar QR Code para verificar a conexão.</dd>
                      </div>
                    )}
                  </dl>
                </div>

              </div>
            </div>
        </div>
      </section>

      <section className="settings-grid">
        {usuario?.id_empresa && <ParametrosWhatsForm empresaId={usuario.id_empresa} />}
      </section>
    </main>
  );
}
