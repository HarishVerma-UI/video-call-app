/** Short relative time, e.g. "just now", "4 min ago", "3 d ago", or a date. */
export function ago(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined) return '';
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return '1 min ago';
  const m = s / 60;
  if (m < 45) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 22) return `${Math.round(h)} h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.round(d)} d ago`;
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
