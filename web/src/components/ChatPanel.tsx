import { colorFor, type ChatMessage } from '@vca/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CloseIcon, SendIcon } from './Icons';

interface Props {
  messages: ChatMessage[];
  /** Your account id: messages from any of your devices count as yours. */
  selfUserId: string;
  /** Messages before this index were sent before you joined. */
  historyCount: number;
  hasMore: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  onSend: (text: string) => void;
  onClose: () => void;
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const day = (ts: number) => new Date(ts).toDateString();
const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
};

export function ChatPanel({ messages, selfUserId, historyCount, hasMore, loadingEarlier, onLoadEarlier, onSend, onClose }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stick to the newest message, except when older ones were just added at the top.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [lastId]);
  useEffect(() => inputRef.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <aside className="chat" aria-label="Chat">
      <header className="chat__head">
        <h2>Chat</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close chat">
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <div className="chat__list" ref={listRef} data-testid="chat-list">
        {hasMore && (
          <button className="chat__earlier" onClick={onLoadEarlier} disabled={loadingEarlier} data-testid="chat-earlier">
            {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}
        {messages.length === 0 && (
          <p className="chat__empty">Say hello. Messages are saved in this room, so people who join later can catch up.</p>
        )}
        {messages.map((m, i) => {
          const mine = m.userId === selfUserId;
          const prev = messages[i - 1];
          const newDay = !prev || day(prev.ts) !== day(m.ts);
          const joinedHere = i === historyCount && historyCount > 0;
          const grouped = !!prev && !newDay && !joinedHere && prev.userId === m.userId && m.ts - prev.ts < 60_000;
          return (
            <div key={m.id} className="msg-row">
              {newDay && <div className="chat__divider">{dayLabel(m.ts)}</div>}
              {joinedHere && <div className="chat__divider chat__divider--joined">You joined</div>}
            <div className={`msg${mine ? ' msg--mine' : ''}${grouped ? ' msg--grouped' : ''}`}>
              {!grouped && (
                <div className="msg__meta">
                  <span className="msg__dot" style={{ background: colorFor(m.userId) }} />
                  <strong>{mine ? 'You' : m.name}</strong>
                  <span>{time(m.ts)}</span>
                </div>
              )}
              <div className="msg__bubble">{m.text}</div>
            </div>
            </div>
          );
        })}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message…"
          maxLength={1000}
          aria-label="Message"
        />
        <button className="chat__send" type="submit" disabled={!text.trim()} aria-label="Send">
          <SendIcon width={18} height={18} />
        </button>
      </form>
    </aside>
  );
}
