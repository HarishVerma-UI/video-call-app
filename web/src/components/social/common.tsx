import type { ApiClient, ConnectionState, Profile } from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../RoomBadge';

const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤩', '😇', '🙂', '😉', '😌', '😋', '😜', '🤔', '🤗', '👍', '👏', '🙌', '🙏', '💪', '🔥', '🎉', '✨', '💯', '❤️', '🧡', '💛', '💚', '💙', '💜', '😢', '😭', '😅', '😮', '😡', '🚀', '⭐', '✅', '👀'];

/** A smiley button that opens a small popover of emojis; picking one calls `onPick`. */
export function EmojiPicker({ onPick, className = 'post__comment-emoji' }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="emoji-pick" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-label="Add emoji" aria-expanded={open} title="Add emoji">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
      </button>
      {open && (
        <div className="emoji-pick__pop" role="menu">
          {EMOJIS.map((em) => (
            <button type="button" key={em} className="emoji-pick__item" onClick={() => { onPick(em); setOpen(false); }} aria-label={`Add ${em}`}>{em}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A photo if the profile has one, otherwise initials. */
export function ProfileAvatar({ profile, size = 48 }: { profile: { userId: string; name: string; photoUrl?: string | null }; size?: number }) {
  if (profile.photoUrl)
    return <img className="pf-avatar" src={profile.photoUrl} alt="" style={{ width: size, height: size }} />;
  return <Avatar id={profile.userId} name={profile.name || '?'} size={size} />;
}

/** Connect / Accept / Requested / Connected button, driven by the profile's connection state. */
export function ConnectButton({ profile, api, onChange }: { profile: Profile; api: ApiClient; onChange: (s: ConnectionState) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<{ status: ConnectionState }>) => {
    setBusy(true);
    try {
      onChange((await fn()).status);
    } catch {
      /* surfaced by caller refresh */
    } finally {
      setBusy(false);
    }
  };
  if (profile.connection === 'self') return null;
  if (profile.connection === 'connected') return <span className="pill pill--ok">Connected</span>;
  if (profile.connection === 'pending_outgoing')
    return (
      <button className="btn btn--secondary btn--small" disabled>
        Requested
      </button>
    );
  if (profile.connection === 'pending_incoming')
    return (
      <button className="btn btn--primary btn--small" disabled={busy} onClick={() => void act(() => api.acceptConnect(profile.userId))}>
        Accept
      </button>
    );
  return (
    <button className="btn btn--primary btn--small" disabled={busy} onClick={() => void act(() => api.requestConnect(profile.userId))}>
      + Connect
    </button>
  );
}

export function roleBadges(p: { mentor: boolean; mentee: boolean }) {
  const out: string[] = [];
  if (p.mentor) out.push('Mentor');
  if (p.mentee) out.push('Looking for mentorship');
  return out;
}
