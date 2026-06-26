require('dotenv').config();

const Firebird = require('node-firebird');
const { createClient } = require('@supabase/supabase-js');

const INTERVALO_MINUTOS = Number(process.env.SYNC_INTERVAL_MINUTES || 10);
const HORA_SINCRONIZACAO_COMPLETA = Number(process.env.SYNC_FULL_HOUR || 2);
const INTERVALO_MENSAGENS_PROGRAMADAS_MINUTOS = Number(process.env.SCHEDULED_MESSAGES_INTERVAL_MINUTES || 1);

let empresaAtual = null;
let sincronizacaoEmAndamento = false;
let ultimaSincronizacaoCompletaDia = null;
let processamentoMensagensEmAndamento = false;

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

async function processarMensagensProgramadas(idEmpresaParam = null) {
  if (processamentoMensagensEmAndamento) return;
  processamentoMensagensEmAndamento = true;

  try {
    const idEmpresa = idEmpresaParam || await obterIdEmpresaAtual();

    const { data, error } = await supabase.functions.invoke(
      'btzap-process-scheduled-messages',
      { body: { id_empresa: idEmpresa } }
    );

    if (error) throw error;

    if (data?.success === false) {
      throw new Error(data.error || data.message || 'Falha ao processar mensagens programadas.');
    }

    if (Number(data?.processadas || 0) > 0) {
      console.log(`[Mensagens Programadas] Processadas: ${data.processadas}.`);
    }
  } catch (error) {
    console.error('[Mensagens Programadas] Erro no processamento:', error.message || error);
  } finally {
    processamentoMensagensEmAndamento = false;
  }
}

