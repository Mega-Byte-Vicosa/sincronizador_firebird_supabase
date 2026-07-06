-- Cada empresa deve possuir sua própria configuração BTZap/WhatsApp.
-- Não cria nem copia configuração para empresas novas.

do $$
begin
  if exists (
    select 1
    from public.tab_btzap_config
    group by id_empresa
    having count(*) > 1
  ) then
    raise exception 'Existem empresas com mais de uma configuração BTZap. Corrija as duplicidades antes de aplicar a unicidade.';
  end if;
end;
$$;

create unique index if not exists ux_tab_btzap_config_id_empresa
  on public.tab_btzap_config (id_empresa);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tab_btzap_config'::regclass
      and contype = 'f'
      and conname = 'tab_btzap_config_id_empresa_fkey'
  ) then
    alter table public.tab_btzap_config
      add constraint tab_btzap_config_id_empresa_fkey
      foreign key (id_empresa)
      references public.tab_empresas(id)
      on delete cascade;
  end if;
end;
$$;

comment on column public.tab_btzap_config.id_empresa is
  'Empresa proprietária exclusiva desta configuração de WhatsApp/BTZap.';
