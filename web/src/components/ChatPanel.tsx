import type { ChatMessage } from '@vca/shared';
import { ChatThread } from './ChatThread';
import { CloseIcon } from './Icons';

interface Props {
  messages: ChatMessage[];
  selfUserId: string;
  historyCount: number;
  hasMore: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  onSend: (text: string) => void;
  onClose: () => void;
}

/** The meeting chat, as a side panel in a call. */
export function ChatPanel({ onClose, ...thread }: Props) {
  return (
    <aside className="side-panel" aria-label="Meeting chat" data-testid="chat-panel">
      <header className="side-panel__head">
        <h2>Meeting chat</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close chat">
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <ChatThread {...thread} emptyText="Messages are saved in this room, so people who join later can catch up." placeholder="Type a message" />
    </aside>
  );
}
