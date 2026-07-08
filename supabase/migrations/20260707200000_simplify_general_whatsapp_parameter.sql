-- Todos os envios passam a usar uma unica configuracao geral.
-- Registros especificos existentes sao preservados para compatibilidade.
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
  ) values (
    p_empresa_id,'geral','Parametro geral para todos os envios WhatsApp',true,60,120,1,
    50,100,false,'08:00','18:00',false,null,null,null,null,
    true,true,true,true,true,false,false,false,2,2,24,null,null,1,'America/Sao_Paulo'
  ) on conflict (empresa_id,tipo_envio) do nothing;
end; $$;

-- Ajusta somente o valor padrao anterior recém-criado, sem sobrescrever configuracoes personalizadas.
update public.tab_parametro_whats
set intervalo_min_segundos = 60,
    intervalo_max_segundos = 120,
    descricao = 'Parametro geral para todos os envios WhatsApp'
where tipo_envio = 'geral'
  and intervalo_min_segundos = 45
  and intervalo_max_segundos = 90;
