export interface WhatsappEnvio {
  id: string;
  id_empresa?: string;
  criado_em: string | null;
  enviado_em: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  origem: string | null;
  documento: string | null;
  mensagem: string | null;
  status: string | null;
  tipo_envio: string | null;
  erro: string | null;
  origem_envio: string | null;
  origem_modulo: string | null;
  id_msg_programada: string | null;
  id_origem: string | null;
  mensagem_id_externo?: string | null;
  status_entrega?: string | null;
  enviado_api_em?: string | null;
  entregue_em?: string | null;
  lido_em?: string | null;
  falhou_em?: string | null;
  webhook_ultimo_evento?: unknown | null;
  response_payload?: unknown | null;
}
