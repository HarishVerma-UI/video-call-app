import type { Conversation, DmMessage } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ago } from '../../format';
import { ProfileAvatar } from './common';

export function MessagesView({ initialUser }: { initialUser?: string }) {
  const { api, user } = useAuth();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<string | null>(initialUser ?? null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [headerName, setHeaderName] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(() => {
    api.conversations().then(({ conversations }) => setConvs(conversations)).catch(() => setConvs([]));
  }, [api]);
  useEffect(() => loadConvs(), [loadConvs]);

  const loadThread = useCallback(async (other: string) => {
    try {
      setMessages((await api.dmThread(other)).messages);
    } catch {
      setMessages([]);
    }
  }, [api]);
  useEffect(() => {
    if (active) void loadThread(active);
  }, [active, loadThread]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!active) return setHeaderName('');
    const c = (convs ?? []).find((x) => x.other === active);
    if (c) return setHeaderName(c.profile.name || 'Member');
    api.getProfile(active).then(({ profile }) => setHeaderName(profile.name || 'Member')).catch(() => setHeaderName('Member'));
  }, [active, convs, api]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !active) return;
    setText('');
    setErr(null);
    try {
      const { message } = await api.sendDm(active, t);
      setMessages((xs) => [...xs, message]);
      loadConvs();
    } catch {
      setErr("Couldn't send. You can only message your connections.");
    }
  };

  if (!user) return null;

  return (
    <section className="page messages" aria-label="Messages" data-testid="messages">
      <aside className="messages__list">
        <div className="messages__list-header">
          <h2>Messages</h2>
        </div>
        {convs === null ? (
          <div className="skeleton-list" aria-hidden="true"><i /></div>
        ) : convs.length === 0 ? (
          <p className="card__empty">No messages yet.</p>
        ) : (
          <ul>
            {convs.map((c) => (
              <li key={c.other}>
                <button className={`messages__conv${active === c.other ? ' is-on' : ''}`} onClick={() => setActive(c.other)}>
                  <div className="messages__conv-avatar">
                    <ProfileAvatar profile={c.profile} size={40} />
                    <i className="online-dot" />
                  </div>
                  <span className="messages__conv-text">
                    <span className="messages__conv-top">
                      <strong>{c.profile.name || 'Member'}</strong>
                      <time>{ago(c.last.ts)}</time>
                    </span>
                    <span className="messages__conv-preview">{c.last.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="messages__thread">
        {!active ? (
          <div className="messages__empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <p>Pick a conversation, or message someone from their profile.</p>
          </div>
        ) : (
          <>
            <header className="messages__head">
              <strong>{headerName}</strong>
              <div className="messages__head-actions">
                <button className="messages__icon-btn" title="Start video call" aria-label="Start video call">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                </button>
              </div>
            </header>
            <div className="messages__scroll" ref={scrollRef}>
              {messages.map((m) => (
                <div key={m.id} className={`bubble${m.from === user.id ? ' bubble--mine' : ''}`}>
                  <span className="bubble__text">{m.text}</span>
                  <time className="bubble__time">{ago(m.ts)}</time>
                </div>
              ))}
            </div>
            {err && <p className="form-msg" role="alert">{err}</p>}
            <form className="messages__send" onSubmit={send}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" aria-label="Write a message" />
              <button className="btn btn--primary btn--small" type="submit" disabled={!text.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
