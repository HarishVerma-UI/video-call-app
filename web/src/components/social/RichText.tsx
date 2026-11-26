// Render post text with clickable links and coloured #hashtags. URLs
// (http(s):// or bare www.) open in a new tab; hashtags are highlighted in their
// own colour. Everything else stays plain text. Used anywhere a post body shows.
import type { ReactNode } from 'react';

// One pass over the text: match a URL or a #hashtag; keep the gaps as plain text.
const RICH_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;!?)'"])|(#[\p{L}0-9_]{1,50})/gu;

export function RichText({ text }: { text: string }) {
  if (!text) return null;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(RICH_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    if (m[1]) {
      const href = /^https?:\/\//i.test(m[1]) ? m[1] : `https://${m[1]}`;
      out.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer nofollow" className="post__link">{m[1]}</a>,
      );
    } else {
      out.push(<span key={key++} className="post__tag">{m[2]}</span>);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
