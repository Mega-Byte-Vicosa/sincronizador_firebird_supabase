export type OrigemModuloMensagemProgramada = "CONTA_RECEBER" | "CAMPANHA" | "ANIVERSARIANTE";
export type TipoAgendamentoMensagemProgramada = "UNICO" | "RECORRENTE";
export type TipoRepeticaoMensagemProgramada = "DIARIA" | "SEMANAL" | "MENSAL" | "ANUAL" | "PERSONALIZADA";
export type StatusMensagemProgramada =
  | "PENDENTE"
  | "AGENDADO"
  | "AGENDADA"
  | "PROCESSANDO"
  | "ENVIADO"
  | "ENVIADA"
  | "CANCELADO"
  | "CANCELADA"
  | "ERRO";

export interface MensagemProgramada {
  id_msg_programada: string;
  id_empresa?: string;
  origem_modulo: OrigemModuloMensagemProgramada;
  id_origem: string | null;
  titulo: string;
  descricao: string | null;
  destinatario_nome: string | null;
  destinatario_telefone: string;
  mensagem: string;
  tipo_agendamento: TipoAgendamentoMensagemProgramada;
  data_envio: string;
  hora_envio: string;
  executar_em: string;
  processando_em: string | null;
  ultima_tentativa_em: string | null;
  tentativas_envio: number;
  repetir: boolean;
  tipo_repeticao: TipoRepeticaoMensagemProgramada | null;
  intervalo_repeticao: number | null;
  quantidade_repeticoes: number | null;
  data_fim_repeticao: string | null;
  status: StatusMensagemProgramada;
  enviado: boolean;
  data_hora_envio: string | null;
  erro_envio: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
