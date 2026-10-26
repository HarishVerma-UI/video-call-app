import { colorFor, type ChatMessage } from '@vca/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CloseIcon, SendIcon } from './Icons';

interface Props {
  messages: ChatMessage[];
  selfId: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ messages, selfId, onSend, onClose }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);
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
        {messages.length === 0 && <p className="chat__empty">Messages are only visible to people in this call.</p>}
        {messages.map((m, i) => {
          const mine = m.from === selfId;
          const grouped = i > 0 && messages[i - 1].from === m.from && m.ts - messages[i - 1].ts < 60_000;
          return (
            <div key={m.id} className={`msg${mine ? ' msg--mine' : ''}${grouped ? ' msg--grouped' : ''}`}>
              {!grouped && (
                <div className="msg__meta">
                  <span className="msg__dot" style={{ background: colorFor(m.from) }} />
                  <strong>{mine ? 'You' : m.name}</strong>
                  <span>{time(m.ts)}</span>
                </div>
              )}
              <div className="msg__bubble">{m.text}</div>
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
