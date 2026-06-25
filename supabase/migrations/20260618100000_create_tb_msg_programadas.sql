create table if not exists public.tb_msg_programadas (
  id_msg_programada uuid primary key default gen_random_uuid(),
  origem_modulo varchar(50) not null,
  id_origem uuid null,
  titulo varchar(150) not null,
  descricao text null,
  destinatario_nome varchar(150) null,
  destinatario_telefone varchar(30) not null,
  mensagem text not null,
  tipo_agendamento varchar(30) not null default 'UNICO',
  data_envio date not null,
  hora_envio time not null,
  repetir boolean not null default false,
  tipo_repeticao varchar(30) null,
  intervalo_repeticao integer null default 1,
  quantidade_repeticoes integer null,
  data_fim_repeticao date null,
  status varchar(30) not null default 'PENDENTE',
  enviado boolean not null default false,
  data_hora_envio timestamp null,
  erro_envio text null,
  ativo boolean not null default true,
  criado_em timestamp not null default now(),
  atualizado_em timestamp not null default now(),
  constraint tb_msg_programadas_origem_modulo_check
    check (origem_modulo in ('CONTA_RECEBER', 'CAMPANHA', 'ANIVERSARIANTE')),
  constraint tb_msg_programadas_tipo_agendamento_check
    check (tipo_agendamento in ('UNICO', 'RECORRENTE')),
  constraint tb_msg_programadas_tipo_repeticao_check
    check (tipo_repeticao is null or tipo_repeticao in ('DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL', 'PERSONALIZADA')),
  constraint tb_msg_programadas_status_check
    check (status in ('PENDENTE', 'AGENDADA', 'ENVIADA', 'CANCELADA', 'ERRO')),
  constraint tb_msg_programadas_intervalo_repeticao_check
    check (intervalo_repeticao is null or intervalo_repeticao >= 1),
  constraint tb_msg_programadas_quantidade_repeticoes_check
    check (quantidade_repeticoes is null or quantidade_repeticoes >= 1)
);

create index if not exists idx_tb_msg_programadas_status
on public.tb_msg_programadas (status);

create index if not exists idx_tb_msg_programadas_data_hora
on public.tb_msg_programadas (data_envio, hora_envio);

create index if not exists idx_tb_msg_programadas_origem
on public.tb_msg_programadas (origem_modulo, id_origem);

create index if not exists idx_tb_msg_programadas_ativo
on public.tb_msg_programadas (ativo);

create or replace function public.set_tb_msg_programadas_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_tb_msg_programadas_atualizado_em on public.tb_msg_programadas;

create trigger trg_tb_msg_programadas_atualizado_em
before update on public.tb_msg_programadas
for each row
execute function public.set_tb_msg_programadas_atualizado_em();

alter table public.tb_msg_programadas enable row level security;

drop policy if exists "Frontend pode consultar mensagens programadas" on public.tb_msg_programadas;
drop policy if exists "Frontend pode cadastrar mensagens programadas" on public.tb_msg_programadas;
drop policy if exists "Frontend pode atualizar mensagens programadas" on public.tb_msg_programadas;

create policy "Frontend pode consultar mensagens programadas"
on public.tb_msg_programadas
for select
to anon, authenticated
using (true);

create policy "Frontend pode cadastrar mensagens programadas"
on public.tb_msg_programadas
for insert
to anon, authenticated
with check (true);

create policy "Frontend pode atualizar mensagens programadas"
on public.tb_msg_programadas
for update
to anon, authenticated
using (true)
with check (true);
