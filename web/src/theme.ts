import { useEffect, useState } from 'react';

/**
 * "Film stocks": the app's colour palettes, named after real photographic
 * processes. The tokens live in styles.css under :root[data-theme='…'];
 * this file picks one, remembers it per viewer, and runs the change.
 */
export const FILMS = [
  { id: 'kodachrome', name: 'Kodachrome', swatch: ['#0f2c3f', '#ffc93c', '#f2542d'], meta: '#0f2c3f' },
  { id: 'cyanotype', name: 'Cyanotype', swatch: ['#eef2fb', '#1f4fd1', '#112250'], meta: '#eef2fb' },
  { id: 'velvia', name: 'Velvia', swatch: ['#0e2a20', '#ff3d8b', '#b6f24a'], meta: '#0e2a20' },
  { id: 'darkroom', name: 'Darkroom', swatch: ['#1c1530', '#ffb48f', '#ff6a55'], meta: '#1c1530' },
] as const;

export type FilmId = (typeof FILMS)[number]['id'];
const KEY = 'huddle:film';
const DEFAULT: FilmId = 'kodachrome';

const isFilm = (v: unknown): v is FilmId => FILMS.some((f) => f.id === v);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function currentFilm(): FilmId {
  const v = document.documentElement.dataset.theme;
  return isFilm(v) ? v : DEFAULT;
}

function savedFilm(): FilmId {
  try {
    const v = localStorage.getItem(KEY);
    return isFilm(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function apply(id: FilmId) {
  document.documentElement.dataset.theme = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', FILMS.find((f) => f.id === id)!.meta);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked — the choice lasts for this visit */
  }
  window.dispatchEvent(new CustomEvent('huddle:film', { detail: id }));
}

/** Call once before rendering, so the page never flashes the wrong colours. */
export function initFilm() {
  apply(savedFilm());
  // Keep tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && isFilm(e.newValue) && e.newValue !== currentFilm()) apply(e.newValue);
  });
}

let changing = false;
/**
 * Change film like a camera would: the shutter closes, the stock is swapped
 * (cross-faded with a View Transition where the browser supports it), then
 * the shutter opens again.
 */
export async function changeFilm(id: FilmId) {
  if (changing || id === currentFilm()) return;
  changing = true;
  const motion = !reducedMotion();
  const root = document.documentElement;
  root.classList.add('shuttering'); // blades move at shutter speed, not the slow iris speed
  window.dispatchEvent(new Event('huddle:shutter-close'));
  if (motion) await wait(300);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (motion && doc.startViewTransition) await doc.startViewTransition(() => apply(id)).finished.catch(() => {});
  else apply(id);
  window.dispatchEvent(new Event('huddle:shutter-open'));
  if (motion) await wait(450);
  root.classList.remove('shuttering');
  changing = false;
}

/** The active film, kept up to date. */
export function useFilm(): FilmId {
  const [film, setFilm] = useState<FilmId>(currentFilm);
  useEffect(() => {
    const on = (e: Event) => setFilm((e as CustomEvent<FilmId>).detail);
    window.addEventListener('huddle:film', on);
    return () => window.removeEventListener('huddle:film', on);
  }, []);
  return film;
}

/** True while the shutter is closed for a film change — lenses use it to blink. */
export function useShutter(): boolean {
  const [shut, setShut] = useState(false);
  useEffect(() => {
    const close = () => setShut(true);
    const open = () => setShut(false);
    window.addEventListener('huddle:shutter-close', close);
    window.addEventListener('huddle:shutter-open', open);
    return () => {
      window.removeEventListener('huddle:shutter-close', close);
      window.removeEventListener('huddle:shutter-open', open);
    };
  }, []);
  return shut;
}
