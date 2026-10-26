import type { Participant } from '@vca/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { roomUrl } from '../config';
import { useCall } from '../hooks/useCall';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { ChatPanel } from './ChatPanel';
import { CamIcon, CamOffIcon, ChatIcon, LinkIcon, MicIcon, MicOffIcon, PhoneOffIcon, ScreenIcon } from './Icons';
import { VideoTile } from './VideoTile';

interface Props {
  roomId: string;
  auth: { token: string; name: string };
  media: LocalMedia;
  onLeave: (reason?: string, code?: string) => void;
}

// Phones' browsers generally can't share their screen.
const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

const STATUS_TEXT: Record<string, string> = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  error: 'Disconnected',
};

function useElapsed(running: boolean) {
  const [start] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const s = Math.floor((Date.now() - start) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.slice(-2)}:${ss}` : `${mm}:${ss}`;
}

export function CallRoom({ roomId, auth, media, onLeave }: Props) {
  const { client, participants, status, messages, error, clearError } = useCall(roomId, auth, media.stream);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const elapsed = useElapsed(status === 'joined');
  const seenMessages = useRef(0);

  const local = participants.find((p) => p.isLocal);
  const selfId = local?.id ?? '';
  const audioOn = local?.media.audio ?? media.audioOn;
  const videoOn = local?.media.video ?? media.videoOn;

  // Unread badge for chat.
  useEffect(() => {
    if (chatOpen) {
      seenMessages.current = messages.length;
      setUnread(0);
    } else {
      setUnread(messages.length - seenMessages.current);
    }
  }, [messages.length, chatOpen]);

  // Fatal errors (room full / server gone) send you back to the lobby.
  useEffect(() => {
    if (!error) return;
    if (error.code === 'room-full' || error.code === 'unauthorized' || (error.code === 'signaling' && status === 'error')) {
      onLeave(error.message, error.code);
    } else {
      setToast(error.message);
      clearError();
    }
  }, [error, status, onLeave, clearError]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleAudio = () => {
    media.setAudioOn(!audioOn);
    client.current?.setAudioEnabled(!audioOn);
  };
  const toggleVideo = () => {
    media.setVideoOn(!videoOn);
    client.current?.setVideoEnabled(!videoOn);
  };

  const stopShare = async (s: MediaStream | null = screenStream) => {
    s?.getTracks().forEach((t) => t.stop());
    setScreenStream(null);
    await client.current?.replaceVideoTrack(media.stream?.getVideoTracks()[0] ?? null, { screen: false });
  };

  const toggleShare = async () => {
    if (screenStream) return stopShare();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setToast('Screen sharing is not supported in this browser.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const track = s.getVideoTracks()[0];
      track.addEventListener('ended', () => void stopShare(s)); // browser's own "Stop sharing" button
      setScreenStream(s);
      await client.current?.replaceVideoTrack(track, { screen: true });
    } catch {
      /* user cancelled the picker */
    }
  };

  // Stop sharing if we leave mid-share.
  useEffect(() => () => screenStream?.getTracks().forEach((t) => t.stop()), [screenStream]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(roomId));
      setToast('Invite link copied');
    } catch {
      setToast(roomUrl(roomId));
    }
  };

  const leave = () => {
    screenStream?.getTracks().forEach((t) => t.stop());
    onLeave();
  };

  const sharer = useMemo(() => participants.find((p) => p.media.screen), [participants]);
  const displayFor = (p: Participant) => (p.isLocal && screenStream ? screenStream : undefined);
  const count = participants.length;

  return (
    <div className={`room${chatOpen ? ' room--chat' : ''}`}>
      <header className="room__top">
        <div className="room__title">
          <span className={`dot dot--${status}`} />
          <span className="room__code">{roomId}</span>
          <span className="room__meta">
            {STATUS_TEXT[status] ?? `${elapsed} · ${count} ${count === 1 ? 'person' : 'people'}`}
          </span>
        </div>
        <button className="ghost-btn" onClick={copyInvite}>
          <LinkIcon width={18} height={18} /> Invite
        </button>
      </header>

      <main className="stage">
        {sharer ? (
          <div className="spotlight">
            <div className="spotlight__main">
              <VideoTile participant={sharer} displayStream={displayFor(sharer)} variant="spotlight" />
            </div>
            <div className="spotlight__strip">
              {participants
                .filter((p) => p.id !== sharer.id)
                .map((p) => (
                  <VideoTile key={p.id} participant={p} displayStream={displayFor(p)} variant="strip" />
                ))}
            </div>
          </div>
        ) : (
          <div className={`grid grid--${Math.min(count, 6)}`} data-testid="grid">
            {participants.map((p) => (
              <VideoTile key={p.id} participant={p} displayStream={displayFor(p)} />
            ))}
          </div>
        )}
        {count === 1 && status === 'joined' && (
          <div className="waiting">
            <p>You're the only one here.</p>
            <button className="primary-btn primary-btn--small" onClick={copyInvite}>
              <LinkIcon width={16} height={16} /> Copy invite link
            </button>
          </div>
        )}
      </main>

      {chatOpen && (
        <ChatPanel
          messages={messages}
          selfId={selfId}
          onSend={(t) => client.current?.sendChat(t)}
          onClose={() => setChatOpen(false)}
        />
      )}

      <nav className="dock" aria-label="Call controls">
        <button
          className={`dock-btn${audioOn ? '' : ' dock-btn--off'}`}
          onClick={toggleAudio}
          disabled={!media.hasAudio}
          aria-pressed={!audioOn}
          data-testid="btn-mic"
          title={audioOn ? 'Mute' : 'Unmute'}
        >
          {audioOn ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          className={`dock-btn${videoOn ? '' : ' dock-btn--off'}`}
          onClick={toggleVideo}
          disabled={!media.hasVideo}
          aria-pressed={!videoOn}
          data-testid="btn-cam"
          title={videoOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {videoOn ? <CamIcon /> : <CamOffIcon />}
        </button>
        {canShareScreen && (
          <button
            className={`dock-btn${screenStream ? ' dock-btn--active' : ''}`}
            onClick={toggleShare}
            disabled={!!sharer && !sharer.isLocal}
            title={screenStream ? 'Stop sharing' : 'Share your screen'}
          >
            <ScreenIcon />
          </button>
        )}
        <button
          className={`dock-btn${chatOpen ? ' dock-btn--active' : ''}`}
          onClick={() => setChatOpen((o) => !o)}
          data-testid="btn-chat"
          title="Chat"
        >
          <ChatIcon />
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button className="dock-btn dock-btn--end" onClick={leave} title="Leave call" data-testid="btn-leave">
          <PhoneOffIcon />
        </button>
      </nav>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
