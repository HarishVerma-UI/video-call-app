import { useEffect, useState } from 'react';

/**
 * Light and dark mode. The colour tokens live in styles.css under
 * :root[data-theme='dark' | 'light']. Until the person picks a mode we follow
 * their device setting (and keep following it if it changes); once they pick,
 * we remember that choice on this device.
 *
 * index.html sets data-theme with a tiny inline script before the page paints,
 * so there's never a flash of the wrong mode.
 */
export type Mode = 'dark' | 'light';
const KEY = 'huddle:mode';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const systemMode = (): Mode => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function savedMode(): Mode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function currentMode(): Mode {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(mode: Mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f3f7f8' : '#0f2c3f');
  window.dispatchEvent(new CustomEvent('huddle:mode', { detail: mode }));
}

/** Call once before rendering. */
export function initMode() {
  apply(savedMode() ?? systemMode());
  // Follow the device while the person hasn't chosen.
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (!savedMode()) apply(systemMode());
  });
  // Keep other tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(savedMode() ?? systemMode());
  });
}

let changing = false;
/**
 * Switch mode like a camera would: the shutter closes, the colours swap
 * (cross-faded with a View Transition where supported), the shutter opens.
 */
export async function setMode(mode: Mode) {
  if (changing || mode === currentMode()) return;
  changing = true;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  const motion = !reducedMotion();
  const root = document.documentElement;
  root.classList.add('shuttering'); // blades move at shutter speed, not the slow iris speed
  window.dispatchEvent(new Event('huddle:shutter-close'));
  if (motion) await wait(300);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (motion && doc.startViewTransition) await doc.startViewTransition(() => apply(mode)).finished.catch(() => {});
  else apply(mode);
  window.dispatchEvent(new Event('huddle:shutter-open'));
  if (motion) await wait(450);
  root.classList.remove('shuttering');
  changing = false;
}

export const toggleMode = () => setMode(currentMode() === 'dark' ? 'light' : 'dark');

/** The active mode, kept up to date. */
export function useMode(): Mode {
  const [mode, set] = useState<Mode>(currentMode);
  useEffect(() => {
    const on = (e: Event) => set((e as CustomEvent<Mode>).detail);
    window.addEventListener('huddle:mode', on);
    return () => window.removeEventListener('huddle:mode', on);
  }, []);
  return mode;
}

/** True while the shutter is closed for a mode change; lenses use it to blink. */
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
