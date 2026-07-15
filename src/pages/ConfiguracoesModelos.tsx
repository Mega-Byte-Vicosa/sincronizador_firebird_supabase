import { useEffect, useState } from "react";
import { GlobalPageHeader } from "../components/layout/GlobalPageHeader";
import { supabase } from "../lib/supabaseClient";
import { buscarConfigModelosMensagem, CONFIG_MODELOS_PADRAO, type ConfigModelosMensagem } from "../utils/modelosMensagem";

export function ConfiguracoesModelos() {
  const [config, setConfig] = useState<ConfigModelosMensagem>(CONFIG_MODELOS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ erro: boolean; texto: string } | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarConfigModelosMensagem()
      .then((dados) => { if (ativo) setConfig(dados); })
      .catch((error) => { if (ativo) setFeedback({ erro: true, texto: error instanceof Error ? error.message : "Não foi possível carregar as configurações." }); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  async function salvar() {
    setSalvando(true); setFeedback(null);
    const token = sessionStorage.getItem("consulta_clipp_pro_saas_session") ?? "";
    const { error } = await supabase.rpc("fn_salvar_config_modelos", {
      p_token: token,
      p_cliente_negrito: config.cliente_negrito,
      p_empresa_negrito: config.empresa_negrito,
    });
    setSalvando(false);
    setFeedback(error ? { erro: true, texto: error.message } : { erro: false, texto: "Configurações salvas com sucesso." });
  }

  return <main className="page settings-page model-format-settings-page">
    <GlobalPageHeader icon="settings" title="Configurações de Modelos" subtitle="Defina como as variáveis dos modelos serão formatadas nas mensagens enviadas pelo WhatsApp." />
    <section className="settings-card model-format-settings-card">
      {carregando ? <p>Carregando configurações...</p> : <>
        <label className="parameter-switch">
          <input type="checkbox" checked={config.cliente_negrito} onChange={(e) => setConfig({ ...config, cliente_negrito: e.target.checked })} />
          <span className="parameter-switch-track" />
          <span><strong>Cliente em negrito</strong><small>Quando ativado, o nome do cliente será enviado em negrito nas mensagens.</small></span>
        </label>
        <label className="parameter-switch">
          <input type="checkbox" checked={config.empresa_negrito} onChange={(e) => setConfig({ ...config, empresa_negrito: e.target.checked })} />
          <span className="parameter-switch-track" />
          <span><strong>Empresa em negrito</strong><small>Quando ativado, o nome da empresa será enviado em negrito nas mensagens.</small></span>
        </label>
        <div className="model-format-preview">Exemplo: Olá, {config.cliente_negrito ? "*João*" : "João"}. A empresa {config.empresa_negrito ? "*Mega Byte*" : "Mega Byte"} informa...</div>
      </>}
      {feedback && <div className={`feedback-box ${feedback.erro ? "feedback-error" : "feedback-success"}`}>{feedback.texto}</div>}
      <footer className="settings-parameter-actions"><span>As alterações serão aplicadas aos próximos modelos utilizados.</span><button className="primary-button" type="button" onClick={() => void salvar()} disabled={carregando || salvando}>{salvando ? "Salvando..." : "Salvar configurações"}</button></footer>
    </section>
  </main>;
}
