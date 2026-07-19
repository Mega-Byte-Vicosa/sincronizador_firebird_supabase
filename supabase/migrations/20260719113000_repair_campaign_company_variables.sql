-- Repara campanhas criadas sem a empresa e filas ainda não enviadas que perderam
-- a assinatura ao resolver {{empresa}} como texto vazio.
update public.tb_msg_programadas as mensagem
set mensagem = regexp_replace(
  rtrim(mensagem.mensagem),
  '(Att,|Atenciosamente,)[[:space:]]*$',
  E'\\1\n' || coalesce(nullif(trim(empresa.nome_fantasia), ''), nullif(trim(empresa.razao_social), ''), 'Nossa empresa'),
  'i'
)
from public.tab_campanha as campanha
join public.tab_empresas as empresa on empresa.id = campanha.id_empresa
where mensagem.id_empresa = campanha.id_empresa
  and mensagem.origem_modulo = 'CAMPANHA'
  and mensagem.id_origem = campanha.id::text
  and mensagem.enviado = false
  and mensagem.ativo = true
  and upper(coalesce(mensagem.status, '')) not in ('CANCELADO', 'CANCELADA', 'EXCLUIDO', 'EXCLUÍDO')
  and nullif(trim(campanha.empresa_destino), '') is null
  and campanha.mensagem ~* '\{\{[[:space:]]*(empresa|nome_empresa|empresa_nome|razao_social|fantasia|nome_fantasia)[[:space:]]*\}\}'
  and mensagem.mensagem ~* '(Att,|Atenciosamente,)[[:space:]]*$';

update public.tab_campanha as campanha
set empresa_destino = coalesce(
  nullif(trim(empresa.nome_fantasia), ''),
  nullif(trim(empresa.razao_social), ''),
  'Nossa empresa'
)
from public.tab_empresas as empresa
where empresa.id = campanha.id_empresa
  and nullif(trim(campanha.empresa_destino), '') is null;
