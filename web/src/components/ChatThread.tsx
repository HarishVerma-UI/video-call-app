import type { ChatMessage } from '@vca/shared';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from './RoomBadge';
import { SendIcon } from './Icons';

interface Props {
  messages: ChatMessage[];
  /** Your account id: messages from any of your devices count as yours. */
  selfUserId: string;
  /** In a call: messages before this index were sent before you joined. */
  historyCount?: number;
  hasMore: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  onSend: (text: string) => void | Promise<void>;
  emptyText?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = (ts: number) => new Date(ts).toDateString();
const dayLabel = (ts: number) => {
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() - 86400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
};

/** Teams-style conversation: others on the left with avatars, you on the right. */
export function ChatThread({
  messages,
  selfUserId,
  historyCount = 0,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  onSend,
  emptyText = 'No messages yet. Say hello.',
  placeholder = 'Type a message',
  autoFocus = true,
}: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstId = messages[0]?.id;
  const lastId = messages[messages.length - 1]?.id;
  const prevFirst = useRef(firstId);
  const prevHeight = useRef(0);

  // New message at the bottom: scroll down. Older ones added at the top: keep your place.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevFirst.current !== firstId && prevFirst.current !== undefined && prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    }
    prevFirst.current = firstId;
    prevHeight.current = el.scrollHeight;
  }, [firstId]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    if (el) prevHeight.current = el.scrollHeight;
  }, [lastId]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    void onSend(text.trim());
    setText('');
  };

  return (
    <div className="thread">
      <div className="thread__list" ref={listRef} data-testid="chat-list">
        {hasMore && (
          <button className="thread__earlier" onClick={onLoadEarlier} disabled={loadingEarlier} data-testid="chat-earlier">
            {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}
        {messages.length === 0 && <p className="thread__empty">{emptyText}</p>}
        {messages.map((m, i) => {
          const mine = m.userId === selfUserId;
          const prev = messages[i - 1];
          const newDay = !prev || day(prev.ts) !== day(m.ts);
          const joinedHere = historyCount > 0 && i === historyCount;
          const grouped = !!prev && !newDay && !joinedHere && prev.userId === m.userId && m.ts - prev.ts < 5 * 60_000;
          return (
            <div key={m.id} className="msg-row">
              {newDay && (
                <div className="thread__divider">
                  <span>{dayLabel(m.ts)}</span>
                </div>
              )}
              {joinedHere && (
                <div className="thread__divider thread__divider--joined">
                  <span>You joined</span>
                </div>
              )}
              <div className={`msg${mine ? ' msg--mine' : ''}${grouped ? ' msg--grouped' : ''}`}>
                {!mine && <div className="msg__avatar">{!grouped && <Avatar id={m.userId} name={m.name} size={30} />}</div>}
                <div className="msg__body">
                  {!grouped && (
                    <div className="msg__meta">
                      {!mine && <strong>{m.name}</strong>}
                      <span>{time(m.ts)}</span>
                    </div>
                  )}
                  <div className="msg__bubble">{m.text}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          maxLength={1000}
          aria-label="Message"
        />
        <button className="composer__send" type="submit" disabled={!text.trim()} aria-label="Send">
          <SendIcon width={18} height={18} />
        </button>
      </form>
    </div>
  );
}
