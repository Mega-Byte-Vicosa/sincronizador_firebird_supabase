update public.tab_whatsapp_envios
set mensagem_id_externo = coalesce(
      response_payload ->> 'messageId',
      response_payload ->> 'message_id',
      response_payload ->> 'messageid',
      response_payload #>> '{key,id}',
      response_payload #>> '{data,messageId}',
      response_payload #>> '{data,message_id}',
      response_payload #>> '{data,messageid}',
      response_payload #>> '{data,key,id}',
      response_payload #>> '{result,messageId}',
      response_payload #>> '{result,message_id}',
      response_payload #>> '{result,messageid}',
      response_payload #>> '{result,key,id}',
      response_payload ->> 'id',
      response_payload #>> '{data,id}',
      response_payload #>> '{result,id}'
    ),
    status_entrega = 'ENVIADO_API',
    enviado_api_em = coalesce(enviado_api_em, enviado_em, criado_em)
where mensagem_id_externo is null
  and status = 'enviado'
  and response_payload is not null
  and coalesce(
      response_payload ->> 'messageId',
      response_payload ->> 'message_id',
      response_payload ->> 'messageid',
      response_payload #>> '{key,id}',
      response_payload #>> '{data,messageId}',
      response_payload #>> '{data,message_id}',
      response_payload #>> '{data,messageid}',
      response_payload #>> '{data,key,id}',
      response_payload #>> '{result,messageId}',
      response_payload #>> '{result,message_id}',
      response_payload #>> '{result,messageid}',
      response_payload #>> '{result,key,id}',
      response_payload ->> 'id',
      response_payload #>> '{data,id}',
      response_payload #>> '{result,id}'
    ) is not null;
