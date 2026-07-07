-- Camada de parametros e auditoria obrigatoria para todos os envios WhatsApp.
create table if not exists public.tab_parametro_whats (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.tab_empresas(id) on delete cascade,
  tipo_envio text not null,
  descricao text,
  ativo boolean not null default true,
  intervalo_min_segundos integer not null,
  intervalo_max_segundos integer not null,
  max_mensagens_por_minuto integer not null,
  max_mensagens_por_dia_inicial integer,
  max_mensagens_por_dia_estavel integer,
  usar_limite_estavel boolean not null default false,
  horario_inicio time,
  horario_fim time,
  usar_janelas_envio boolean not null default false,
  janela_manha_inicio time,
  janela_manha_fim time,
  janela_tarde_inicio time,
  janela_tarde_fim time,
  permite_segunda boolean not null default true,
  permite_terca boolean not null default true,
  permite_quarta boolean not null default true,
  permite_quinta boolean not null default true,
  permite_sexta boolean not null default true,
  permite_sabado boolean not null default false,
  permite_domingo boolean not null default false,
  enviar_feriado boolean not null default false,
  max_tentativas_reenvio integer not null default 0,
  intervalo_primeira_tentativa_horas integer,
  intervalo_segunda_tentativa_horas integer,
  intervalo_reenvio_min_horas integer,
  intervalo_reenvio_max_horas integer,
  frequencia_minima_cliente_dias integer,
  timezone text not null default 'America/Sao_Paulo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tab_parametro_whats_tipo_check check (tipo_envio in ('geral','cobranca','campanha_promocao','aniversario','mensagem_programada')),
  constraint tab_parametro_whats_intervalo_check check (intervalo_min_segundos >= 0 and intervalo_min_segundos <= intervalo_max_segundos),
  constraint tab_parametro_whats_minuto_check check (max_mensagens_por_minuto > 0),
  constraint tab_parametro_whats_tentativas_check check (max_tentativas_reenvio >= 0),
  constraint tab_parametro_whats_empresa_tipo_key unique (empresa_id, tipo_envio)
);

create index if not exists idx_tab_parametro_whats_empresa on public.tab_parametro_whats(empresa_id);
create index if not exists idx_tab_parametro_whats_empresa_tipo_ativo on public.tab_parametro_whats(empresa_id, tipo_envio, ativo);
drop trigger if exists trg_tab_parametro_whats_atualizado_em on public.tab_parametro_whats;
create trigger trg_tab_parametro_whats_atualizado_em before update on public.tab_parametro_whats
for each row execute function public.set_atualizado_em();

create table if not exists public.tab_feriados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.tab_empresas(id) on delete cascade,
  data date not null,
  nome text not null,
  tipo text not null default 'manual',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_tab_feriados_data_empresa on public.tab_feriados(data, empresa_id) where ativo;
create unique index if not exists ux_tab_feriados_empresa_data_nome on public.tab_feriados(coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid), data, nome);

-- tab_whatsapp_envios ja existe. Mantem id_empresa e tipo_envio legados e acrescenta
-- categoria_envio para nao transformar antigos valores envio/reenvio.
alter table public.tab_whatsapp_envios add column if not exists categoria_envio text;
alter table public.tab_whatsapp_envios add column if not exists cliente_id text;
alter table public.tab_whatsapp_envios add column if not exists motivo_bloqueio text;
alter table public.tab_whatsapp_envios add column if not exists proxima_tentativa_em timestamptz;
alter table public.tab_whatsapp_envios add column if not exists tentativas integer default 0;
alter table public.tab_whatsapp_envios add column if not exists ultimo_envio_em timestamptz;
alter table public.tab_whatsapp_envios add column if not exists parametro_whats_id uuid references public.tab_parametro_whats(id) on delete set null;
alter table public.tab_whatsapp_envios add column if not exists intervalo_sorteado_segundos integer;
alter table public.tab_whatsapp_envios add column if not exists processado_em timestamptz;
alter table public.tab_whatsapp_envios add column if not exists referencia_id text;
update public.tab_whatsapp_envios set
  processado_em = coalesce(processado_em, enviado_em, criado_em),
  ultimo_envio_em = coalesce(ultimo_envio_em, enviado_em),
  categoria_envio = coalesce(categoria_envio, case
    when upper(coalesce(origem_modulo,'')) = 'CAMPANHA' then 'campanha_promocao'
    when upper(coalesce(origem_modulo,'')) = 'CONTA_RECEBER' or lower(coalesce(origem,'')) like '%cobran%' or id_ctarec is not null then 'cobranca'
    when lower(coalesce(origem,'')) like '%anivers%' then 'aniversario'
    when upper(coalesce(origem_envio,'')) = 'MENSAGEM_PROGRAMADA' then 'mensagem_programada'
    else 'geral' end)
