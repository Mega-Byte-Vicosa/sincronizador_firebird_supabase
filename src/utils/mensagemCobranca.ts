import type { ContaReceber } from "../types/contasReceber";
import { calcularValorAtualContaReceber, getCategoriaModeloConta } from "./modelosMensagem";

const moedaFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function montarMensagemCobrancaWhatsapp(conta: ContaReceber) {
  const nome = conta.cliente_nome ? ` ${conta.cliente_nome}` : "";
  const contaVencida = getCategoriaModeloConta(conta) === "contas_receber_vencida";
  const valor = moedaFormatter.format(
    contaVencida ? calcularValorAtualContaReceber(conta) : Number(conta.vlr_ctarec ?? 0),
  );
  const descricaoValor = contaVencida ? "valor atualizado para pagamento hoje" : "valor";

  return `Olá${nome}, tudo bem?

Identificamos uma pendência referente ao documento ${conta.documento ?? "-"}.

O ${descricaoValor} é ${valor}.${contaVencida ? " Esse valor já considera os encargos aplicáveis até a data de hoje." : ""}

Pedimos, por gentileza, que regularize o pagamento ou entre em contato conosco.

Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.

Atenciosamente.`;
}
