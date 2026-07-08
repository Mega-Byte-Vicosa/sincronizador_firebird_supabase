update public.tab_whatsapp_envios
set erro = 'Limite máximo de tentativas de reenvio atingido. A mensagem não será reenviada automaticamente.'
where motivo_bloqueio = 'erro_btzap'
  and (erro is null or btrim(erro) = '');
