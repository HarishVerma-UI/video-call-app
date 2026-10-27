import { useRef, type KeyboardEvent } from 'react';
import { changeFilm, FILMS, useFilm, type FilmId } from '../theme';

/** Choose the app's palette. Each swatch shows the stock's background, accent and highlight. */
export function FilmPicker({ className = '' }: { className?: string }) {
  const film = useFilm();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = FILMS.find((f) => f.id === film)!;

  // Arrow keys move between swatches, as in any radio group.
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + FILMS.length) % FILMS.length;
    refs.current[next]?.focus();
    void changeFilm(FILMS[next].id as FilmId);
  };

  return (
    <div className={`films ${className}`}>
      <div className="films__row" role="radiogroup" aria-label="Colour palette">
        {FILMS.map((f, i) => (
          <button
            key={f.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={f.id === film}
            aria-label={f.name}
            title={f.name}
            tabIndex={f.id === film ? 0 : -1}
            className="films__swatch"
            style={{ background: `conic-gradient(from -60deg, ${f.swatch[1]} 0 120deg, ${f.swatch[2]} 0 200deg, ${f.swatch[0]} 0)` }}
            onClick={() => void changeFilm(f.id as FilmId)}
            onKeyDown={(e) => onKey(e, i)}
            data-film={f.id}
          />
        ))}
      </div>
      <span className="films__name" aria-live="polite">
        {active.name}
      </span>
    </div>
  );
}
