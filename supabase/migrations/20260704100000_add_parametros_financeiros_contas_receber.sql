ALTER TABLE public.firebird_contas_receber
ADD COLUMN IF NOT EXISTS perc_multa numeric(12,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tipo_juros text DEFAULT 'S',
ADD COLUMN IF NOT EXISTS perc_juros numeric(12,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS dias_carencia integer DEFAULT 0;

COMMENT ON COLUMN public.firebird_contas_receber.perc_multa IS
'Percentual de multa vindo da tabela Firebird TB_PARAMETRO, registro PERC_MULTA.';

COMMENT ON COLUMN public.firebird_contas_receber.tipo_juros IS
'Tipo de juros vindo da tabela Firebird TB_PARAMETRO, registro TIPO_JUROS. S = simples, C = composto.';

COMMENT ON COLUMN public.firebird_contas_receber.perc_juros IS
'Percentual de juros vindo da tabela Firebird TB_PARAMETRO, registro PERC_JUROS.';

COMMENT ON COLUMN public.firebird_contas_receber.dias_carencia IS
'Dias de carência vindo da tabela Firebird TB_PARAMETRO, registro DIAS_CARENCIA.';
