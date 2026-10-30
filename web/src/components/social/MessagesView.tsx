import type { Conversation, DmMessage } from '@vca/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
      setErr('Couldn’t send. You can only message your connections.');
    }
  };

  if (!user) return null;

  return (
    <section className="page messages" aria-label="Messages" data-testid="messages">
      <aside className="messages__list">
        <h2>Messages</h2>
        {convs === null ? (
          <div className="skeleton-list" aria-hidden="true"><i /></div>
        ) : convs.length === 0 ? (
          <p className="card__empty">No messages yet.</p>
        ) : (
          <ul>
            {convs.map((c) => (
              <li key={c.other}>
                <button className={`messages__conv${active === c.other ? ' is-on' : ''}`} onClick={() => setActive(c.other)}>
                  <ProfileAvatar profile={c.profile} size={36} />
                  <span className="messages__conv-text">
                    <strong>{c.profile.name || 'Member'}</strong>
                    <span>{c.last.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="messages__thread">
        {!active ? (
          <p className="card__empty messages__empty">Pick a conversation, or message someone from their profile.</p>
        ) : (
          <>
            <header className="messages__head">{headerName}</header>
            <div className="messages__scroll">
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
              <button className="btn btn--primary btn--small" type="submit" disabled={!text.trim()}>Send</button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
