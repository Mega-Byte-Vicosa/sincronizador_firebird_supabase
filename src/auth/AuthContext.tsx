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
}

interface AuthContextValue {
  usuario: UsuarioSaas | null;
  carregando: boolean;
  entrar: (cnpj: string, usuario: string, senha: string) => Promise<AuthResult>;
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
