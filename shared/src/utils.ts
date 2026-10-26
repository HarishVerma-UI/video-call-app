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
  const palette = ['#4f8cff', '#35c47a', '#ff7a59', '#b07cff', '#f5b941', '#2ec5d3', '#ff5d8f', '#7c8cff'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
