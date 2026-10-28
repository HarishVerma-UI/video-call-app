import type { Participant } from '@vca/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { roomUrl } from '../config';
import { roomTitle } from '../format';
import { useCall } from '../hooks/useCall';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { Aperture } from './Aperture';
import { ChatPanel } from './ChatPanel';
import { CamIcon, CamOffIcon, ChatIcon, CloseIcon, LinkIcon, MicIcon, MicOffIcon, PeopleIcon, PhoneOffIcon, ScreenIcon } from './Icons';
import { ModeToggle } from './ModeToggle';
import { Avatar } from './RoomBadge';
import { VideoTile } from './VideoTile';

interface Props {
  roomId: string;
  auth: { token: string; name: string; userId: string };
  media: LocalMedia;
  onLeave: (reason?: string, code?: string) => void;
}

// Phones' browsers generally can't share their screen.
const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

function useElapsed(running: boolean) {
  const [start] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const s = Math.floor((Date.now() - start) / 1000);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Panel = 'chat' | 'people' | null;

/** A labelled button in the meeting bar (Teams style: icon over a small label). */
function BarButton(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  off?: boolean;
  disabled?: boolean;
  badge?: number;
  testId?: string;
  title?: string;
  pressed?: boolean;
}) {
  return (
    <button
      className={`bar-btn${props.active ? ' bar-btn--active' : ''}${props.off ? ' bar-btn--off' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.pressed}
      data-testid={props.testId}
      title={props.title ?? props.label}
    >
      <span className="bar-btn__icon">
        {props.icon}
        {!!props.badge && <span className="badge">{props.badge > 9 ? '9+' : props.badge}</span>}
      </span>
      <span className="bar-btn__label">{props.label}</span>
    </button>
  );
}

function PeoplePanel({ participants, roomId, onClose, onCopy }: { participants: Participant[]; roomId: string; onClose: () => void; onCopy: () => void }) {
  return (
    <aside className="side-panel" aria-label="People" data-testid="people-panel">
      <header className="side-panel__head">
        <h2>People</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close people">
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <div className="invite-box">
        <p>Share this link to invite people</p>
        <div className="invite-box__row">
          <code>{roomUrl(roomId).replace(/^https?:\/\//, '')}</code>
          <button className="btn btn--secondary btn--small" onClick={onCopy}>
            <LinkIcon width={16} height={16} /> Copy
          </button>
        </div>
      </div>
      <h3 className="side-panel__sub">In this meeting ({participants.length})</h3>
      <ul className="people">
        {participants.map((p) => (
          <li key={p.id} className="people__row">
            <Avatar id={p.userId || p.id} name={p.name} size={32} />
            <span className="people__name">
              {p.name}
              {p.isLocal && <em> (you)</em>}
              {!p.isLocal && p.connection !== 'connected' && <small>Connecting…</small>}
            </span>
            <span className="people__state">
              {p.media.screen && <ScreenIcon width={16} height={16} aria-label="Sharing screen" />}
              {p.media.video ? <CamIcon width={16} height={16} /> : <CamOffIcon width={16} height={16} className="dim" />}
              {p.media.audio ? <MicIcon width={16} height={16} /> : <MicOffIcon width={16} height={16} className="dim" />}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function CallRoom({ roomId, auth, media, onLeave }: Props) {
  const { client, participants, status, messages, historyCount, hasMore, loadingEarlier, loadEarlier, error, clearError } = useCall(
    roomId,
    auth,
    media.stream,
  );
  const { user } = useAuth();
  const [panel, setPanel] = useState<Panel>(null);
  const [unread, setUnread] = useState(0);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const elapsed = useElapsed(status === 'joined');
  const seenMessages = useRef(0);
  const chatOpen = panel === 'chat';

  const local = participants.find((p) => p.isLocal);
  const audioOn = local?.media.audio ?? media.audioOn;
  const videoOn = local?.media.video ?? media.videoOn;

  // Unread badge: only messages that arrive after you joined, from other people.
  const liveFromOthers = messages.slice(historyCount).filter((m) => m.userId !== user?.id).length;
  useEffect(() => {
    if (chatOpen) {
      seenMessages.current = liveFromOthers;
      setUnread(0);
    } else {
      setUnread(Math.max(0, liveFromOthers - seenMessages.current));
    }
  }, [liveFromOthers, chatOpen]);

  // Fatal errors (room full / server gone) send you back.
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
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  return (
    <div className={`meeting${panel ? ' meeting--panel' : ''}`}>
      <header className="meeting__bar">
        <div className="meeting__title">
          <Aperture open={status === 'joined' ? 0.55 : 0.15} className="mark mark--small" />
          <div>
            <strong>{roomTitle(roomId)}</strong>
            <span className="meeting__meta">
              <span className={`dot dot--${status}`} />
              {status === 'joined' ? elapsed : status === 'reconnecting' ? 'Reconnecting…' : status === 'error' ? 'Disconnected' : 'Connecting…'}
            </span>
          </div>
        </div>

        <nav className="meeting__controls" aria-label="Meeting controls">
          <BarButton icon={<ChatIcon />} label="Chat" onClick={() => togglePanel('chat')} active={chatOpen} badge={unread} testId="btn-chat" />
          <BarButton icon={<PeopleIcon />} label="People" onClick={() => togglePanel('people')} active={panel === 'people'} badge={0} testId="btn-people" />
          <span className="meeting__sep" />
          <BarButton
            icon={videoOn ? <CamIcon /> : <CamOffIcon />}
            label="Camera"
            onClick={toggleVideo}
            off={!videoOn}
            disabled={!media.hasVideo}
            pressed={!videoOn}
            testId="btn-cam"
            title={videoOn ? 'Turn camera off' : 'Turn camera on'}
          />
          <BarButton
            icon={audioOn ? <MicIcon /> : <MicOffIcon />}
            label="Mic"
            onClick={toggleAudio}
            off={!audioOn}
            disabled={!media.hasAudio}
            pressed={!audioOn}
            testId="btn-mic"
            title={audioOn ? 'Mute' : 'Unmute'}
          />
          {canShareScreen && (
            <BarButton
              icon={<ScreenIcon />}
              label={screenStream ? 'Stop' : 'Share'}
              onClick={() => void toggleShare()}
              active={!!screenStream}
              disabled={!!sharer && !sharer.isLocal}
              title={screenStream ? 'Stop sharing' : 'Share your screen'}
            />
          )}
          <ModeToggle className="meeting__mode" />
          <button className="leave-btn" onClick={leave} data-testid="btn-leave" title="Leave the meeting">
            <PhoneOffIcon width={20} height={20} />
            <span>Leave</span>
          </button>
        </nav>
      </header>

      <main className="meeting__stage">
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
          <div className="waiting" data-testid="waiting">
            <p>
              <strong>You’re the only one here.</strong>
              <span>Invite people with the meeting link.</span>
            </p>
            <button className="btn btn--primary btn--small" onClick={copyInvite}>
              <LinkIcon width={16} height={16} /> Copy meeting link
            </button>
          </div>
        )}
      </main>

      {panel === 'chat' && (
        <ChatPanel
          messages={messages}
          selfUserId={user?.id ?? ''}
          historyCount={historyCount}
          hasMore={hasMore}
          loadingEarlier={loadingEarlier}
          onLoadEarlier={() => void loadEarlier()}
          onSend={(t) => client.current?.sendChat(t)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'people' && <PeoplePanel participants={participants} roomId={roomId} onClose={() => setPanel(null)} onCopy={copyInvite} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
