require('dotenv').config();

const Firebird = require('node-firebird');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const INTERVALO_MINUTOS = Number(process.env.SYNC_INTERVAL_MINUTES || 10);
const HORA_SINCRONIZACAO_COMPLETA = Number(process.env.SYNC_FULL_HOUR || 2);
const INTERVALO_MENSAGENS_PROGRAMADAS_MINUTOS = Number(process.env.SCHEDULED_MESSAGES_INTERVAL_MINUTES || 1);

let empresaAtual = null;
let sincronizacaoEmAndamento = false;
let ultimaSincronizacaoCompletaDia = null;
let processamentoMensagensEmAndamento = false;
let sincronizacaoCompletaPendenteSetup = false;

const firebirdOptions = {
  host: process.env.FIREBIRD_HOST,
  port: Number(process.env.FIREBIRD_PORT || 3050),
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,
  lowercase_keys: true,
  role: null,
  pageSize: 4096
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processarMensagensProgramadas(idEmpresaParam) {
  if (processamentoMensagensEmAndamento) return;

  processamentoMensagensEmAndamento = true;

  try {
    const idEmpresa = idEmpresaParam || await obterIdEmpresaAtual();
    if (!idEmpresa) return;

    const resposta = await supabase.functions.invoke(
      'btzap-process-scheduled-messages',
      { body: { id_empresa: idEmpresa } }
    );

    const data = resposta.data;
    const error = resposta.error;

    if (error) throw error;

    if (data && data.success === false) {
      throw new Error(data.error || data.message || 'Falha ao processar mensagens programadas.');
    }

    if (data && Number(data.processadas || 0) > 0) {
      console.log('[Mensagens Programadas] Processadas: ' + data.processadas + '.');
    }
  } catch (error) {
    console.error('[Mensagens Programadas] Erro no processamento:', error.message || error);
  } finally {
    processamentoMensagensEmAndamento = false;
  }
}

function conectarFirebird() {
  return new Promise(function(resolve, reject) {
    Firebird.attach(firebirdOptions, function(err, db) {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function consultarFirebird(db, sql) {
  return new Promise(function(resolve, reject) {
    db.query(sql, [], function(err, result) {
      if (err) return reject(err);
      resolve(result || []);
    });
  });
}

function converterData(valor) {
  if (!valor) return null;

  const data = new Date(valor);

  if (isNaN(data.getTime())) {
    return null;
  }

  return data.toISOString().split('T')[0];
}

function converterHora(valor) {
  if (!valor) return null;

  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toTimeString().split(' ')[0];
  }

  const texto = String(valor).trim();

  if (!texto) return null;

  if (/^\d{2}:\d{2}:\d{2}/.test(texto)) {
    return texto.substring(0, 8);
  }

  if (/^\d{2}:\d{2}$/.test(texto)) {
    return texto + ':00';
  }

  const data = new Date(valor);

  if (!isNaN(data.getTime())) {
    return data.toTimeString().split(' ')[0];
  }

  return texto;
}

function converterTexto(valor) {
  if (valor === null || valor === undefined) return null;

  if (Buffer.isBuffer(valor)) {
    return valor.toString('latin1').trim();
  }

  return String(valor).trim();
}

function obterCampo(row, nome) {
  if (!row || !nome) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, nome)) return row[nome];

  var minusculo = String(nome).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(row, minusculo)) return row[minusculo];

  var maiusculo = String(nome).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, maiusculo)) return row[maiusculo];

  return undefined;
}

function converterNumeroParametro(valor) {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  var textoConvertido = converterTexto(valor);
  var texto = textoConvertido ? String(textoConvertido).trim().replace(',', '.') : '';
  if (!texto) return 0;

  var numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function converterInteiroParametro(valor) {
  var inteiro = Math.trunc(converterNumeroParametro(valor));
  return Number.isFinite(inteiro) && inteiro >= 0 ? inteiro : 0;
}

function normalizarTextoParametro(valor, padrao) {
  var texto = converterTexto(valor);
  return texto || padrao;
}

async function buscarParametrosFinanceirosFirebird(db) {
  var parametros = { perc_multa: 0, tipo_juros: 'S', perc_juros: 0, dias_carencia: 0 };

  try {
    var sql = [
      'SELECT INFORMACAO, CONTEUDO',
      'FROM TB_PARAMETRO',
      "WHERE UPPER(TRIM(INFORMACAO)) IN ('PERC_MULTA', 'TIPO_JUROS', 'PERC_JUROS', 'DIAS_CARENCIA')"
    ].join(' ');
    var rows = await consultarFirebird(db, sql);
    console.log('[PARAMETROS FINANCEIROS] Linhas encontradas na TB_PARAMETRO:', rows.length);

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      console.log('[PARAMETROS FINANCEIROS] Linha Firebird:', row);
      var informacao = normalizarTextoParametro(obterCampo(row, 'INFORMACAO'), '').toUpperCase();
      var conteudo = obterCampo(row, 'CONTEUDO');

      if (informacao === 'PERC_MULTA') parametros.perc_multa = converterNumeroParametro(conteudo);
      if (informacao === 'TIPO_JUROS') parametros.tipo_juros = normalizarTextoParametro(conteudo, 'S').toUpperCase();
      if (informacao === 'PERC_JUROS') parametros.perc_juros = converterNumeroParametro(conteudo);
      if (informacao === 'DIAS_CARENCIA') parametros.dias_carencia = converterInteiroParametro(conteudo);
    }

    console.log('[PARAMETROS FINANCEIROS] Parametros finais usados na sincronizacao:', parametros);
  } catch (erro) {
    console.warn('[PARAMETROS FINANCEIROS] Nao foi possivel buscar TB_PARAMETRO. Usando padroes seguros.', erro.message || erro);
  }

  return parametros;
}

