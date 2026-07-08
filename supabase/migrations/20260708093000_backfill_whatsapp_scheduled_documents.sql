update public.tab_whatsapp_envios h
set documento = c.documento
from public.firebird_contas_receber c
where h.id_empresa = c.id_empresa
  and h.documento is null
  and (
    h.id_ctarec = c.id_ctarec
    or (
      h.id_origem ~ '^[0-9]+$'
      and h.id_origem::bigint = c.id_ctarec
    )
    or (
      h.referencia_id ~ '^[0-9]+$'
      and h.referencia_id::bigint = c.id_ctarec
    )
  );
