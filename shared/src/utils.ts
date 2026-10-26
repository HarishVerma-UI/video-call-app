import { ROOM_ID_PATTERN } from './protocol';

const WORDS_A = ['calm', 'bright', 'swift', 'quiet', 'bold', 'lucky', 'sunny', 'cosmic', 'gentle', 'brave'];
const WORDS_B = ['river', 'falcon', 'maple', 'comet', 'harbor', 'lotus', 'tiger', 'meadow', 'orbit', 'cedar'];

/** A friendly, shareable room code like "swift-comet-482". */
export function generateRoomId(): string {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${a}-${b}-${n}`;
}

/** Turn whatever the user typed into a valid room id, or null. */
export function normalizeRoomId(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, '-');
  return ROOM_ID_PATTERN.test(cleaned) ? cleaned : null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Stable color per participant id, for avatars. */
export function colorFor(id: string): string {
  // Darkroom palette: light, warm tones that read on aubergine with dark ink initials.
  const palette = ['#ffb48f', '#8ee6c9', '#ffd27a', '#c7b6ff', '#f4a6c1', '#8fc8ff', '#e8c9a0', '#ff9a85'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