function limparCnpj(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function formatarCnpj(cnpj) {
  const limpo = limparCnpj(cnpj);

  if (limpo.length !== 14) {
    return limpo;
  }

  return limpo.substring(0, 2) + '.' +
    limpo.substring(2, 5) + '.' +
    limpo.substring(5, 8) + '/' +
    limpo.substring(8, 12) + '-' +
    limpo.substring(12, 14);
}

function gerarIdentificadorBaseFirebird(cnpjLimpo) {
  const caminho = String(process.env.FIREBIRD_DATABASE || '').trim();
  const host = String(process.env.FIREBIRD_HOST || '').trim();
  const base = cnpjLimpo + '|' + host + '|' + caminho;

  return crypto.createHash('sha256').update(base).digest('hex');
}

function montarTelefoneEmpresa(row) {
  const dddCelular = converterTexto(row.ddd_celul);
  const foneCelular = converterTexto(row.fone_celul);

  if (dddCelular || foneCelular) {
    return ((dddCelular || '') + ' ' + (foneCelular || '')).trim();
  }

  const dddComer = converterTexto(row.ddd_comer);
  const foneComer = converterTexto(row.fone_comer);

  if (dddComer || foneComer) {
    return ((dddComer || '') + ' ' + (foneComer || '')).trim();
  }

  return null;
}

async function buscarEmpresaNoFirebird(db) {
  const linhas = await consultarFirebird(db, `
    SELECT FIRST 1
      NOME,
      NOME_FANTA,
      CNPJ,
      EMAIL_CONT,
      DDD_COMER,
      FONE_COMER,
      DDD_CELUL,
      FONE_CELUL
    FROM TB_EMITENTE
  `);

  if (!linhas.length) {
    throw new Error('Nenhum registro encontrado na TB_EMITENTE.');
  }

  const row = linhas[0];
  const cnpjLimpo = limparCnpj(row.cnpj);

  if (!cnpjLimpo || cnpjLimpo.length !== 14) {
    throw new Error('CNPJ inválido na TB_EMITENTE: ' + (row.cnpj || 'vazio'));
  }

  return {
    cnpj: cnpjLimpo,
    cnpj_formatado: formatarCnpj(cnpjLimpo),
    razao_social: converterTexto(row.nome),
    nome_fantasia: converterTexto(row.nome_fanta) || converterTexto(row.nome),
    email: converterTexto(row.email_cont),
    telefone: montarTelefoneEmpresa(row)
  };
}

async function registrarInstalacaoFirebird(dadosEmpresa) {
  const identificador = gerarIdentificadorBaseFirebird(dadosEmpresa.cnpj);
  const resposta = await supabase.rpc('fn_registrar_instalacao_firebird', {
    p_cnpj_limpo: dadosEmpresa.cnpj,
    p_cnpj_formatado: dadosEmpresa.cnpj_formatado,
    p_razao_social: dadosEmpresa.razao_social,
    p_nome_fantasia: dadosEmpresa.nome_fantasia,
    p_email: dadosEmpresa.email,
    p_telefone: dadosEmpresa.telefone,
    p_identificador_base_firebird: identificador,
    p_caminho_base_firebird: String(process.env.FIREBIRD_DATABASE || '').trim()
  });

  if (resposta.error) throw resposta.error;
  const data = resposta.data;
  if (!data || !data.success) throw new Error(data && data.message ? data.message : 'Não foi possível registrar a instalação Firebird.');

  if (data.status === 'nova_empresa') {
    console.log('[SETUP] Nova empresa identificada. Primeiro acesso pendente para criação da senha admin.');
  }
  if (data.precisa_criar_senha_admin) {
    console.log('[SETUP] Usuário admin pendente de criação de senha pelo primeiro acesso.');
  }
  if (data.status === 'cnpj_existente_aguardando_decisao') {
    console.log('[SETUP] CNPJ já cadastrado no Supabase. Aguardando decisão do usuário no sistema.');
    console.log('Este CNPJ já existe no Supabase. Acesse o sistema e escolha se deseja usar os dados existentes ou substituir os dados sincronizados.');
    return null;
  }

  console.log('[SETUP] Instalação autorizada. Sincronização liberada.');
  sincronizacaoCompletaPendenteSetup = data.forcar_sincronizacao_completa === true;
  if (sincronizacaoCompletaPendenteSetup) {
    console.log('[SETUP] Substituição de dados confirmada. Próxima sincronização será completa.');
  }
  empresaAtual = { id: data.id_empresa, identificador_base_firebird: identificador };
  return data.id_empresa;
}

async function obterIdEmpresaAtual(dbExistente) {
  if (empresaAtual && empresaAtual.id) {
    return empresaAtual.id;
  }

  let dbLocal = null;
  let deveFecharConexao = false;

  try {
    dbLocal = dbExistente;

    if (!dbLocal) {
      dbLocal = await conectarFirebird();
      deveFecharConexao = true;
    }

    const dadosEmpresa = await buscarEmpresaNoFirebird(dbLocal);
    return await registrarInstalacaoFirebird(dadosEmpresa);
  } finally {
    if (dbLocal && deveFecharConexao) {
      try {
        dbLocal.detach();
      } catch (error) {
        console.error('Erro ao encerrar conexão Firebird usada para identificar empresa:', error);
      }
    }
  }
}

function montarTelefoneCliente(row) {
  const dddCelular = converterTexto(row.ddd_celul);
  const foneCelular = converterTexto(row.fone_celul);

  if (dddCelular || foneCelular) {
    return ((dddCelular || '') + ' ' + (foneCelular || '')).trim();
  }

  const dddResid = converterTexto(row.ddd_resid);
  const foneResid = converterTexto(row.fone_resid);

  if (dddResid || foneResid) {
    return ((dddResid || '') + ' ' + (foneResid || '')).trim();
  }

  const dddComer = converterTexto(row.ddd_comer);
  const foneComer = converterTexto(row.fone_comer);

  if (dddComer || foneComer) {
    return ((dddComer || '') + ' ' + (foneComer || '')).trim();
  }

  return null;
}

function montarTelefoneVendedor(row) {
  const ddd = converterTexto(row.vendedor_ddd);
  const celular = converterTexto(row.vendedor_celular);

  if (ddd || celular) {
    return ((ddd || '') + ' ' + (celular || '')).trim();
  }

  const fone = converterTexto(row.vendedor_fone);

  if (ddd || fone) {
    return ((ddd || '') + ' ' + (fone || '')).trim();
  }

  const dddEmpresarial = converterTexto(row.vendedor_ddd_empresarial);
  const foneEmpresarial = converterTexto(row.vendedor_fone_empresarial);

  if (dddEmpresarial || foneEmpresarial) {
    return ((dddEmpresarial || '') + ' ' + (foneEmpresarial || '')).trim();
  }

  return null;
}

function montarRegistroContaReceber(row, idEmpresa, parametrosFinanceiros) {
  if (!parametrosFinanceiros) {
    parametrosFinanceiros = { perc_multa: 0, tipo_juros: 'S', perc_juros: 0, dias_carencia: 0 };
  }

  return {
    id_empresa: idEmpresa,
    id_ctarec: row.id_ctarec,
    documento: converterTexto(row.documento),
    historico: converterTexto(row.historico),
    dt_emissao: converterData(row.dt_emissao),
    dt_vencto: converterData(row.dt_vencto),
    vlr_ctarec: row.vlr_ctarec,
    tip_ctarec: converterTexto(row.tip_ctarec),
    perc_multa: parametrosFinanceiros.perc_multa,
    tipo_juros: parametrosFinanceiros.tipo_juros,
    perc_juros: parametrosFinanceiros.perc_juros,
    dias_carencia: parametrosFinanceiros.dias_carencia,

    id_portador: row.id_portador,
    id_cliente: row.id_cliente,

    cliente_nome: converterTexto(row.cliente_nome),
    cliente_status: converterTexto(row.cliente_status),
    cliente_email: converterTexto(row.cliente_email),
    cliente_telefone: montarTelefoneCliente(row),

    id_venda: row.id_venda,
    id_vendedor: row.id_vendedor,

    vendedor_codigo: converterTexto(row.vendedor_codigo),
    vendedor_nome: converterTexto(row.vendedor_nome),
    vendedor_apelido: converterTexto(row.vendedor_apelido),
    vendedor_status: converterTexto(row.vendedor_status),
    vendedor_email: converterTexto(row.vendedor_email),
    vendedor_telefone: montarTelefoneVendedor(row),

    dt_baixa: converterData(row.dt_baixa),
    hr_baixa: converterHora(row.hr_baixa),
    vlr_receb: row.vlr_receb,

    id_conta: row.id_conta,
    id_ctapla_origem: row.id_ctapla_origem,
    id_tipo_cliente: row.id_tipo_cliente,

    inv_referencia: converterTexto(row.inv_referencia),
    dt_vencto_orig: converterData(row.dt_vencto_orig),
    nsu_cartao: converterTexto(row.nsu_cartao),
    observacao: converterTexto(row.observacao),

    txid_qrcode_pix: converterTexto(row.txid_qrcode_pix),
    id_bank_account: row.id_bank_account,
    ignora_concil_cartao: converterTexto(row.ignora_concil_cartao),
    id_conversao: row.id_conversao,
    receb_aut: row.receb_aut,
    id_debx: row.id_debx,
    id_cartao_operadora: row.id_cartao_operadora,

    sincronizado_em: new Date().toISOString()
  };
}

function montarRegistroCliente(row, idEmpresa) {
  return {
    id_empresa: idEmpresa,
    id_cliente: row.id_cliente,
    dt_cadastro: converterData(row.dt_cadastro),
    nome: converterTexto(row.nome),
    dt_pricomp: converterData(row.dt_pricomp),
    dt_ultcomp: converterData(row.dt_ultcomp),
    dt_nascto: converterData(row.dt_nascto),
    ddd_celul: converterTexto(row.ddd_celul),
    fone_celul: converterTexto(row.fone_celul),
    email_cont: converterTexto(row.email_cont),
    sincronizado_em: new Date().toISOString()
  };
}

async function enviarContasReceberParaSupabase(registros) {
  if (!registros.length) {
    console.log('Nenhuma conta a receber encontrada para sincronizar.');
    return;
  }

  const tamanhoLote = 500;

  for (let i = 0; i < registros.length; i += tamanhoLote) {
    const lote = registros.slice(i, i + tamanhoLote);

    const resposta = await supabase
      .from('firebird_contas_receber')
      .upsert(lote, {
        onConflict: 'id_empresa,id_ctarec'
      });

    if (resposta.error) {
      console.error('Erro ao enviar lote de contas a receber para o Supabase:', resposta.error);
      throw resposta.error;
    }

    console.log('Lote contas a receber enviado: ' + (i + lote.length) + '/' + registros.length);
  }
}

async function enviarClientesParaSupabase(registros) {
  if (!registros.length) {
    console.log('Nenhum cliente encontrado para sincronizar.');
    return;
  }

  const tamanhoLote = 500;

  for (let i = 0; i < registros.length; i += tamanhoLote) {
    const lote = registros.slice(i, i + tamanhoLote);

    const resposta = await supabase
      .from('tab_cliente')
      .upsert(lote, {
        onConflict: 'id_empresa,id_cliente'
      });

    if (resposta.error) {
      console.error('Erro ao enviar lote de clientes para o Supabase:', resposta.error);
      throw resposta.error;
    }

    console.log('Lote clientes enviado: ' + (i + lote.length) + '/' + registros.length);
  }
}

function filtroModoSql(modoSincronizacao) {
  if (modoSincronizacao === 'completa') {
    return '';
  }

  return `
    WHERE
      NOT EXISTS (
        SELECT 1
        FROM TB_CTAREC_BAIXA B2
        WHERE B2.ID_CTAREC = CR.ID_CTAREC
      )
      OR EXISTS (
        SELECT 1
        FROM TB_CTAREC_BAIXA B3
        WHERE B3.ID_CTAREC = CR.ID_CTAREC
          AND B3.DT_BAIXA >= DATEADD(-30 DAY TO CURRENT_DATE)
      )
  `;
}

function sqlClientes() {
  return `
    SELECT
      C.ID_CLIENTE,
      C.DT_CADASTRO,
      C.NOME,
      C.DT_PRICOMP,
      C.DT_ULTCOMP,
      C.DDD_CELUL,
      C.FONE_CELUL,
      C.EMAIL_CONT,
      PF.DT_NASCTO
    FROM TB_CLIENTE C
    LEFT JOIN TB_CLI_PF PF ON PF.ID_CLIENTE = C.ID_CLIENTE
    ORDER BY C.NOME
  `;
}

function sqlComVendedorPorCampoVendedor(modoSincronizacao) {
  return `
    SELECT
        CR.ID_CTAREC,
        CR.DOCUMENTO,
        CR.HISTORICO,
        CR.DT_EMISSAO,
        CR.DT_VENCTO,
        CR.VLR_CTAREC,
        CR.TIP_CTAREC,
        CR.ID_PORTADOR,
        CR.ID_CLIENTE,

        CLI.NOME AS CLIENTE_NOME,
        CLI.STATUS AS CLIENTE_STATUS,
        CLI.EMAIL_CONT AS CLIENTE_EMAIL,
        CLI.DDD_CELUL,
        CLI.FONE_CELUL,
        CLI.DDD_RESID,
        CLI.FONE_RESID,
        CLI.DDD_COMER,
        CLI.FONE_COMER,

        CR.INV_REFERENCIA,
        CR.DT_VENCTO_ORIG,
        CR.NSU_CARTAO,
        CR.OBSERVACAO,
        CR.ID_VENDA,
        CR.ID_VENDEDOR,

        CAST(FUN.VENDEDOR AS VARCHAR(20)) AS VENDEDOR_CODIGO,
        FUN.NOME AS VENDEDOR_NOME,
        FUN.APELIDO AS VENDEDOR_APELIDO,
        FUN.STATUS AS VENDEDOR_STATUS,
        FUN.EMAIL AS VENDEDOR_EMAIL,
        FUN.DDD AS VENDEDOR_DDD,
        FUN.FONE AS VENDEDOR_FONE,
        FUN.CELULAR AS VENDEDOR_CELULAR,
        FUN.DDD_EMPRESARIAL AS VENDEDOR_DDD_EMPRESARIAL,
        FUN.FONE_EMPRESARIAL AS VENDEDOR_FONE_EMPRESARIAL,

        BX.DT_BAIXA,
        BX.HR_BAIXA,
        BX.VLR_RECEB,

        CR.ID_CONTA,
        CR.ID_CTAPLA_ORIGEM,
        CR.TXID_QRCODE_PIX,
        CR.ID_BANK_ACCOUNT,
        CR.IGNORA_CONCIL_CARTAO,
        CR.ID_TIPO_CLIENTE,
        CR.ID_CONVERSAO,
        CR.RECEB_AUT,
        CR.ID_DEBX,
        CR.ID_CARTAO_OPERADORA

    FROM TB_CONTA_RECEBER CR
    LEFT JOIN TB_CLIENTE CLI ON CLI.ID_CLIENTE = CR.ID_CLIENTE
    LEFT JOIN TB_FUNCIONARIO FUN ON FUN.VENDEDOR = CR.ID_VENDEDOR
    LEFT JOIN (
        SELECT
            B.ID_CTAREC,
            MAX(B.DT_BAIXA) AS DT_BAIXA,
            MAX(B.HR_BAIXA) AS HR_BAIXA,
            SUM(B.VLR_RECEB) AS VLR_RECEB
        FROM TB_CTAREC_BAIXA B
        GROUP BY B.ID_CTAREC
    ) BX ON BX.ID_CTAREC = CR.ID_CTAREC
    ${filtroModoSql(modoSincronizacao)}
    ORDER BY CR.DT_VENCTO DESC
  `;
}

function sqlComVendedorPorIdFuncionario(modoSincronizacao) {
  return `
    SELECT
        CR.ID_CTAREC,
        CR.DOCUMENTO,
        CR.HISTORICO,
        CR.DT_EMISSAO,
        CR.DT_VENCTO,
        CR.VLR_CTAREC,
        CR.TIP_CTAREC,
        CR.ID_PORTADOR,
        CR.ID_CLIENTE,

        CLI.NOME AS CLIENTE_NOME,
        CLI.STATUS AS CLIENTE_STATUS,
        CLI.EMAIL_CONT AS CLIENTE_EMAIL,
        CLI.DDD_CELUL,
        CLI.FONE_CELUL,
        CLI.DDD_RESID,
        CLI.FONE_RESID,
        CLI.DDD_COMER,
        CLI.FONE_COMER,

        CR.INV_REFERENCIA,
        CR.DT_VENCTO_ORIG,
        CR.NSU_CARTAO,
        CR.OBSERVACAO,
        CR.ID_VENDA,
        CR.ID_VENDEDOR,

        CAST(FUN.ID_FUNCIONARIO AS VARCHAR(20)) AS VENDEDOR_CODIGO,
        FUN.NOME AS VENDEDOR_NOME,
        FUN.APELIDO AS VENDEDOR_APELIDO,
        FUN.STATUS AS VENDEDOR_STATUS,
        FUN.EMAIL AS VENDEDOR_EMAIL,
        FUN.DDD AS VENDEDOR_DDD,
        FUN.FONE AS VENDEDOR_FONE,
        FUN.CELULAR AS VENDEDOR_CELULAR,
        FUN.DDD_EMPRESARIAL AS VENDEDOR_DDD_EMPRESARIAL,
        FUN.FONE_EMPRESARIAL AS VENDEDOR_FONE_EMPRESARIAL,

        BX.DT_BAIXA,
        BX.HR_BAIXA,
        BX.VLR_RECEB,

        CR.ID_CONTA,
        CR.ID_CTAPLA_ORIGEM,
        CR.TXID_QRCODE_PIX,
        CR.ID_BANK_ACCOUNT,
        CR.IGNORA_CONCIL_CARTAO,
        CR.ID_TIPO_CLIENTE,
        CR.ID_CONVERSAO,
        CR.RECEB_AUT,
        CR.ID_DEBX,
        CR.ID_CARTAO_OPERADORA

    FROM TB_CONTA_RECEBER CR
    LEFT JOIN TB_CLIENTE CLI ON CLI.ID_CLIENTE = CR.ID_CLIENTE
    LEFT JOIN TB_FUNCIONARIO FUN ON FUN.ID_FUNCIONARIO = CR.ID_VENDEDOR
    LEFT JOIN (
        SELECT
            B.ID_CTAREC,
            MAX(B.DT_BAIXA) AS DT_BAIXA,
            MAX(B.HR_BAIXA) AS HR_BAIXA,
            SUM(B.VLR_RECEB) AS VLR_RECEB
        FROM TB_CTAREC_BAIXA B
        GROUP BY B.ID_CTAREC
    ) BX ON BX.ID_CTAREC = CR.ID_CTAREC
    ${filtroModoSql(modoSincronizacao)}
    ORDER BY CR.DT_VENCTO DESC
  `;
}

function sqlSemVendedor(modoSincronizacao) {
  return `
    SELECT
        CR.ID_CTAREC,
        CR.DOCUMENTO,
        CR.HISTORICO,
        CR.DT_EMISSAO,
        CR.DT_VENCTO,
        CR.VLR_CTAREC,
        CR.TIP_CTAREC,
        CR.ID_PORTADOR,
        CR.ID_CLIENTE,

        CLI.NOME AS CLIENTE_NOME,
        CLI.STATUS AS CLIENTE_STATUS,
        CLI.EMAIL_CONT AS CLIENTE_EMAIL,
        CLI.DDD_CELUL,
        CLI.FONE_CELUL,
        CLI.DDD_RESID,
        CLI.FONE_RESID,
        CLI.DDD_COMER,
        CLI.FONE_COMER,

        CR.INV_REFERENCIA,
        CR.DT_VENCTO_ORIG,
        CR.NSU_CARTAO,
        CR.OBSERVACAO,
        CR.ID_VENDA,
        CR.ID_VENDEDOR,

        CAST(NULL AS VARCHAR(20)) AS VENDEDOR_CODIGO,
        CAST(NULL AS VARCHAR(45)) AS VENDEDOR_NOME,
        CAST(NULL AS VARCHAR(20)) AS VENDEDOR_APELIDO,
        CAST(NULL AS CHAR(1)) AS VENDEDOR_STATUS,
        CAST(NULL AS VARCHAR(50)) AS VENDEDOR_EMAIL,
        CAST(NULL AS CHAR(2)) AS VENDEDOR_DDD,
        CAST(NULL AS VARCHAR(13)) AS VENDEDOR_FONE,
        CAST(NULL AS VARCHAR(13)) AS VENDEDOR_CELULAR,
        CAST(NULL AS CHAR(2)) AS VENDEDOR_DDD_EMPRESARIAL,
        CAST(NULL AS VARCHAR(13)) AS VENDEDOR_FONE_EMPRESARIAL,

        BX.DT_BAIXA,
        BX.HR_BAIXA,
        BX.VLR_RECEB,

        CR.ID_CONTA,
        CR.ID_CTAPLA_ORIGEM,
        CR.TXID_QRCODE_PIX,
        CR.ID_BANK_ACCOUNT,
        CR.IGNORA_CONCIL_CARTAO,
        CR.ID_TIPO_CLIENTE,
        CR.ID_CONVERSAO,
        CR.RECEB_AUT,
        CR.ID_DEBX,
        CR.ID_CARTAO_OPERADORA

    FROM TB_CONTA_RECEBER CR
    LEFT JOIN TB_CLIENTE CLI ON CLI.ID_CLIENTE = CR.ID_CLIENTE
    LEFT JOIN (
        SELECT
            B.ID_CTAREC,
            MAX(B.DT_BAIXA) AS DT_BAIXA,
            MAX(B.HR_BAIXA) AS HR_BAIXA,
            SUM(B.VLR_RECEB) AS VLR_RECEB
        FROM TB_CTAREC_BAIXA B
        GROUP BY B.ID_CTAREC
    ) BX ON BX.ID_CTAREC = CR.ID_CTAREC
    ${filtroModoSql(modoSincronizacao)}
    ORDER BY CR.DT_VENCTO DESC
  `;
}

function sqlSemBaixa(modoSincronizacao) {
  return `
    SELECT
        CR.ID_CTAREC,
        CR.DOCUMENTO,
        CR.HISTORICO,
        CR.DT_EMISSAO,
        CR.DT_VENCTO,
        CR.VLR_CTAREC,
        CR.TIP_CTAREC,
        CR.ID_PORTADOR,
        CR.ID_CLIENTE,

        CLI.NOME AS CLIENTE_NOME,
        CLI.STATUS AS CLIENTE_STATUS,
        CLI.EMAIL_CONT AS CLIENTE_EMAIL,
        CLI.DDD_CELUL,
        CLI.FONE_CELUL,
        CLI.DDD_RESID,
        CLI.FONE_RESID,
        CLI.DDD_COMER,
        CLI.FONE_COMER,

        CR.INV_REFERENCIA,
        CR.DT_VENCTO_ORIG,
        CR.NSU_CARTAO,
        CR.OBSERVACAO,
        CR.ID_VENDA,
        CR.ID_VENDEDOR,

        CAST(NULL AS VARCHAR(20)) AS VENDEDOR_CODIGO,
        CAST(NULL AS VARCHAR(45)) AS VENDEDOR_NOME,
        CAST(NULL AS VARCHAR(20)) AS VENDEDOR_APELIDO,
        CAST(NULL AS CHAR(1)) AS VENDEDOR_STATUS,
        CAST(NULL AS VARCHAR(50)) AS VENDEDOR_EMAIL,
        CAST(NULL AS CHAR(2)) AS VENDEDOR_DDD,
        CAST(NULL AS VARCHAR(13)) AS VENDEDOR_FONE,
        CAST(NULL AS VARCHAR(13)) AS VENDEDOR_CELULAR,
        CAST(NULL AS CHAR(2)) AS VENDEDOR_DDD_EMPRESARIAL,
        CAST(NULL AS VARCHAR(13)) AS VENDEDOR_FONE_EMPRESARIAL,

        CAST(NULL AS DATE) AS DT_BAIXA,
        CAST(NULL AS TIME) AS HR_BAIXA,
        CAST(NULL AS NUMERIC(18,4)) AS VLR_RECEB,

        CR.ID_CONTA,
        CR.ID_CTAPLA_ORIGEM,
        CR.TXID_QRCODE_PIX,
        CR.ID_BANK_ACCOUNT,
        CR.IGNORA_CONCIL_CARTAO,
        CR.ID_TIPO_CLIENTE,
        CR.ID_CONVERSAO,
        CR.RECEB_AUT,
        CR.ID_DEBX,
        CR.ID_CARTAO_OPERADORA

    FROM TB_CONTA_RECEBER CR
    LEFT JOIN TB_CLIENTE CLI ON CLI.ID_CLIENTE = CR.ID_CLIENTE
    ${filtroModoSql(modoSincronizacao)}
    ORDER BY CR.DT_VENCTO DESC
  `;
}

async function consultarContasReceberComFallback(db, modoSincronizacao) {
  try {
    console.log('Tentando consulta contas a receber com baixa e vendedor por FUN.VENDEDOR...');
    return await consultarFirebird(db, sqlComVendedorPorCampoVendedor(modoSincronizacao));
  } catch (error) {
    console.error('Falhou usando baixa + FUN.VENDEDOR.');
    console.error(error.message || error);
  }

  try {
    console.log('Tentando consulta contas a receber com baixa e vendedor por FUN.ID_FUNCIONARIO...');
    return await consultarFirebird(db, sqlComVendedorPorIdFuncionario(modoSincronizacao));
  } catch (error) {
    console.error('Falhou usando baixa + FUN.ID_FUNCIONARIO.');
    console.error(error.message || error);
  }

  try {
    console.log('Tentando consulta contas a receber com baixa e sem vendedor...');
    return await consultarFirebird(db, sqlSemVendedor(modoSincronizacao));
  } catch (error) {
    console.error('Falhou usando baixa sem vendedor.');
    console.error(error.message || error);
  }

  console.log('Subindo contas a receber sem baixa e sem vendedor para não parar a sincronização...');
  return await consultarFirebird(db, sqlSemBaixa(modoSincronizacao));
}

async function sincronizarClientes(db, idEmpresa) {
  console.log('');
  console.log('----------------------------------------');
  console.log('Sincronizando Clientes');
  console.log('Consultando TB_CLIENTE + TB_CLI_PF...');
  console.log('----------------------------------------');

  const resultado = await consultarFirebird(db, sqlClientes());

  console.log('Clientes encontrados no Firebird: ' + resultado.length);

  const registros = resultado
    .map(function(row) {
      return montarRegistroCliente(row, idEmpresa);
    })
    .filter(function(row) {
      return row.id_cliente !== null && row.id_cliente !== undefined && row.nome;
    });

  if (registros.length > 0) {
    console.log('Primeiro cliente montado para envio:');
    console.log(JSON.stringify(registros[0], null, 2));
  }

  console.log('Enviando clientes para o Supabase...');
  await enviarClientesParaSupabase(registros);

  console.log('Sincronização de clientes concluída.');
}

async function sincronizarContasReceber(db, idEmpresa, modoSincronizacao) {
  console.log('');
  console.log('----------------------------------------');
  console.log('Sincronizando Contas a Receber');
  console.log('Consultando TB_CONTA_RECEBER...');
  console.log('----------------------------------------');

  const resultado = await consultarContasReceberComFallback(db, modoSincronizacao);
  const parametrosFinanceiros = await buscarParametrosFinanceirosFirebird(db);

  console.log('Contas a receber encontradas no Firebird: ' + resultado.length);

  const registros = resultado.map(function(row) {
    return montarRegistroContaReceber(row, idEmpresa, parametrosFinanceiros);
  });

  console.log('[PARAMETROS FINANCEIROS] Enviando contas com parametros:', parametrosFinanceiros);

  if (registros.length > 0) {
    console.log('Primeira conta a receber montada para envio:');
    console.log(JSON.stringify(registros[0], null, 2));
  }

  console.log('Enviando contas a receber para o Supabase...');
  await enviarContasReceberParaSupabase(registros);

  console.log('Sincronização de contas a receber concluída.');
}

function obterDataAtualChave() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');

  return ano + '-' + mes + '-' + dia;
}