where status = 'enviado' and (processado_em is null or categoria_envio is null or ultimo_envio_em is null);
create index if not exists idx_whats_envios_empresa_categoria_status on public.tab_whatsapp_envios(id_empresa, categoria_envio, status);
create index if not exists idx_whats_envios_proxima_tentativa on public.tab_whatsapp_envios(proxima_tentativa_em) where proxima_tentativa_em is not null;
create index if not exists idx_whats_envios_cliente_id on public.tab_whatsapp_envios(id_empresa, cliente_id);
create index if not exists idx_whats_envios_telefone on public.tab_whatsapp_envios(id_empresa, cliente_telefone);
create index if not exists idx_whats_envios_criado_em on public.tab_whatsapp_envios(id_empresa, criado_em);

-- A fila existente recebe os dados necessarios para manter bloqueios temporarios.
alter table public.tb_msg_programadas add column if not exists tipo_envio text;
alter table public.tb_msg_programadas add column if not exists motivo_bloqueio text;
alter table public.tb_msg_programadas add column if not exists proxima_tentativa_em timestamptz;
create index if not exists idx_msg_programadas_proxima_tentativa on public.tb_msg_programadas(id_empresa, proxima_tentativa_em)
where enviado = false and ativo = true;

create or replace function public.fn_garantir_parametros_whats_empresa(p_empresa_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_empresa_id is null or not exists (select 1 from public.tab_empresas where id = p_empresa_id) then
    raise exception 'Empresa invalida.';
  end if;
  insert into public.tab_parametro_whats (
    empresa_id,tipo_envio,descricao,ativo,intervalo_min_segundos,intervalo_max_segundos,max_mensagens_por_minuto,
    max_mensagens_por_dia_inicial,max_mensagens_por_dia_estavel,usar_limite_estavel,horario_inicio,horario_fim,
    usar_janelas_envio,janela_manha_inicio,janela_manha_fim,janela_tarde_inicio,janela_tarde_fim,
    permite_segunda,permite_terca,permite_quarta,permite_quinta,permite_sexta,permite_sabado,permite_domingo,enviar_feriado,
    max_tentativas_reenvio,intervalo_primeira_tentativa_horas,intervalo_segunda_tentativa_horas,
    intervalo_reenvio_min_horas,intervalo_reenvio_max_horas,frequencia_minima_cliente_dias,timezone
  ) values
  (p_empresa_id,'geral','Parametro padrao para envios sem regra especifica',true,45,90,1,50,100,false,'08:00','18:00',false,null,null,null,null,true,true,true,true,true,false,false,false,2,2,24,null,null,1,'America/Sao_Paulo'),
  (p_empresa_id,'cobranca','Parametros para cobrancas, lembretes de vencimento e contas a receber',true,30,60,2,50,100,false,'08:00','18:00',false,null,null,null,null,true,true,true,true,true,false,false,false,2,2,24,null,null,1,'America/Sao_Paulo'),
  (p_empresa_id,'campanha_promocao','Parametros para campanhas promocionais e acoes de marketing',true,60,120,1,30,100,false,null,null,true,'09:00','11:30','14:00','17:30',true,true,true,true,true,false,false,false,1,null,null,24,48,7,'America/Sao_Paulo'),
  (p_empresa_id,'aniversario','Parametros para mensagens de aniversario',true,45,90,1,50,100,false,'08:00','18:00',false,null,null,null,null,true,true,true,true,true,false,false,false,1,24,null,null,null,1,'America/Sao_Paulo'),
  (p_empresa_id,'mensagem_programada','Parametros para mensagens programadas manualmente',true,45,90,1,50,100,false,'08:00','18:00',false,null,null,null,null,true,true,true,true,true,false,false,false,2,2,24,null,null,1,'America/Sao_Paulo')
  on conflict (empresa_id,tipo_envio) do nothing;
end; $$;

do $$ declare e record; begin
  for e in select id from public.tab_empresas loop perform public.fn_garantir_parametros_whats_empresa(e.id); end loop;
end $$;

create or replace function public.fn_garantir_parametros_whats_nova_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.fn_garantir_parametros_whats_empresa(new.id); return new; end; $$;
drop trigger if exists trg_garantir_parametros_whats_nova_empresa on public.tab_empresas;
create trigger trg_garantir_parametros_whats_nova_empresa after insert on public.tab_empresas
for each row execute function public.fn_garantir_parametros_whats_nova_empresa();

grant select on public.tab_feriados to anon, authenticated;
grant execute on function public.fn_garantir_parametros_whats_empresa(uuid) to anon, authenticated;

alter table public.tab_parametro_whats enable row level security;
revoke all on public.tab_parametro_whats from anon, authenticated;

create or replace function public.fn_listar_parametros_whats(p_token text)
returns setof public.tab_parametro_whats language sql security definer set search_path = public as $$
  select p.* from public.tab_parametro_whats p
  join public.tab_usuarios_saas u on u.id_empresa = p.empresa_id
  join public.tab_sessoes_saas s on s.id_usuario = u.id
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.encerrado_em is null and s.expira_em > now() and u.ativo = true and u.bloqueado = false
  order by p.tipo_envio;
$$;

create or replace function public.fn_salvar_parametro_whats(p_token text, p_tipo_envio text, p_dados jsonb)
returns public.tab_parametro_whats language plpgsql security definer set search_path = public as $$
declare v_empresa uuid; v_result public.tab_parametro_whats;
begin
  select u.id_empresa into v_empresa from public.tab_sessoes_saas s
  join public.tab_usuarios_saas u on u.id = s.id_usuario
  where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.encerrado_em is null and s.expira_em > now() and u.ativo = true and u.bloqueado = false limit 1;
  if v_empresa is null then raise exception 'Sessao invalida ou expirada.'; end if;
  update public.tab_parametro_whats set
    ativo=coalesce((p_dados->>'ativo')::boolean,ativo),
    intervalo_min_segundos=coalesce((p_dados->>'intervalo_min_segundos')::integer,intervalo_min_segundos),
    intervalo_max_segundos=coalesce((p_dados->>'intervalo_max_segundos')::integer,intervalo_max_segundos),
    max_mensagens_por_minuto=coalesce((p_dados->>'max_mensagens_por_minuto')::integer,max_mensagens_por_minuto),
    max_mensagens_por_dia_inicial=(p_dados->>'max_mensagens_por_dia_inicial')::integer,
    max_mensagens_por_dia_estavel=(p_dados->>'max_mensagens_por_dia_estavel')::integer,
    usar_limite_estavel=coalesce((p_dados->>'usar_limite_estavel')::boolean,usar_limite_estavel),
    horario_inicio=(p_dados->>'horario_inicio')::time, horario_fim=(p_dados->>'horario_fim')::time,
    usar_janelas_envio=coalesce((p_dados->>'usar_janelas_envio')::boolean,usar_janelas_envio),
    janela_manha_inicio=(p_dados->>'janela_manha_inicio')::time, janela_manha_fim=(p_dados->>'janela_manha_fim')::time,
    janela_tarde_inicio=(p_dados->>'janela_tarde_inicio')::time, janela_tarde_fim=(p_dados->>'janela_tarde_fim')::time,
    permite_segunda=coalesce((p_dados->>'permite_segunda')::boolean,permite_segunda), permite_terca=coalesce((p_dados->>'permite_terca')::boolean,permite_terca),
    permite_quarta=coalesce((p_dados->>'permite_quarta')::boolean,permite_quarta), permite_quinta=coalesce((p_dados->>'permite_quinta')::boolean,permite_quinta),
    permite_sexta=coalesce((p_dados->>'permite_sexta')::boolean,permite_sexta), permite_sabado=coalesce((p_dados->>'permite_sabado')::boolean,permite_sabado),
    permite_domingo=coalesce((p_dados->>'permite_domingo')::boolean,permite_domingo), enviar_feriado=coalesce((p_dados->>'enviar_feriado')::boolean,enviar_feriado),
    max_tentativas_reenvio=coalesce((p_dados->>'max_tentativas_reenvio')::integer,max_tentativas_reenvio),
    intervalo_primeira_tentativa_horas=(p_dados->>'intervalo_primeira_tentativa_horas')::integer,
    intervalo_segunda_tentativa_horas=(p_dados->>'intervalo_segunda_tentativa_horas')::integer,
    intervalo_reenvio_min_horas=(p_dados->>'intervalo_reenvio_min_horas')::integer,
    intervalo_reenvio_max_horas=(p_dados->>'intervalo_reenvio_max_horas')::integer,
    frequencia_minima_cliente_dias=(p_dados->>'frequencia_minima_cliente_dias')::integer
  where empresa_id=v_empresa and tipo_envio=p_tipo_envio returning * into v_result;
  if v_result.id is null then raise exception 'Parametro nao encontrado.'; end if;
  return v_result;
end; $$;
grant execute on function public.fn_listar_parametros_whats(text) to anon, authenticated;
grant execute on function public.fn_salvar_parametro_whats(text,text,jsonb) to anon, authenticated;
