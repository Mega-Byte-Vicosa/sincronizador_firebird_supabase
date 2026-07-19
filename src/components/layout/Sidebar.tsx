import { useEffect, useState, type ReactNode } from "react";

interface SidebarProps {
  activePath: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapse: () => void;
  onNavigate: (path: string) => void;
}

interface SidebarItem {
  label: string;
  icon: string;
  path?: string;
  children?: Array<{ label: string; path: string }>;
}

function MenuIcon({ icon }: { icon: string }) {
  const paths: Record<string, ReactNode> = {
    D: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    U: <><path d="M16 19v-1.4c0-1.5-1.2-2.7-2.7-2.7H6.7C5.2 14.9 4 16.1 4 17.6V19" /><circle cx="10" cy="8" r="3" /><path d="M20 19v-1.3c0-1.3-.8-2.4-2-2.8" /><path d="M16.7 5.2a3 3 0 0 1 0 5.6" /></>,
    R: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    A: <><path d="M4 7h10a4 4 0 0 1 4 4v1" /><path d="m15 9 3 3 3-3" /><path d="M20 17H10a4 4 0 0 1-4-4v-1" /><path d="m9 15-3-3-3 3" /></>,
    C: <><path d="m3 11 15-6v14L3 13z" /><path d="M7 14v5h4" /></>,
    M: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    H: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    S: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[icon]}</svg>;
}

const groups: Array<{ title: string; items: SidebarItem[] }> = [
  {
    title: "Visao Geral",
    items: [{ label: "Dashboard", path: "/dashboard", icon: "D" }],
  },
  {
    title: "Operacional",
    items: [
      { label: "Clientes", path: "/clientes", icon: "U" },
      { label: "Contas a Receber", path: "/contas-a-receber", icon: "R" },
      { label: "Automações", path: "/automacoes", icon: "A" },
      {
        label: "Campanhas/Promoções",
        icon: "C",
        children: [
          { label: "Campanhas/Promoções", path: "/campanhas-promocao" },
          { label: "Modelos", path: "/campanhas-promocao/modelos" },
        ],
      },
      { label: "Mensagens Programadas", path: "/mensagens-programadas", icon: "M" },
      { label: "Histórico", path: "/historico-envios", icon: "H" },
    ],
  },
  {
    title: "Sistema",
    items: [{ label: "Configurações", icon: "S", children: [
      { label: "Geral", path: "/configuracoes" },
      { label: "Modelos", path: "/configuracoes/modelos" },
    ] }],
  },
];

export function Sidebar({ activePath, collapsed, mobileOpen, onCollapse, onNavigate }: SidebarProps) {
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!activePath.startsWith("/campanhas-promocao")) setCampaignsOpen(false);
    if (!activePath.startsWith("/configuracoes")) setSettingsOpen(false);
  }, [activePath]);

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " sidebar-mobile-open" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">MBC</div>
        <div className="sidebar-brand-copy">
          <strong>MegaByte Connect</strong>
          <span>Automação inteligente para sua empresa</span>
        </div>
        <button className="sidebar-collapse-button" type="button" onClick={onCollapse} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          <span aria-hidden="true">{collapsed ? ">" : "<"}</span>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
        {groups.map((group) => (
          <section className="sidebar-group" key={group.title}>
            <h2>{group.title}</h2>
            {group.items.map((item) => {
              if (item.children) {
                const active = item.children.some((child) => activePath === child.path);
                const configuracoes = item.label === "Configurações";
                const open = configuracoes ? settingsOpen : campaignsOpen;

                return (
                  <div className={`sidebar-submenu-group${open ? " sidebar-submenu-group-open" : ""}`} key={item.label}>
                    <button
                      className={active ? "sidebar-link sidebar-link-active sidebar-group-trigger" : "sidebar-link sidebar-group-trigger"}
                      type="button"
                      title={collapsed ? item.label : undefined}
                      aria-expanded={open}
                      onClick={() => {
                        if (collapsed) {
                          onCollapse();
                          if (configuracoes) setSettingsOpen(true); else setCampaignsOpen(true);
                          return;
                        }
                        if (configuracoes) setSettingsOpen((current) => !current);
                        else setCampaignsOpen((current) => !current);
                      }}
                    >
                      <span className="sidebar-icon" aria-hidden="true"><MenuIcon icon={item.icon} /></span>
                      <span className="sidebar-link-label">{item.label}</span>
                      <span className="sidebar-submenu-chevron" aria-hidden="true" />
                    </button>
                    <div className="sidebar-submenu">
                      {item.children.map((child) => (
                        <a
                          className={activePath === child.path ? "sidebar-submenu-link sidebar-submenu-link-active" : "sidebar-submenu-link"}
                          href={child.path}
                          key={child.path}
                          onClick={(event) => {
                            event.preventDefault();
                            onNavigate(child.path);
                            if (configuracoes) setSettingsOpen(false);
                            else setCampaignsOpen(false);
                          }}
                        >
                          <span aria-hidden="true" />
                          {child.label}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              }

              const active = activePath === item.path;

              return (
                <a
                  className={active ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                  href={item.path!}
                  key={item.path}
                  title={collapsed ? item.label : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(item.path!);
                    setCampaignsOpen(false);
                    setSettingsOpen(false);
                  }}
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <MenuIcon icon={item.icon} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </a>
              );
            })}
          </section>
        ))}
      </nav>
    </aside>
  );
}
