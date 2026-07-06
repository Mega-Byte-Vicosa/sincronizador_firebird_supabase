import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppLayoutProps {
  activePath: string;
  children: ReactNode;
  onNavigate: (path: string) => void;
}

export function AppLayout({ activePath, children, onNavigate }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activePath]);

  function navigate(path: string) {
    onNavigate(path);
    setMobileMenuOpen(false);
  }

  return (
    <div className={`app-layout${sidebarCollapsed ? " sidebar-is-collapsed" : ""}`}>
      <Sidebar
        activePath={activePath}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCollapse={() => setSidebarCollapsed((current) => !current)}
        onNavigate={navigate}
      />
      {mobileMenuOpen && (
        <button
          className="sidebar-overlay"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <div className="app-workspace">
        <Topbar activePath={activePath} onNavigate={navigate} onOpenMenu={() => setMobileMenuOpen(true)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
