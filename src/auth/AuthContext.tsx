import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";

const SESSION_KEY = "consulta_clipp_pro_saas_session";

export interface UsuarioSaas {
  id: string;
  id_empresa: string;
  cnpj: string;
  empresa_razao_social: string | null;
  empresa_nome_fantasia: string | null;
  usuario: string;
  nome: string | null;
  email: string | null;
  login_em: string;
  ultimo_login_anterior: string | null;
}

interface AuthResult {
  success: boolean;
  message?: string;
  session_token?: string;
  usuario?: UsuarioSaas;
  cliente?: unknown;
}

export interface PrimeiroAcessoStatus extends AuthResult {
  status?: string;
  id_empresa?: string;
  empresa_nome?: string;
  cnpj_limpo?: string;
  primeiro_acesso_concluido?: boolean;
  admin_senha_pendente?: boolean;
  deve_definir_senha?: boolean;
  setup_status?: string;
  precisa_decidir_substituicao?: boolean;
  identificador_base_firebird?: string;
}

interface AtualizarPermissoesClienteParams {
  idCliente: string | number;
  permiteCampanha: boolean;
  permiteCobrancaAviso: boolean;
  contatoRestrito: boolean;
  motivoRestricao: string | null;
}

interface AuthContextValue {
  usuario: UsuarioSaas | null;
  carregando: boolean;
  entrar: (cnpj: string, usuario: string, senha: string) => Promise<AuthResult>;
  consultarPrimeiroAcesso: (cnpj: string, usuario: string) => Promise<PrimeiroAcessoStatus>;
  definirSenhaInicialAdmin: (cnpj: string, usuario: string, senha: string) => Promise<AuthResult>;
  decidirInstalacaoExistente: (idEmpresa: string, identificadorBase: string, decisao: "usar_existente" | "substituir_dados", confirmacao?: string) => Promise<AuthResult>;
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<AuthResult>;
  atualizarPermissoesCliente: (params: AtualizarPermissoesClienteParams) => Promise<AuthResult>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSaas | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function restaurarSessao() {
      const token = sessionStorage.getItem(SESSION_KEY);

      if (!token) {
        if (ativo) setCarregando(false);
        return;
      }

      const { data, error } = await supabase.rpc("validar_sessao_saas", {
        p_token: token,
      });

      const resultado = data as AuthResult | null;

      if (!ativo) return;

      if (error || !resultado?.success || !resultado.usuario?.id_empresa) {
        sessionStorage.removeItem(SESSION_KEY);
        setUsuario(null);
      } else {
        setUsuario(resultado.usuario);
      }

      setCarregando(false);
    }

    void restaurarSessao();

    return () => {
      ativo = false;
    };
  }, []);

  async function entrar(cnpj: string, nomeUsuario: string, senha: string) {
    const { data, error } = await supabase.rpc("autenticar_usuario_saas", {
      p_cnpj: cnpj,
      p_usuario: nomeUsuario,
      p_senha: senha,
    });

    if (error) {
      return {
        success: false,
        message: "Não foi possível validar o acesso.",
      };
    }

    const resultado = data as AuthResult;

    if (resultado.success && resultado.session_token && resultado.usuario?.id_empresa) {
      sessionStorage.setItem(SESSION_KEY, resultado.session_token);
      setUsuario(resultado.usuario);
    }

    return resultado;
  }

  async function consultarPrimeiroAcesso(cnpj: string, nomeUsuario: string) {
    const { data, error } = await supabase.rpc("fn_status_primeiro_acesso", {
      p_cnpj: cnpj,
      p_usuario: nomeUsuario,
    });

    if (error) return { success: false, message: "Não foi possível consultar o primeiro acesso." };
    return data as PrimeiroAcessoStatus;
  }

  async function definirSenhaInicialAdmin(cnpj: string, nomeUsuario: string, senha: string) {
    const { data, error } = await supabase.rpc("fn_definir_senha_admin_primeiro_acesso", {
      p_cnpj: cnpj,
      p_usuario: nomeUsuario,
      p_senha: senha,
    });

    if (error) return { success: false, message: "Não foi possível criar a senha do administrador." };
    return data as AuthResult;
  }

  async function decidirInstalacaoExistente(
    idEmpresa: string,
    identificadorBase: string,
    decisao: "usar_existente" | "substituir_dados",
    confirmacao?: string,
  ) {
    const { data, error } = await supabase.rpc("fn_decidir_instalacao_cnpj_existente", {
      p_id_empresa: idEmpresa,
      p_identificador_base_firebird: identificadorBase,
      p_decisao: decisao,
      p_confirmacao: confirmacao ?? null,
    });

    if (error) return { success: false, message: "Não foi possível salvar a decisão da instalação." };
    return data as AuthResult;
  }

  async function alterarSenha(senhaAtual: string, novaSenha: string) {
    const token = sessionStorage.getItem(SESSION_KEY);

    if (!token) {
      return {
        success: false,
        message: "Sessão expirada. Faça login novamente.",
      };
    }

    const { data, error } = await supabase.rpc("alterar_senha_usuario_saas", {
      p_token: token,
      p_senha_atual: senhaAtual,
      p_nova_senha: novaSenha,
    });

    if (error) {
      return {
        success: false,
        message: "Não foi possível alterar a senha.",
      };
    }

    return data as AuthResult;
  }

  async function atualizarPermissoesCliente(params: AtualizarPermissoesClienteParams) {
    const token = sessionStorage.getItem(SESSION_KEY);

    if (!token) {
      return {
        success: false,
        message: "Sessão expirada. Faça login novamente.",
      };
    }

    const { data, error } = await supabase.rpc("atualizar_permissoes_cliente_saas", {
      p_token: token,
      p_id_cliente: String(params.idCliente),
      p_permite_campanha: params.permiteCampanha,
      p_permite_cobranca_aviso: params.permiteCobrancaAviso,
      p_contato_restrito: params.contatoRestrito,
      p_motivo_restricao: params.motivoRestricao,
    });

    if (error) {
      return {
        success: false,
        message: "Não foi possível atualizar as permissões de contato. Tente novamente.",
      };
    }

    return data as AuthResult;
  }

  async function sair() {
    const token = sessionStorage.getItem(SESSION_KEY);

    sessionStorage.removeItem(SESSION_KEY);
    setUsuario(null);

    if (token) {
      await supabase.rpc("encerrar_sessao_saas", {
        p_token: token,
      });
    }
  }

  const value = useMemo(
    () => ({
      usuario,
      carregando,
      entrar,
      consultarPrimeiroAcesso,
      definirSenhaInicialAdmin,
      decidirInstalacaoExistente,
      alterarSenha,
      atualizarPermissoesCliente,
      sair,
    }),
    [usuario, carregando],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
