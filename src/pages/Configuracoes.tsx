import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";

const secoes = ["Mensagens automáticas", "Parâmetros de envio", "Manutenção da integração"];

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
  ultimo_status_instancia: string | null;
  ultimo_status_em: string | null;
  ultimo_profile_name: string | null;
  ultimo_profile_pic_url: string | null;
  ultimo_connected: boolean | null;
  ultimo_logged_in: boolean | null;
  ultimo_qrcode_em: string | null;
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

  console.log("Configuração BTZap carregada pela Edge:", config);

  setNomeInstancia(config.nome_instancia ?? "");
  setUrlServidor(config.url_servidor ?? "");
  setEndpointEnvioTexto(config.endpoint_envio_texto ?? "/send/text");
  setMetodoEnvioTexto(config.metodo_envio_texto ?? "POST");
  setFormatoPayload(config.formato_payload ?? "btzap");
  setAtivo(config.ativo !== false);
  setTokenInstancia("");

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

    setTokenInstancia("");
    setMensagem(data?.message ?? "Configurações salvas com sucesso.");
    await carregarConfiguracoes();
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
      return "WhatsApp conectado";
    }

    if (data.qrcode) {
      return "Aguardando leitura do QR Code";
    }

    if (data.status || data.lastStatusAt) {
      return "WhatsApp desconectado";
    }

    return "Status ainda não consultado";
  }

  function atualizarDadosInstancia(data: BtzapInstanceData, mensagemPadrao?: string) {
    const dadosAtualizados = mapFunctionToInstanceData(data);

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

    await carregarConfiguracoes();
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

    await carregarConfiguracoes();
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
            <input
              type="password"
              placeholder="digite aqui"
              value={tokenInstancia}
              onChange={(event) => setTokenInstancia(event.target.value)}
            />
            <small className="field-help">
              O token não é exibido após salvar e será usado apenas pelas funções seguras do servidor.
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
            </div>

            <div className="btzap-connection-right">
              {mensagemInstancia && (
                <div className="feedback-box feedback-success">{mensagemInstancia}</div>
              )}

              {erroInstancia && (
                <div className="feedback-box feedback-error">{erroInstancia}</div>
              )}

              <div className="btzap-instance-status">
                <div className="btzap-instance-details">
                  {dadosInstancia?.profilePicUrl && (
                    <img src={dadosInstancia.profilePicUrl} alt="Perfil WhatsApp" />
                  )}

                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{getStatusInstanciaLabel(dadosInstancia)}</dd>
                    </div>

                    {dadosInstancia ? (
                      <>
                        <div>
                          <dt>Status salvo</dt>
                          <dd>{dadosInstancia.status || "-"}</dd>
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
                          <dd>{dadosInstancia.paircode}</dd>
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

                {dadosInstancia?.qrcode && !isInstanciaConectada(dadosInstancia) && (
                  <div className="btzap-qrcode-box">
                    <img src={dadosInstancia.qrcode} alt="QR Code WhatsApp" />
                    <p>
                      Abra o WhatsApp no celular, vá em Aparelhos conectados e escaneie o QR Code.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-grid">
        {secoes.map((secao) => (
          <article className="settings-card" key={secao}>
            <h2>{secao}</h2>
            <p>Área reservada para configuração futura.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
