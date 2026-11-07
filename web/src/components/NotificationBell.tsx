import type { Notification } from '@vca/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ago } from '../format';
import { usePresence, type PresenceMessage } from '../presence';

/** Top-bar bell: live like/comment/call notifications with an unread badge. */
export function NotificationBell({ onOpenPost, onJoinCall }: { onOpenPost?: (postId: string) => void; onJoinCall?: (roomId: string) => void }) {
  const { api } = useAuth();
  const { subscribe } = usePresence();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.notifications().then(({ notifications, unread: u }) => {
      setItems(notifications);
      setUnread(u);
    }).catch(() => {});
  }, [api]);
  useEffect(() => load(), [load]);

  // Live pushes over the presence channel.
  useEffect(() => {
    return subscribe('notification', (msg: PresenceMessage) => {
      const n = msg.notification as Notification | undefined;
      if (n) setItems((xs) => [n, ...xs].slice(0, 30));
      setUnread((u) => (typeof msg.unread === 'number' ? (msg.unread as number) : u + 1));
    });
  }, [subscribe]);

  // Close on outside click / Escape.
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

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      api.markNotificationsRead().catch(() => {});
    }
  };

  const text = (n: Notification) => (n.kind === 'like' ? 'liked your post' : n.kind === 'call' ? 'is calling you' : 'commented on your post');

  return (
    <div className="notif" ref={ref}>
      <button className="titlebar__icon" onClick={toggle} aria-label={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'} title="Notifications" aria-expanded={open} data-testid="notif-bell">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {unread > 0 && <span className="titlebar__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif__pop" role="menu">
          <div className="notif__head">Notifications</div>
          {items.length === 0 ? (
            <p className="notif__empty">No notifications yet.</p>
          ) : (
            <ul className="notif__list">
              {items.map((n) => (
                <li key={n.id} className={`notif__item${n.read ? '' : ' is-unread'}`}>
                  <button className="notif__row" onClick={() => { setOpen(false); if (n.kind !== 'call' && n.postId && onOpenPost) onOpenPost(n.postId); }}>
                    <span className={`notif__dot notif__dot--${n.kind}`} aria-hidden="true">{n.kind === 'like' ? '♥' : n.kind === 'call' ? '📞' : '💬'}</span>
                    <span className="notif__text">
                      <strong>{n.actorName || 'Someone'}</strong> {text(n)}
                      {n.text && <span className="notif__snippet">“{n.text}”</span>}
                      <time className="notif__time">{ago(n.ts)}</time>
                      {n.kind === 'call' && n.roomId && (
                        <button className="btn btn--primary btn--small notif__join" onClick={(e) => { e.stopPropagation(); setOpen(false); onJoinCall?.(n.roomId as string); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                          Join call
                        </button>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
