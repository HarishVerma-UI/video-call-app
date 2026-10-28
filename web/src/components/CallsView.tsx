import type { CallRecord } from '@vca/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { duration, longWhen, names, roomTitle } from '../format';
import { ChatIcon, PhoneIcon, VideoIcon } from './Icons';
import { RoomBadge } from './RoomBadge';

/** Your call history, newest first, with one-click "call again". */
export function CallsView({ onJoin, openChat }: { onJoin: (room: string) => void; openChat: (room: string) => void }) {
  const { api } = useAuth();
  const [calls, setCalls] = useState<CallRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .calls()
      .then(({ calls }) => !cancelled && setCalls(calls))
      .catch(() => !cancelled && setCalls([]));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const total = (calls ?? []).reduce((n, c) => n + c.durationSec, 0);

  return (
    <section className="page" aria-label="Calls">
      <header className="page__head">
        <div>
          <h1>Calls</h1>
          <p>{calls && calls.length > 0 ? `${calls.length} recent ${calls.length === 1 ? 'call' : 'calls'} · ${duration(total)} together` : 'Your call history'}</p>
        </div>
      </header>

      {calls === null ? (
        <div className="skeleton-list skeleton-list--wide" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : calls.length === 0 ? (
        <div className="empty">
          <div className="empty__art empty__art--calls" aria-hidden="true">
            <PhoneIcon width={34} height={34} />
          </div>
          <h2>No calls yet</h2>
          <p>When you leave a meeting, it shows up here with who was there and how long it lasted.</p>
        </div>
      ) : (
        <ul className="calls" data-testid="calls">
          {calls.map((c) => (
            <li key={c.id} className="calls__row">
              <RoomBadge roomId={c.roomId} size={40} />
              <div className="calls__main">
                <strong>{roomTitle(c.roomId)}</strong>
                <span>{c.with.length ? `With ${names(c.with)}` : 'Just you'}</span>
              </div>
              <div className="calls__when">
                <span>{longWhen(c.endedAt)}</span>
                <span className="calls__dur">{duration(c.durationSec)}</span>
              </div>
              <div className="calls__actions">
                <button className="icon-btn" onClick={() => openChat(c.roomId)} aria-label={`Open chat for ${roomTitle(c.roomId)}`} title="Open chat">
                  <ChatIcon width={18} height={18} />
                </button>
                <button className="btn btn--secondary btn--small" onClick={() => onJoin(c.roomId)}>
                  <VideoIcon width={16} height={16} /> Call again
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
