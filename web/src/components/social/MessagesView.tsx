import { type Conversation, type DmMessage, type Profile } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useCalling } from '../../calling';
import { ago } from '../../format';
import { ProfileAvatar } from './common';

export function MessagesView({ initialUser }: { initialUser?: string }) {
  const { api, user } = useAuth();
  const { callUser } = useCalling();
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [connections, setConnections] = useState<Profile[]>([]);
  const [active, setActive] = useState<string | null>(initialUser ?? null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [headerName, setHeaderName] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [convPage, setConvPage] = useState(1);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const CONV_PAGE_SIZE = 20;

  const loadConvs = useCallback(() => {
    api.conversations().then(({ conversations }) => setConvs(conversations)).catch(() => setConvs([]));
  }, [api]);
  useEffect(() => loadConvs(), [loadConvs]);

  // Your connections — people you can start a conversation with.
  useEffect(() => {
    api.listConnections().then(({ connections: c }) => setConnections(c)).catch(() => {});
  }, [api]);

  const loadThread = useCallback(async (other: string) => {
    try {
      const result = await api.dmThread(other);
      setMessages(result.messages);
      setHasMoreMsgs(result.messages.length >= 50);
    } catch {
      setMessages([]);
      setHasMoreMsgs(false);
    }
  }, [api]);

  const loadOlderMessages = async () => {
    if (!active || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const { messages: older } = await api.dmThread(active);
      // Filter to messages older than our current oldest
      const newOlder = older.filter((m) => m.ts < oldest.ts);
      if (newOlder.length > 0) {
        setMessages((prev) => [...newOlder, ...prev]);
      }
      setHasMoreMsgs(false); // We fetched all available
    } catch {
      /* ignore */
    } finally {
      setLoadingOlder(false);
    }
  };
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
        ) : (
          <>
            {convs.length > 0 && (
              <ul>
                {convs.slice(0, convPage * CONV_PAGE_SIZE).map((c) => (
                  <li key={c.other}>
                    <button className={`messages__conv${active === c.other ? ' is-on' : ''}`} onClick={() => setActive(c.other)}>
                      <div className="messages__conv-avatar">
                        <ProfileAvatar profile={c.profile} size={40} />
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
            {convs.length > convPage * CONV_PAGE_SIZE && (
              <button className="btn btn--secondary btn--small btn--full" onClick={() => setConvPage((p) => p + 1)} style={{ margin: '0.5rem' }}>
                Show more conversations
              </button>
            )}

            {/* People you know — start a new conversation with a connection. */}
            {(() => {
              const convIds = new Set((convs ?? []).map((c) => c.other));
              const startable = connections.filter((p) => !convIds.has(p.userId)).slice(0, 20);
              if (convs.length === 0 && startable.length === 0)
                return <p className="card__empty">No messages yet. Connect with people to start chatting.</p>;
              if (startable.length === 0) return null;
              return (
                <div className="messages__people">
                  <h3 className="messages__people-title">People you know</h3>
                  <ul>
                    {startable.map((p) => (
                      <li key={p.userId}>
                        <button className={`messages__conv${active === p.userId ? ' is-on' : ''}`} onClick={() => setActive(p.userId)}>
                          <div className="messages__conv-avatar">
                            <ProfileAvatar profile={p} size={40} />
                          </div>
                          <span className="messages__conv-text">
                            <span className="messages__conv-top">
                              <strong>{p.name || 'Member'}</strong>
                            </span>
                            {p.headline && <span className="messages__conv-preview">{p.headline}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </>
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
                <button className="messages__call-btn" title={`Video call ${headerName}`} aria-label={`Video call ${headerName}`} onClick={() => { if (active) callUser(active, headerName); }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                  Call
                </button>
              </div>
            </header>
            <div className="messages__scroll" ref={scrollRef}>
              {hasMoreMsgs && (
                <button className="btn btn--secondary btn--small" onClick={() => void loadOlderMessages()} disabled={loadingOlder} style={{ alignSelf: 'center', margin: '0.5rem auto', display: 'block' }}>
                  {loadingOlder ? 'Loading...' : 'Load older messages'}
                </button>
              )}
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
