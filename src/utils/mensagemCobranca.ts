import type { ContaReceber } from "../types/contasReceber";

const moedaFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function montarMensagemCobrancaWhatsapp(conta: ContaReceber) {
  const nome = conta.cliente_nome ? ` ${conta.cliente_nome}` : "";
  const valor = moedaFormatter.format(Number(conta.vlr_ctarec ?? 0));

  return `Olá${nome}, tudo bem com você?

Gostaria de informar que consta conosco uma pendência no valor de ${valor}, referente ao documento ${conta.documento ?? "-"}.

Para evitar multas, bloqueios ou demais transtornos, gostaríamos de contar com sua atenção para regularizar esse débito.

Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.

Att,
Gerência.`;
}
