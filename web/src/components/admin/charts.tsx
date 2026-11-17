// Dependency-free SVG charts for the admin dashboard. Colors come from CSS vars
// (--aa-*) so they follow the theme. Marks are drawn to scale from the data.

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const step = m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return step * p;
}
const fmt = (n: number) => n.toLocaleString('en-US');
const kfmt = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));

export function AreaChart({ data, labels, color = 'var(--aa-accent)' }: { data: number[]; labels: string[]; color?: string }) {
  const W = 560, H = 210, padL = 42, padR = 14, padT = 12, padB = 26;
  if (data.length < 2) return <div className="aa-empty">Not enough data yet.</div>;
  const max = niceMax(Math.max(...data, 1));
  const x = (i: number) => padL + (W - padL - padR) * (i / (data.length - 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const gid = `aaGrad-${color.replace(/\W/g, '')}`;
  return (
    <svg className="aa-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((g) => {
        const gv = (max * g) / 4;
        return (
          <g key={g}>
            <line className="aa-gridline" x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} />
            <text className="aa-tick aa-tick--y" x={padL - 8} y={y(gv) + 3}>{kfmt(gv)}</text>
          </g>
        );
      })}
      {labels.map((lab, i) =>
        labels.length > 8 && i % 2 !== 0 && i !== labels.length - 1 ? null : (
          <text key={i} className="aa-tick aa-tick--x" x={x(i)} y={H - 8}>{lab}</text>
        ),
      )}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={4} fill={color} stroke="var(--aa-surface)" strokeWidth={2} />
    </svg>
  );
}

export function BarChart({ data, labels, color = 'var(--aa-accent)' }: { data: number[]; labels: string[]; color?: string }) {
  const W = 560, H = 210, padL = 38, padR = 14, padT = 12, padB = 26;
  if (!data.length) return <div className="aa-empty">No data yet.</div>;
  const max = niceMax(Math.max(...data, 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const bw = (W - padL - padR) / data.length;
  return (
    <svg className="aa-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[0, 1, 2, 3, 4].map((g) => {
        const gv = (max * g) / 4;
        return (
          <g key={g}>
            <line className="aa-gridline" x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} />
            <text className="aa-tick aa-tick--y" x={padL - 8} y={y(gv) + 3}>{kfmt(gv)}</text>
          </g>
        );
      })}
      {data.map((v, i) => {
        const bx = padL + bw * i + bw * 0.18;
        const by = y(v);
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bw * 0.64} height={Math.max(1, H - padT - padB - (by - padT))} rx={4} fill={color}>
              <title>{`${fmt(v)} · ${labels[i] ?? ''}`}</title>
            </rect>
            {(data.length <= 14 && i % (data.length > 10 ? 2 : 1) === 0) && (
              <text className="aa-tick aa-tick--x" x={bx + bw * 0.32} y={H - 8}>{labels[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ segments }: { segments: { name: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <div className="aa-empty">No data yet.</div>;
  const size = 150, r = 58, cw = 20, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="aa-donut-wrap">
      <svg className="aa-chart" viewBox={`0 0 ${size} ${size}`} style={{ width: size, flex: '0 0 auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--aa-surface-3)" strokeWidth={cw} />
        {segments.map((seg) => {
          const len = (seg.value / total) * C;
          const el = (
            <circle key={seg.name} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={cw}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`}>
              <title>{`${seg.name} · ${fmt(seg.value)} (${Math.round((seg.value / total) * 100)}%)`}</title>
            </circle>
          );
          off += len;
          return el;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={22} fontWeight={750} fill="var(--aa-text)">{fmt(total)}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10.5} fill="var(--aa-muted)">total</text>
      </svg>
      <div className="aa-donut-legend">
        {segments.map((seg) => (
          <div className="aa-row" key={seg.name}>
            <span className="aa-dot" style={{ background: seg.color }} />
            {seg.name}
            <b className="aa-tnum">{fmt(seg.value)}</b>
            <span className="aa-pct">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ stages }: { stages: { name: string; value: number; color: string }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="aa-funnel">
      {stages.map((s, i) => {
        const conv = i === 0 || stages[i - 1].value === 0 ? null : Math.round((s.value / stages[i - 1].value) * 100);
        return (
          <div key={s.name}>
            <div className="aa-fstage__top">
              <span>{s.name}</span>
              <span className="aa-n">{fmt(s.value)}{conv !== null && <span style={{ color: 'var(--aa-muted)', fontWeight: 500 }}> · {conv}%</span>}</span>
            </div>
            <div className="aa-fbar"><i style={{ width: `${(s.value / max) * 100}%`, background: s.color }} /></div>
          </div>
        );
      })}
    </div>
  );
}
