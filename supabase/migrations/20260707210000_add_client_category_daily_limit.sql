alter table public.tab_parametro_whats
  add column if not exists max_mensagens_cliente_categoria_dia integer not null default 2;

comment on column public.tab_parametro_whats.max_mensagens_cliente_categoria_dia is
  'Quantidade maxima de mensagens por cliente por categoria/tipo de envio no mesmo dia.';

update public.tab_parametro_whats
set max_mensagens_cliente_categoria_dia = 2
where max_mensagens_cliente_categoria_dia is null;

-- O motivo detalhado passa a poder ser persistido no status do historico.
alter table public.tab_whatsapp_envios
  drop constraint if exists tab_whatsapp_envios_status_check;

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
    max_mensagens_cliente_categoria_dia=coalesce((p_dados->>'max_mensagens_cliente_categoria_dia')::integer,max_mensagens_cliente_categoria_dia),
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
