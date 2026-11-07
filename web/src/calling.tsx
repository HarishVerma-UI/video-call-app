import { createContext, useContext } from 'react';
import { ProfileAvatar } from './components/social/common';

export interface CallingApi {
  /** Ring a specific user and enter the call room to wait for them. */
  callUser: (userId: string, name: string) => void;
}

export const CallingContext = createContext<CallingApi | null>(null);

export function useCalling(): CallingApi {
  const ctx = useContext(CallingContext);
  if (!ctx) throw new Error('useCalling must be used within a CallingProvider');
  return ctx;
}

/** Full-screen incoming-call prompt shown to the person being rung. */
export function IncomingCallModal({ fromName, fromId, onAccept, onDecline }: { fromName: string; fromId: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="incoming" role="dialog" aria-modal="true" aria-label={`Incoming call from ${fromName}`}>
      <div className="incoming__card">
        <div className="incoming__avatar incoming__avatar--ring">
          <ProfileAvatar profile={{ userId: fromId, name: fromName }} size={88} />
        </div>
        <div className="incoming__who">
          <strong>{fromName || 'Someone'}</strong>
          <span>is calling you…</span>
        </div>
        <div className="incoming__actions">
          <button className="incoming__btn incoming__btn--decline" onClick={onDecline} aria-label="Decline">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.5.4A2 2 0 0 1 23 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="23" y1="1" x2="1" y2="23" /></svg>
            Decline
          </button>
          <button className="incoming__btn incoming__btn--accept" onClick={onAccept} aria-label="Accept">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
