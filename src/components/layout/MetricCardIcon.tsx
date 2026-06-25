export function MetricCardIcon({ type }: { type: string }) {
  if (type === "calendar") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 15h6" /></svg>;
  }

  if (type === "sent") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 4-4" /></svg>;
  }

  if (type === "error") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.5 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>;
  }

  if (type === "pending") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>;
}
