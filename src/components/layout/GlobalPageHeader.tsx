import type { ReactNode } from "react";

export type GlobalHeaderIconName =
  | "dashboard"
  | "users"
  | "receipt"
  | "automation"
  | "megaphone"
  | "message"
  | "calendar"
  | "history"
  | "settings"
  | "home"
  | "chevron"
  | "search"
  | "gift"
  | "bell"
  | "down";

export function GlobalHeaderIcon({ name }: { name: GlobalHeaderIconName }) {
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (name === "chevron" || name === "down") return <svg className={name === "down" ? "icon-down" : ""} viewBox="0 0 24 24" aria-hidden="true"><path d={name === "down" ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6"} /></svg>;
  if (name === "search") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>;
  if (name === "gift") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.2-3.7L12 8Zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 8Z" /></svg>;
  if (name === "bell") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
  if (name === "dashboard") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
  if (name === "users") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a6 6 0 0 1 12 0v2M16 4.5a4 4 0 0 1 0 7M16 15a6 6 0 0 1 6 6" /></svg>;
  if (name === "receipt") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (name === "automation") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 9a7 7 0 0 1 12-2l2 5M4 12l2 5a7 7 0 0 0 12-2" /></svg>;
  if (name === "megaphone") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13V8.5c0-.8.6-1.5 1.4-1.6L18 4v16L5.4 17.1A1.7 1.7 0 0 1 4 15.5V13Z" /><path d="M8 17v2.2c0 .8.7 1.4 1.5 1.2l1.8-.5M18 9.5h2M18 14.5h2" /></svg>;
  if (name === "message") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" /><path d="M8 9h8M8 13h5" /></svg>;
  if (name === "calendar") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M12 14v3l2 1" /></svg>;
  if (name === "history") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
}

interface GlobalPageHeaderProps {
  title: string;
  subtitle: string;
  icon: GlobalHeaderIconName;
  actions?: ReactNode;
}

export function GlobalPageHeader({ title, subtitle, icon, actions }: GlobalPageHeaderProps) {
  return (
    <header className="page-global-hero">
      <div className="page-global-hero-title">
        <span className="page-global-hero-icon" aria-hidden="true"><GlobalHeaderIcon name={icon} /></span>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
      </div>
      {actions && <div className="page-global-hero-actions">{actions}</div>}
    </header>
  );
}
