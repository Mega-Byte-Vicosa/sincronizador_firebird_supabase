import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { Automacoes } from "./pages/Automacoes";
import { CampanhasPromocao } from "./pages/CampanhasPromocao";
import { Configuracoes } from "./pages/Configuracoes";
import { ContasAReceber } from "./pages/ContasAReceber";
import { Dashboard } from "./pages/Dashboard";
import { Clientes } from "./pages/Clientes";
import { HistoricoEnvios } from "./pages/HistoricoEnvios";
import { MensagensProgramadas } from "./pages/MensagensProgramadas";
import { ModelosMensagem } from "./pages/ModelosMensagem";
import { Login } from "./pages/Login";
import { useAuth } from "./auth/AuthContext";

function normalizarRota(pathname: string) {
  if (pathname === "/") return "/dashboard";
  if (pathname === "/aniversariantes") return "/automacoes";
  return pathname;
}

export function App() {
  const { usuario, carregando } = useAuth();
  const [pathname, setPathname] = useState(() => normalizarRota(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPathname(normalizarRota(window.location.pathname));

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (carregando) return;

    if (!usuario && window.location.pathname !== "/login") {
      window.history.replaceState(null, "", "/login");
      setPathname("/login");
    } else if (usuario && (window.location.pathname === "/login" || window.location.pathname === "/")) {
      window.history.replaceState(null, "", "/dashboard");
      setPathname("/dashboard");
    }
  }, [carregando, usuario]);

  function navegar(path: string) {
    const rota = normalizarRota(path);
    window.history.pushState(null, "", rota);
    setPathname(rota);
  }

  const page = useMemo(() => {
    if (pathname === "/clientes") return <Clientes />;
    if (pathname === "/contas-a-receber") return <ContasAReceber />;
    if (pathname === "/automacoes") return <Automacoes />;
    if (pathname === "/campanhas-promocao") return <CampanhasPromocao />;
    if (pathname === "/campanhas-promocao/modelos") return <ModelosMensagem />;
    if (pathname === "/mensagens-programadas") return <MensagensProgramadas />;
    if (pathname === "/historico-envios") return <HistoricoEnvios />;
    if (pathname === "/configuracoes") return <Configuracoes />;

    return <Dashboard />;
  }, [pathname]);

  if (carregando) {
    return (
      <div className="auth-loading-screen" role="status">
        <span className="auth-loading-mark">CP</span>
        <p>Validando acesso...</p>
      </div>
    );
  }

  if (!usuario) return <Login />;

  return (
    <AppLayout activePath={pathname} onNavigate={navegar}>
      {page}
    </AppLayout>
  );
}
