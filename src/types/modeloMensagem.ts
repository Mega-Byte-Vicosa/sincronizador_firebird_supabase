export type CategoriaModeloMensagem =
  | "contas_receber_a_vencer"
  | "contas_receber_carencia"
  | "contas_receber_vencida";

export interface ModeloMensagem {
  id: string;
  id_empresa: string;
  nome: string;
  categoria: CategoriaModeloMensagem | string;
  canal: string;
  assunto: string | null;
  corpo: string;
  ativo: boolean;
  padrao: boolean;
  criado_em?: string;
  atualizado_em?: string;
}