function conectarFirebird() {
  return new Promise((resolve, reject) => {
    Firebird.attach(firebirdOptions, (err, db) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function consultarFirebird(db, sql) {
  return new Promise((resolve, reject) => {
    db.query(sql, [], (err, result) => {
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
    return `${texto}:00`;
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

function limparCnpj(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function formatarCnpj(cnpj) {
  const limpo = limparCnpj(cnpj);

  if (limpo.length !== 14) {
    return limpo;
  }

  return `${limpo.substring(0, 2)}.${limpo.substring(2, 5)}.${limpo.substring(5, 8)}/${limpo.substring(8, 12)}-${limpo.substring(12, 14)}`;
}

function montarTelefoneEmpresa(row) {
  const dddCelular = converterTexto(row.ddd_celul);
  const foneCelular = converterTexto(row.fone_celul);

  if (dddCelular || foneCelular) {
    return `${dddCelular || ''} ${foneCelular || ''}`.trim();
  }

  const dddComer = converterTexto(row.ddd_comer);
  const foneComer = converterTexto(row.fone_comer);

  if (dddComer || foneComer) {
    return `${dddComer || ''} ${foneComer || ''}`.trim();
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
    throw new Error(`CNPJ inválido na TB_EMITENTE: ${row.cnpj || 'vazio'}`);
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

async function garantirEmpresaNoSupabase(dadosEmpresa) {
  const cnpjsPossiveis = [dadosEmpresa.cnpj, dadosEmpresa.cnpj_formatado].filter(Boolean);

  const { data: empresasEncontradas, error: erroBusca } = await supabase
    .from('tab_empresas')
    .select('id, cnpj, nome_fantasia')
    .in('cnpj', cnpjsPossiveis)
    .limit(1);

  if (erroBusca) {
    throw erroBusca;
  }

  if (empresasEncontradas && empresasEncontradas.length > 0) {
    const empresa = empresasEncontradas[0];

    const { data, error } = await supabase
      .from('tab_empresas')
      .update({
        cnpj: dadosEmpresa.cnpj,
        razao_social: dadosEmpresa.razao_social,
        nome_fantasia: dadosEmpresa.nome_fantasia,
        ativo: true,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', empresa.id)
      .select('id, cnpj, nome_fantasia')
      .single();

    if (error) {
      throw error;
    }

    console.log(`Empresa identificada no Supabase: ${data.nome_fantasia || data.cnpj}`);
    console.log(`ID empresa Supabase: ${data.id}`);

    empresaAtual = data;
    return data.id;
  }

  const { data, error } = await supabase
    .from('tab_empresas')
    .insert({
      cnpj: dadosEmpresa.cnpj,
      razao_social: dadosEmpresa.razao_social,
      nome_fantasia: dadosEmpresa.nome_fantasia,
      ativo: true
    })
    .select('id, cnpj, nome_fantasia')
    .single();

  if (error) {
    throw error;
  }

  console.log(`Empresa cadastrada no Supabase: ${data.nome_fantasia || data.cnpj}`);
  console.log(`ID empresa Supabase: ${data.id}`);

  empresaAtual = data;
  return data.id;
}

async function garantirUsuarioAdminInicial(dadosEmpresa, idEmpresa) {
  const criarAdminInicial = String(process.env.SAAS_CRIAR_ADMIN_INICIAL || 'true').toLowerCase() === 'true';

  if (!criarAdminInicial) {
    return;
  }

  const usuario = process.env.SAAS_ADMIN_USUARIO || 'admin';
  const senha = process.env.SAAS_ADMIN_SENHA || '123456';
  const nome = process.env.SAAS_ADMIN_NOME || 'Administrador';
  const email = process.env.SAAS_ADMIN_EMAIL || dadosEmpresa.email || '';

  const { data, error } = await supabase.rpc('fn_criar_usuario_admin_inicial', {
    p_id_empresa: idEmpresa,
    p_cnpj: dadosEmpresa.cnpj_formatado || dadosEmpresa.cnpj,
    p_cnpj_limpo: dadosEmpresa.cnpj,
    p_usuario: usuario,
    p_senha: senha,
    p_nome: nome,
    p_email: email
  });

  if (error) {
    throw error;
  }

  console.log('Usuário SaaS inicial verificado/criado.');
  console.log(`Usuário: ${usuario}`);
  console.log(`Senha inicial: ${senha}`);
  console.log(`ID usuário: ${data}`);
}

async function obterIdEmpresaAtual(dbExistente = null) {
  if (empresaAtual?.id) {
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
    const idEmpresa = await garantirEmpresaNoSupabase(dadosEmpresa);

    await garantirUsuarioAdminInicial(dadosEmpresa, idEmpresa);

    return idEmpresa;
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
    return `${dddCelular || ''} ${foneCelular || ''}`.trim();
  }

  const dddResid = converterTexto(row.ddd_resid);
  const foneResid = converterTexto(row.fone_resid);

  if (dddResid || foneResid) {
    return `${dddResid || ''} ${foneResid || ''}`.trim();
  }

  const dddComer = converterTexto(row.ddd_comer);
  const foneComer = converterTexto(row.fone_comer);

  if (dddComer || foneComer) {
    return `${dddComer || ''} ${foneComer || ''}`.trim();
  }

  return null;
}

function montarTelefoneVendedor(row) {
  const ddd = converterTexto(row.vendedor_ddd);
  const celular = converterTexto(row.vendedor_celular);

  if (ddd || celular) {
    return `${ddd || ''} ${celular || ''}`.trim();
  }

  const fone = converterTexto(row.vendedor_fone);

  if (ddd || fone) {
    return `${ddd || ''} ${fone || ''}`.trim();
  }

  const dddEmpresarial = converterTexto(row.vendedor_ddd_empresarial);
  const foneEmpresarial = converterTexto(row.vendedor_fone_empresarial);

  if (dddEmpresarial || foneEmpresarial) {
    return `${dddEmpresarial || ''} ${foneEmpresarial || ''}`.trim();
  }

  return null;
}

function montarRegistroContaReceber(row, idEmpresa) {
  return {
    id_empresa: idEmpresa,
    id_ctarec: row.id_ctarec,
    documento: converterTexto(row.documento),
    historico: converterTexto(row.historico),
    dt_emissao: converterData(row.dt_emissao),
    dt_vencto: converterData(row.dt_vencto),
    vlr_ctarec: row.vlr_ctarec,
    tip_ctarec: converterTexto(row.tip_ctarec),

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

    const { error } = await supabase
      .from('firebird_contas_receber')
      .upsert(lote, {
        onConflict: 'id_empresa,id_ctarec'
      });

    if (error) {
      console.error('Erro ao enviar lote de contas a receber para o Supabase:', error);
      throw error;
    }

    console.log(`Lote contas a receber enviado: ${i + lote.length}/${registros.length}`);
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

    const { error } = await supabase
      .from('tab_cliente')
      .upsert(lote, {
        onConflict: 'id_empresa,id_cliente'
      });

    if (error) {
      console.error('Erro ao enviar lote de clientes para o Supabase:', error);
      throw error;
    }

    console.log(`Lote clientes enviado: ${i + lote.length}/${registros.length}`);
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

  console.log(`Clientes encontrados no Firebird: ${resultado.length}`);

  const registros = resultado
    .map((row) => montarRegistroCliente(row, idEmpresa))
    .filter((row) => row.id_cliente !== null && row.id_cliente !== undefined && row.nome);

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

  console.log(`Contas a receber encontradas no Firebird: ${resultado.length}`);

  const registros = resultado.map((row) => montarRegistroContaReceber(row, idEmpresa));

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

  return `${ano}-${mes}-${dia}`;
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

async function sincronizar(modoForcado = null) {
  if (sincronizacaoEmAndamento) {
    console.log('Já existe uma sincronização em andamento. Pulando este ciclo.');
    return;
  }

  sincronizacaoEmAndamento = true;

  const modoSincronizacao = modoForcado || definirModoSincronizacao();

  let db;

  try {
    console.log('');
    console.log('========================================');
    console.log(`Iniciando sincronização - ${new Date().toLocaleString('pt-BR')}`);
    console.log(`Modo: ${modoSincronizacao.toUpperCase()}`);
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

    await sincronizarClientes(db, idEmpresa);
    await sincronizarContasReceber(db, idEmpresa, modoSincronizacao);

    if (modoSincronizacao === 'completa') {
      ultimaSincronizacaoCompletaDia = obterDataAtualChave();
      console.log(`Sincronização completa registrada para o dia ${ultimaSincronizacaoCompletaDia}.`);
    }

    console.log(`Sincronização concluída com sucesso - ${new Date().toLocaleString('pt-BR')}`);
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
    console.log(`Próxima verificação em ${INTERVALO_MINUTOS} minuto(s).`);
  }
}

async function iniciarSincronizadorContinuo() {
  console.log('========================================');
  console.log('Sincronizador Firebird -> Supabase iniciado');
  console.log(`Intervalo durante o dia: ${INTERVALO_MINUTOS} minuto(s)`);
  console.log('Módulos: Clientes + Contas a Receber');
  console.log(`Sincronização completa diária: ${String(HORA_SINCRONIZACAO_COMPLETA).padStart(2, '0')}:00`);
  console.log('Modo: contínuo');
  console.log('========================================');

  try {
    await obterIdEmpresaAtual();
  } catch (error) {
    console.error('Erro ao identificar/cadastrar empresa inicial:', error.message || error);
  }

  void processarMensagensProgramadas();

  setInterval(() => {
    void processarMensagensProgramadas();
  }, INTERVALO_MENSAGENS_PROGRAMADAS_MINUTOS * 60 * 1000);

  await sincronizar();

  setInterval(async () => {
    await sincronizar();
  }, INTERVALO_MINUTOS * 60 * 1000);
}

process.on('SIGINT', () => {
  console.log('');
  console.log('Sincronizador encerrado manualmente.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('Sincronizador encerrado pelo sistema.');
  process.exit(0);
});

iniciarSincronizadorContinuo();