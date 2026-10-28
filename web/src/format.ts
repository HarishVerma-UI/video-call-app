// Display helpers for times, durations and room names.

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "2:14 PM" today, "Yesterday", "Mon" this week, else "12 Oct". */
export function shortWhen(input: string | number | Date): string {
  const d = new Date(input);
  const now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** "Today, 2:14 PM" / "Yesterday, 9:02 AM" / "Mon 12 Oct, 4:30 PM". */
export function longWhen(input: string | number | Date): string {
  const d = new Date(input);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay(d, now)) return `Today, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

/** "45s", "12m", "1h 05m". */
export function duration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "3 minutes ago", "2 days ago". */
export function ago(input: string | number | Date | null): string {
  if (!input) return 'never';
  const s = Math.max(0, (Date.now() - new Date(input).getTime()) / 1000);
  if (s < 60) return 'just now';
  const units: [number, string][] = [
    [86400 * 30, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [n, u] of units) if (s >= n) {
    const v = Math.floor(s / n);
    return `${v} ${u}${v === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

/** "swift-comet-482" → "Swift comet 482" */
export function roomTitle(roomId: string): string {
  const t = roomId.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function names(list: string[], max = 3): string {
  if (list.length === 0) return 'Just you';
  if (list.length <= max) return list.join(', ');
  return `${list.slice(0, max).join(', ')} +${list.length - max}`;
}
