import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { usuario, sair } = useAuth();
  const [saindo, setSaindo] = useState(false);
  const nome = usuario?.nome || usuario?.usuario || "Usuário";
  const iniciais = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
  const ultimoAcesso = usuario?.ultimo_login_anterior
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(usuario.ultimo_login_anterior))
    : "Primeiro acesso";

  async function handleLogout() {
    setSaindo(true);
    await sair();
  }

  return (
    <header className="topbar">
      <button className="mobile-menu-button" type="button" aria-label="Abrir menu" onClick={onOpenMenu}>
        <span />
        <span />
        <span />
      </button>
      <span className="topbar-context">Consulta Clipp Pro</span>
      <div className="topbar-user">
        <div className="topbar-user-copy">
          <strong>{nome}</strong>
          <span title={`Último acesso: ${ultimoAcesso}`}>
  {usuario?.empresa_nome_fantasia || usuario?.empresa_razao_social} · {usuario?.cnpj}
</span>
        </div>
        <div className="topbar-avatar" aria-label={`Usuário do sistema: ${nome}`}>{iniciais || "CP"}</div>
        <button className="topbar-logout" type="button" onClick={() => void handleLogout()} disabled={saindo}>
          {saindo ? "Saindo..." : "Sair"}
        </button>
      </div>
    </header>
  );
}