function deveRodarSincronizacaoCompletaAgora() {
  const agora = new Date();
  const horaAtual = agora.getHours();
  const diaAtual = obterDataAtualChave();

  if (horaAtual !== HORA_SINCRONIZACAO_COMPLETA) {
    return false;
  }

  if (ultimaSincronizacaoCompletaDia === diaAtual) {
    return false;
  }

  return true;
}

function definirModoSincronizacao() {
  if (deveRodarSincronizacaoCompletaAgora()) {
    return 'completa';
  }

  return 'parcial';
}

async function sincronizar(modoForcado) {
  if (sincronizacaoEmAndamento) {
    console.log('Já existe uma sincronização em andamento. Pulando este ciclo.');
    return;
  }

  sincronizacaoEmAndamento = true;

  let modoSincronizacao = modoForcado || definirModoSincronizacao();

  let db;

  try {
    console.log('');
    console.log('========================================');
    console.log('Iniciando sincronização - ' + new Date().toLocaleString('pt-BR'));
    console.log('Modo: ' + modoSincronizacao.toUpperCase());
    console.log('Firebird -> Supabase');
    console.log('Módulos: Clientes + Contas a Receber');
    console.log('========================================');

    if (modoSincronizacao === 'parcial') {
      console.log('Contas a receber parcial: contas em aberto e contas baixadas nos últimos 30 dias.');
      console.log('Clientes: sincronização completa da TB_CLIENTE em todo ciclo.');
    } else {
      console.log('Sincronização completa: toda a TB_CLIENTE e toda a TB_CONTA_RECEBER serão revisadas.');
    }

    console.log('Conectando ao Firebird...');

    db = await conectarFirebird();

    console.log('Conectado ao Firebird.');
    console.log('Identificando empresa local pela TB_EMITENTE...');

    const idEmpresa = await obterIdEmpresaAtual(db);
    if (!idEmpresa) {
      console.log('[SETUP] Sincronização de clientes e contas bloqueada até a decisão do usuário.');
      return;
    }

    if (sincronizacaoCompletaPendenteSetup) {
      modoSincronizacao = 'completa';
      console.log('[SETUP] Executando sincronização completa após substituição dos dados.');
    }

    await sincronizarClientes(db, idEmpresa);
    await sincronizarContasReceber(db, idEmpresa, modoSincronizacao);

    if (modoSincronizacao === 'completa') {
      ultimaSincronizacaoCompletaDia = obterDataAtualChave();
      console.log('Sincronização completa registrada para o dia ' + ultimaSincronizacaoCompletaDia + '.');

      if (sincronizacaoCompletaPendenteSetup) {
        const atualizacaoSetup = await supabase
          .from('tab_empresas')
          .update({ setup_status: 'concluido', atualizado_setup_em: new Date().toISOString() })
          .eq('id', idEmpresa);
        if (atualizacaoSetup.error) throw atualizacaoSetup.error;
        sincronizacaoCompletaPendenteSetup = false;
      }
    }

    console.log('Sincronização concluída com sucesso - ' + new Date().toLocaleString('pt-BR'));
  } catch (error) {
    console.error('Erro geral na sincronização:', error);
  } finally {
    if (db) {
      try {
        db.detach();
        console.log('Conexão com Firebird encerrada.');
      } catch (detachError) {
        console.error('Erro ao encerrar conexão com Firebird:', detachError);
      }
    }

    sincronizacaoEmAndamento = false;
    console.log('Processo de sincronização finalizado.');
    console.log('Próxima verificação em ' + INTERVALO_MINUTOS + ' minuto(s).');
  }
}

