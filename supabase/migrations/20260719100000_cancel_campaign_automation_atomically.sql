alter table public.tab_automacao_execucao_itens
  drop constraint if exists tab_automacao_execucao_itens_status_check;

alter table public.tab_automacao_execucao_itens
  add constraint tab_automacao_execucao_itens_status_check
  check (status in ('pendente', 'enviado', 'erro', 'cancelado'));

create or replace function public.fn_cancelar_campanha(
  p_id_empresa uuid,
  p_id_campanha uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tab_campanha
  set status = 'cancelada',
      automacao_status = case when automatizada then 'encerrada' else automacao_status end,
      automacao_proxima_execucao_em = null,
      atualizado_em = now()
  where id_empresa = p_id_empresa
    and id = p_id_campanha
    and status not in ('cancelada', 'concluida');

  if not found then
    raise exception 'Campanha não encontrada ou já finalizada.';
  end if;

  update public.tb_msg_programadas
  set status = 'CANCELADO',
      enviado = false,
      erro_envio = 'Campanha cancelada manualmente.',
      proxima_tentativa_em = null,
      processando_em = null,
      atualizado_em = now()
  where id_empresa = p_id_empresa
    and origem_modulo = 'CAMPANHA'
    and id_origem = p_id_campanha::text
    and ativo = true
    and enviado = false
    and status in ('PENDENTE', 'AGENDADO', 'AGENDADA', 'PROCESSANDO');

  update public.tab_automacao_execucao_itens
  set status = 'cancelado',
      erro_envio = 'Campanha cancelada manualmente.',
      proxima_tentativa_em = null,
      motivo_bloqueio = 'campanha_cancelada',
      atualizado_em = now()
  where id_empresa = p_id_empresa
    and id_campanha = p_id_campanha
    and status = 'pendente';

  update public.tab_campanha_clientes
  set status_envio = 'cancelado',
      erro_envio = 'Campanha cancelada manualmente.'
  where id_empresa = p_id_empresa
    and id_campanha = p_id_campanha
    and status_envio = 'pendente';
end;
$$;

revoke all on function public.fn_cancelar_campanha(uuid, uuid) from public;
grant execute on function public.fn_cancelar_campanha(uuid, uuid) to anon, authenticated, service_role;

update public.tab_campanha
set automacao_status = 'encerrada',
    automacao_proxima_execucao_em = null,
    atualizado_em = now()
where status = 'cancelada'
  and automatizada = true
  and automacao_status = 'ativa';

update public.tb_msg_programadas mensagem
set status = 'CANCELADO',
    enviado = false,
    erro_envio = 'Campanha cancelada manualmente.',
    proxima_tentativa_em = null,
    processando_em = null,
    atualizado_em = now()
from public.tab_campanha campanha
where campanha.id_empresa = mensagem.id_empresa
  and campanha.id::text = mensagem.id_origem
  and campanha.status = 'cancelada'
  and mensagem.origem_modulo = 'CAMPANHA'
  and mensagem.ativo = true
  and mensagem.enviado = false
  and mensagem.status in ('PENDENTE', 'AGENDADO', 'AGENDADA', 'PROCESSANDO');

update public.tab_automacao_execucao_itens item
set status = 'cancelado',
    erro_envio = 'Campanha cancelada manualmente.',
    motivo_bloqueio = 'campanha_cancelada',
    proxima_tentativa_em = null,
    atualizado_em = now()
from public.tab_campanha campanha
where campanha.id = item.id_campanha
  and campanha.id_empresa = item.id_empresa
  and campanha.status = 'cancelada'
  and item.status = 'pendente';
