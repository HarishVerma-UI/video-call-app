import { ApiError, normalizeRoomId, type AuthUser, type ChatMessage, type ChatSummary } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { names, roomTitle, shortWhen } from '../format';
import { ChatThread } from './ChatThread';
import { ArrowRightIcon, PlusIcon, VideoIcon } from './Icons';
import { RoomBadge } from './RoomBadge';

interface Props {
  user: AuthUser;
  room: string;
  openRoom: (room: string) => void;
  onJoin: (room: string) => void;
}

const merge = (a: ChatMessage[], b: ChatMessage[]) => {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.ts - y.ts);
};

/** One room's saved chat, outside the call. Polls for new messages while open. */
function Conversation({
  user,
  room,
  summary,
  onJoin,
  onSent,
  onBack,
}: {
  user: AuthUser;
  room: string;
  summary?: ChatSummary;
  onJoin: () => void;
  onSent: () => void;
  onBack: () => void;
}) {
  const { api } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oldest = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);
    const load = async (first: boolean) => {
      try {
        const page = await api.roomMessages(room, { limit: 50 });
        if (cancelled) return;
        setMessages((cur) => (first || !cur ? page.messages : merge(cur, page.messages)));
        if (first) setHasMore(page.hasMore);
      } catch (err) {
        if (!cancelled && first) setError(err instanceof ApiError ? err.message : 'Couldn’t load this chat.');
      }
    };
    void load(true);
    const t = setInterval(() => void load(false), 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [api, room]);
  oldest.current = messages?.[0]?.ts;

  const loadEarlier = useCallback(async () => {
    if (oldest.current === undefined) return;
    setLoadingEarlier(true);
    try {
      const page = await api.roomMessages(room, { before: oldest.current, limit: 50 });
      setMessages((cur) => merge(page.messages, cur ?? []));
      setHasMore(page.hasMore);
    } finally {
      setLoadingEarlier(false);
    }
  }, [api, room]);

  const send = async (text: string) => {
    setError(null);
    try {
      const { message } = await api.sendRoomMessage(room, text);
      setMessages((cur) => merge(cur ?? [], [message]));
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Your message couldn’t be sent.');
    }
  };

  const inCall = summary?.inCall ?? [];
  return (
    <section className="conversation" aria-label={`Chat: ${roomTitle(room)}`}>
      <header className="conversation__head">
        <button className="icon-btn conversation__back" onClick={onBack} aria-label="All chats">
          <ArrowRightIcon width={18} height={18} style={{ transform: 'scaleX(-1)' }} />
        </button>
        <RoomBadge roomId={room} size={36} live={inCall.length > 0} />
        <div className="conversation__title">
          <h2>{roomTitle(room)}</h2>
          <span>{inCall.length > 0 ? `In the meeting: ${names(inCall.map((p) => p.name))}` : `Room code ${room}`}</span>
        </div>
        <button className={`btn ${inCall.length ? 'btn--live' : 'btn--primary'} btn--small`} onClick={onJoin} data-testid="chat-join">
          <VideoIcon width={16} height={16} /> {inCall.length ? 'Join meeting' : 'Meet now'}
        </button>
      </header>
      {error && <p className="alert conversation__alert">{error}</p>}
      {messages === null ? (
        <div className="thread thread--loading" aria-busy="true">
          <span className="spinner" />
        </div>
      ) : (
        <ChatThread
          key={room}
          messages={messages}
          selfUserId={user.id}
          hasMore={hasMore}
          loadingEarlier={loadingEarlier}
          onLoadEarlier={() => void loadEarlier()}
          onSend={send}
          emptyText="No messages in this room yet. Anyone who joins the room will see what you write here."
          placeholder={`Message ${roomTitle(room)}`}
        />
      )}
    </section>
  );
}

export function ChatView({ user, room, openRoom, onJoin }: Props) {
  const { api } = useAuth();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState('');

  const refresh = useCallback(
    () =>
      api
        .chats()
        .then(({ chats }) => setChats(chats))
        .catch(() => setChats((c) => c ?? [])),
    [api],
  );
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [refresh]);

  // Open the most recent chat by default on wide screens.
  useEffect(() => {
    if (!room && chats?.length && window.matchMedia('(min-width: 900px)').matches) openRoom(chats[0].roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats === null]);

  const startNew = (e: FormEvent) => {
    e.preventDefault();
    const id = normalizeRoomId(code);
    if (!id) return;
    setCode('');
    setNewOpen(false);
    openRoom(id);
  };

  const shown = (chats ?? []).filter((c) => !filter || c.roomId.includes(filter.toLowerCase().trim()));
  const summary = chats?.find((c) => c.roomId === room);

  return (
    <>
      <section className="pane" aria-label="Chats" data-has-detail={room ? 'yes' : 'no'}>
        <header className="pane__head">
          <h1>Chat</h1>
          <button className="icon-btn" onClick={() => setNewOpen((o) => !o)} aria-label="New chat" title="Open a room’s chat" data-testid="new-chat">
            <PlusIcon width={20} height={20} />
          </button>
        </header>
        <div className="pane__body">
          {newOpen && (
            <form className="code-form" onSubmit={startNew}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" aria-label="Room code" autoFocus spellCheck={false} />
              <button className="btn btn--primary" type="submit" disabled={!code.trim()} aria-label="Open chat">
                <ArrowRightIcon width={18} height={18} />
              </button>
            </form>
          )}
          {(chats?.length ?? 0) > 5 && (
            <input className="pane__filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rooms" aria-label="Filter rooms" />
          )}
          {chats === null ? (
            <div className="skeleton-list" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          ) : chats.length === 0 ? (
            <p className="pane__empty">Chats from your meetings live here. Join a meeting, or press + and type a room code.</p>
          ) : (
            <ul className="list" data-testid="chat-rooms">
              {shown.map((c) => (
                <li key={c.roomId}>
                  <button className={`list__row${room === c.roomId ? ' is-on' : ''}`} onClick={() => openRoom(c.roomId)}>
                    <RoomBadge roomId={c.roomId} live={c.inCall.length > 0} />
                    <span className="list__main">
                      <strong>{roomTitle(c.roomId)}</strong>
                      <span>
                        {c.lastMessage
                          ? `${c.lastMessage.userId === user.id ? 'You' : c.lastMessage.name.split(' ')[0]}: ${c.lastMessage.text}`
                          : 'No messages yet'}
                      </span>
                    </span>
                    <span className="list__side">
                      <time className="list__when">{shortWhen(c.lastMessage?.ts ?? c.lastActiveAt)}</time>
                      {c.inCall.length > 0 && <span className="pill pill--live">Live</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      {room ? (
        <Conversation user={user} room={room} summary={summary} onJoin={() => onJoin(room)} onSent={() => void refresh()} onBack={() => openRoom('')} />
      ) : (
        <section className="conversation conversation--empty">
          <div className="empty">
            <div className="empty__art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>Pick a chat</h2>
            <p>Every meeting room keeps its chat for 30 days. Catch up before you join, or leave a note for whoever comes next.</p>
          </div>
        </section>
      )}
    </>
  );
}