async function iniciarSincronizadorContinuo() {
  console.log('========================================');
  console.log('Sincronizador Firebird -> Supabase iniciado');
  console.log('Intervalo durante o dia: ' + INTERVALO_MINUTOS + ' minuto(s)');
  console.log('Módulos: Clientes + Contas a Receber');
  console.log('Sincronização completa diária: ' + String(HORA_SINCRONIZACAO_COMPLETA).padStart(2, '0') + ':00');
  console.log('Modo: contínuo');
  console.log('========================================');

  try {
    await obterIdEmpresaAtual();
  } catch (error) {
    console.error('Erro ao identificar/cadastrar empresa inicial:', error.message || error);
  }

  processarMensagensProgramadas();

  setInterval(function() {
    processarMensagensProgramadas();
  }, INTERVALO_MENSAGENS_PROGRAMADAS_MINUTOS * 60 * 1000);

  await sincronizar();

  setInterval(function() {
    sincronizar();
  }, INTERVALO_MINUTOS * 60 * 1000);
}

process.on('SIGINT', function() {
  console.log('');
  console.log('Sincronizador encerrado manualmente.');
  process.exit(0);
});

process.on('SIGTERM', function() {
  console.log('');
  console.log('Sincronizador encerrado pelo sistema.');
  process.exit(0);
});

iniciarSincronizadorContinuo();
