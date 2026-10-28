import { colorFor } from '@vca/shared';

/** A room's avatar: a rounded tile with its initials, tinted from the room code. */
export function RoomBadge({ roomId, size = 40, live = false }: { roomId: string; size?: number; live?: boolean }) {
  const words = roomId.split(/[-_]+/).filter((w) => /[a-z]/i.test(w));
  const letters = (words.length ? words.slice(0, 2).map((w) => w[0]) : [roomId[0] ?? '#']).join('').toUpperCase();
  return (
    <span className={`room-badge${live ? ' room-badge--live' : ''}`} style={{ width: size, height: size, ['--rb' as string]: colorFor(roomId) }} aria-hidden="true">
      {letters}
    </span>
  );
}

export function Avatar({ id, name, size = 32, ring = false }: { id: string; name: string; size?: number; ring?: boolean }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  return (
    <span className={`avatar${ring ? ' avatar--ring' : ''}`} style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(id) }} aria-hidden="true">
      {ini}
    </span>
  );
}
