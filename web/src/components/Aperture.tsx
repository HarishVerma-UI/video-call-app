import { useId, type CSSProperties, type ReactNode } from 'react';

/**
 * A six-blade camera iris drawn over whatever is "seen through the lens".
 *
 * `open` goes from 0 (shut) to 1 (wide open, blades hidden). The blades are
 * half-planes rotated 60° apart and pushed out from the centre, so the gap
 * they leave is a hexagon; closing also twists them a little, like a real iris.
 * Transitions are plain CSS, so every state change animates on its own and
 * `prefers-reduced-motion` turns it into an instant cut.
 */
export function Aperture({
  open,
  children,
  className = '',
  style,
  label,
}: {
  open: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Accessible description of what the lens shows; omit for decoration. */
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const o = Math.max(0, Math.min(1, open));
  const r = o * 118; // hexagon inradius in viewBox units (circle radius is 100)
  const twist = (1 - o) * 34; // degrees

  return (
    <div className={`aperture ${className}`} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="aperture__scene">{children}</div>
      <svg className="aperture__blades" viewBox="-100 -100 200 200">
        <defs>
          <clipPath id={`ap-clip-${uid}`}>
            <circle r="100" />
          </clipPath>
          <linearGradient id={`ap-blade-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--blade-a)" />
            <stop offset="1" stopColor="var(--blade-b)" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#ap-clip-${uid})`}>
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} className="aperture__blade" style={{ transform: `rotate(${i * 60 + twist}deg) translateY(${-r}px)` }}>
              <path d="M -70 0 L 210 0 L 210 -240 L -70 -240 Z" fill={`url(#ap-blade-${uid})`} />
              {/* the blade's leading edge catches the light */}
              <path d="M -70 0 L 210 0" className="aperture__edge" />
              <path d="M -70 0 L -70 -240" className="aperture__seam" />
            </g>
          ))}
        </g>
        <circle r="99" className="aperture__rim" />
      </svg>
    </div>
  );
}
