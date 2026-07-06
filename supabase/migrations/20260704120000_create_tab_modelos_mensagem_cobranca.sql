create table if not exists public.tab_modelos_mensagem (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.tab_empresas(id) on delete cascade,
  nome text not null,
  categoria text not null,
  canal text not null default 'whatsapp_email',
  assunto text,
  corpo text not null,
  ativo boolean not null default true,
  padrao boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tab_modelos_mensagem_empresa_categoria_nome_key unique (id_empresa, categoria, nome)
);

create index if not exists idx_tab_modelos_mensagem_id_empresa on public.tab_modelos_mensagem (id_empresa);
create index if not exists idx_tab_modelos_mensagem_categoria on public.tab_modelos_mensagem (categoria);
create index if not exists idx_tab_modelos_mensagem_ativo on public.tab_modelos_mensagem (ativo);
create index if not exists idx_tab_modelos_mensagem_empresa_categoria on public.tab_modelos_mensagem (id_empresa, categoria, ativo);

drop trigger if exists trg_tab_modelos_mensagem_atualizado_em on public.tab_modelos_mensagem;
create trigger trg_tab_modelos_mensagem_atualizado_em before update on public.tab_modelos_mensagem
for each row execute function public.set_atualizado_em();

alter table public.tab_modelos_mensagem enable row level security;
grant select on public.tab_modelos_mensagem to anon, authenticated;
drop policy if exists "Frontend pode consultar modelos de cobranca da empresa" on public.tab_modelos_mensagem;
create policy "Frontend pode consultar modelos de cobranca da empresa"
on public.tab_modelos_mensagem for select to anon, authenticated using (true);

create or replace function public.fn_criar_modelos_cobranca_padrao(p_id_empresa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.tab_modelos_mensagem (id_empresa, nome, categoria, canal, assunto, corpo, ativo, padrao)
  select p_id_empresa, v.nome, v.categoria, 'whatsapp_email', v.assunto, v.corpo, true, true
  from (values
    ('A vencer - Aviso preventivo', 'contas_receber_a_vencer', 'Título a vencer - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Estamos enviando este lembrete sobre o título {{documento}}, com vencimento em {{data_vencimento}}, no valor de {{valor_original}}.

Realizando o pagamento até a data de vencimento, você evita multa, juros ou qualquer acréscimo.

Caso já tenha realizado o pagamento, por favor desconsidere esta mensagem.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('A vencer - Lembrete objetivo', 'contas_receber_a_vencer', 'Lembrete de vencimento - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

O título {{documento}} está próximo do vencimento.

Vencimento: {{data_vencimento}}
Valor: {{valor_original}}

Pedimos, por gentileza, que programe o pagamento até a data informada para evitar encargos.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('A vencer - Próximo ao vencimento', 'contas_receber_a_vencer', 'Seu título vence em breve - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Passando para lembrar que o título {{documento}}, no valor de {{valor_original}}, vence em {{data_vencimento}}.

O pagamento até o vencimento evita cobrança de multa e juros.

Se precisar de alguma informação ou segunda via, entre em contato conosco.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('Em Carência - Aviso amigável', 'contas_receber_carencia', 'Título em carência - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Identificamos que o título {{documento}} venceu em {{data_vencimento}}, no valor de {{valor_original}}.

Este título ainda está dentro do período de carência até {{data_final_carencia}}. Portanto, pagando até essa data, não haverá cobrança de multa ou juros.

Caso já tenha realizado o pagamento, por favor desconsidere esta mensagem.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('Em Carência - Lembrete objetivo', 'contas_receber_carencia', 'Título em período de carência - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

O título {{documento}}, com vencimento em {{data_vencimento}}, no valor original de {{valor_original}}, ainda está em período de carência.

Você pode realizar o pagamento até {{data_final_carencia}} sem acréscimo de multa ou juros.

Após esse prazo, caso o pagamento não seja identificado, o valor poderá ser atualizado com multa e juros calculados desde a data original de vencimento.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('Em Carência - Último aviso antes dos encargos', 'contas_receber_carencia', 'Últimos dias de carência do seu título - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Este é um lembrete sobre o título {{documento}}, vencido em {{data_vencimento}}, no valor de {{valor_original}}.

O prazo de carência termina em {{data_final_carencia}}.

Pagando até essa data, você evita a cobrança de multa e juros. Após o fim da carência, o valor será atualizado com encargos calculados desde o vencimento original.

Caso precise de ajuda ou já tenha feito o pagamento, entre em contato conosco.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('Vencidas - Cobrança amigável', 'contas_receber_vencida', 'Título vencido - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Consta em nosso sistema um título vencido em aberto.

Documento: {{documento}}
Vencimento: {{data_vencimento}}
Valor original: {{valor_original}}
Valor atualizado até {{data_envio}}: {{valor_atual}}

O valor atualizado informado acima considera multa e juros calculados até a data de envio desta cobrança.

Caso o pagamento já tenha sido realizado, por favor desconsidere esta mensagem ou nos envie o comprovante.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('Vencidas - Cobrança objetiva', 'contas_receber_vencida', 'Pendência financeira em aberto - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Identificamos uma pendência financeira em aberto referente ao documento {{documento}}.

Vencimento original: {{data_vencimento}}
Valor original: {{valor_original}}
Valor atualizado até {{data_envio}}: {{valor_atual}}

Este valor atualizado é válido para a data de envio desta cobrança. Após essa data, poderão ocorrer novos acréscimos de juros.

Pedimos, por gentileza, que regularize o pagamento ou entre em contato conosco.

Atenciosamente,
{{empresa_nome}}$msg$),
    ('Vencidas - Aviso de regularização', 'contas_receber_vencida', 'Regularização de título vencido - {{empresa_nome}}', $msg$Olá, {{cliente_nome}}.

Estamos entrando em contato para lembrar que o título {{documento}} permanece em aberto.

Data de vencimento: {{data_vencimento}}
Valor original: {{valor_original}}
Valor atualizado até {{data_envio}}: {{valor_atual}}

O valor atualizado considera os encargos aplicáveis até a data desta mensagem. Caso o pagamento seja realizado em outra data, o valor poderá sofrer alteração.

Para regularizar ou solicitar mais informações, entre em contato conosco.

Atenciosamente,
{{empresa_nome}}$msg$)
  ) as v(nome, categoria, assunto, corpo)
  on conflict (id_empresa, categoria, nome) do nothing;
end;
$$;

do $$ declare empresa record; begin
  for empresa in select id from public.tab_empresas loop
    perform public.fn_criar_modelos_cobranca_padrao(empresa.id);
  end loop;
end $$;

create or replace function public.fn_criar_modelos_cobranca_nova_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_criar_modelos_cobranca_padrao(new.id);
  return new;
end;
$$;

drop trigger if exists trg_criar_modelos_cobranca_nova_empresa on public.tab_empresas;
create trigger trg_criar_modelos_cobranca_nova_empresa after insert on public.tab_empresas
for each row execute function public.fn_criar_modelos_cobranca_nova_empresa();
