import { generateRoomId, normalizeRoomId, type AuthUser, type ChatSummary } from '@vca/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { names, roomTitle, shortWhen } from '../format';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { useShutter } from '../theme';
import { Aperture } from './Aperture';
import { CamIcon, CamOffIcon, ChatIcon, MicIcon, MicOffIcon, PlusIcon, SparkIcon, VideoIcon } from './Icons';
import { Avatar, RoomBadge } from './RoomBadge';

interface Props {
  user: AuthUser;
  media: LocalMedia;
  room: string;
  setRoom: (room: string) => void;
  notice: string | null;
  onJoin: (roomId: string) => void;
  openChat: (roomId: string) => void;
}

const PROBLEM_TEXT: Record<string, string> = {
  denied: 'Camera access was blocked. You can still join with audio, or allow access in your browser settings.',
  'no-device': 'No camera found. You can still join with your microphone.',
  insecure: 'Camera and mic need HTTPS (or localhost). Open this page over HTTPS to use them.',
  other: 'Could not start your camera. You can still join and listen.',
};

export function MeetView({ user, media, room, setRoom, notice, onJoin, openChat }: Props) {
  const { api } = useAuth();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [roomPeople, setRoomPeople] = useState<string[] | null>(null);
  const [full, setFull] = useState(false);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shutter = useShutter();

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.stream;
  }, [media.stream]);

  // Rooms you've been in, refreshed so "happening now" stays current.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .chats()
        .then(({ chats }) => !cancelled && setChats(chats))
        .catch(() => !cancelled && setChats((c) => c ?? []));
    void load();
    const t = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [api]);

  // Who's in the selected room right now.
  useEffect(() => {
    setRoomPeople(null);
    setFull(false);
    if (!room) return;
    let cancelled = false;
    api
      .roomInfo(room)
      .then((info) => {
        if (cancelled) return;
        setRoomPeople(info.people ?? []);
        setFull(info.full);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [room, api]);

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const id = normalizeRoomId(code);
    if (!id) {
      setCodeError('Use letters, numbers, - or _ (up to 64 characters).');
      return;
    }
    setCode('');
    setRoom(id);
  };

  const live = (chats ?? []).filter((c) => c.inCall.length > 0);
  const recent = (chats ?? []).filter((c) => c.inCall.length === 0).slice(0, 8);
  const first = user.name.trim().split(/\s+/)[0];
  const lensOpen = shutter ? 0 : !media.ready ? 0.22 : media.videoOn ? 1 : 0;

  return (
    <>
      <section className="pane" aria-label="Meetings">
        <header className="pane__head">
          <h1>Meet</h1>
        </header>
        <div className="pane__body">
          <div className="meet-actions">
            <button className="btn btn--primary btn--wide" onClick={() => onJoin(generateRoomId())} disabled={!media.ready} data-testid="meet-now">
              <VideoIcon width={18} height={18} /> Start a meeting now
            </button>
            <form className="code-form" onSubmit={submitCode}>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(null);
                }}
                placeholder="Enter a meeting code"
                aria-label="Meeting code"
                maxLength={64}
                spellCheck={false}
                autoComplete="off"
                data-testid="code-input"
              />
              <button className="btn btn--secondary" type="submit" disabled={!code.trim()}>
                Open
              </button>
            </form>
            {codeError && <p className="field-error">{codeError}</p>}
          </div>

          {live.length > 0 && (
            <>
              <h2 className="pane__label">
                <span className="live-dot" /> Happening now
              </h2>
              <ul className="list">
                {live.map((c) => (
                  <li key={c.roomId}>
                    <button className={`list__row${room === c.roomId ? ' is-on' : ''}`} onClick={() => setRoom(c.roomId)}>
                      <RoomBadge roomId={c.roomId} live />
                      <span className="list__main">
                        <strong>{roomTitle(c.roomId)}</strong>
                        <span>{names(c.inCall.map((p) => p.name))}</span>
                      </span>
                      <span className="pill pill--live">Live</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="pane__label">Recent rooms</h2>
          {chats === null ? (
            <div className="skeleton-list" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          ) : recent.length === 0 && live.length === 0 ? (
            <p className="pane__empty">Rooms you join show up here, so you can get back to them in one click.</p>
          ) : (
            <ul className="list">
              {recent.map((c) => (
                <li key={c.roomId}>
                  <button className={`list__row${room === c.roomId ? ' is-on' : ''}`} onClick={() => setRoom(c.roomId)}>
                    <RoomBadge roomId={c.roomId} />
                    <span className="list__main">
                      <strong>{roomTitle(c.roomId)}</strong>
                      <span>{c.lastMessage ? `${c.lastMessage.name.split(' ')[0]}: ${c.lastMessage.text}` : c.roomId}</span>
                    </span>
                    <time className="list__when">{shortWhen(c.lastMessage?.ts ?? c.lastActiveAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="stage-pane" aria-label="Get ready to join">
        {notice && <p className="notice" role="status">{notice}</p>}

        <div className="prejoin">
          <div className="prejoin__intro">
            <p className="eyebrow">{room ? 'Joining' : 'Ready when you are'}</p>
            <h2 className="prejoin__title">{room ? roomTitle(room) : `Hi ${first}, start or join a meeting.`}</h2>
            <p className="prejoin__sub" aria-live="polite">
              {!room
                ? 'Your camera preview is below. Start a new meeting, or pick one of your rooms.'
                : full
                  ? 'This meeting is full.'
                  : roomPeople && roomPeople.length > 0
                    ? `${names(roomPeople)} ${roomPeople.length === 1 ? 'is' : 'are'} in this meeting.`
                    : 'No one is here yet. You’ll be the first.'}
            </p>
          </div>

          <div className="preview-card">
            <div className="preview-card__video">
              <video ref={videoRef} autoPlay playsInline muted className={`preview-card__feed${media.videoOn ? '' : ' is-hidden'}`} />
              {!media.videoOn && (
                <div className="preview-card__off">
                  <Aperture open={lensOpen} className="preview-card__iris" />
                  <Avatar id={user.id} name={user.name} size={84} />
                  <span>{media.hasVideo ? 'Your camera is off' : 'No camera found'}</span>
                </div>
              )}
              <span className="preview-card__name">{user.name}</span>
            </div>
            <div className="preview-card__bar">
              <button
                type="button"
                className={`toggle${media.videoOn ? ' is-on' : ''}`}
                onClick={() => media.setVideoOn(!media.videoOn)}
                disabled={!media.hasVideo}
                aria-pressed={media.videoOn}
                aria-label={media.videoOn ? 'Turn camera off' : 'Turn camera on'}
              >
                {media.videoOn ? <CamIcon width={18} height={18} /> : <CamOffIcon width={18} height={18} />}
                <span className="toggle__track">
                  <i />
                </span>
              </button>
              <button
                type="button"
                className={`toggle${media.audioOn ? ' is-on' : ''}`}
                onClick={() => media.setAudioOn(!media.audioOn)}
                disabled={!media.hasAudio}
                aria-pressed={media.audioOn}
                aria-label={media.audioOn ? 'Turn microphone off' : 'Turn microphone on'}
              >
                {media.audioOn ? <MicIcon width={18} height={18} /> : <MicOffIcon width={18} height={18} />}
                <span className="toggle__track">
                  <i />
                </span>
              </button>
              <span className="preview-card__hint">{!media.ready ? 'Starting your camera…' : media.videoOn ? 'Looking good.' : 'People will see your initials.'}</span>
            </div>
          </div>

          {media.problem && (
            <p className="alert">
              {PROBLEM_TEXT[media.problem]}{' '}
              {media.problem !== 'insecure' && (
                <button className="link-btn" onClick={media.retry}>
                  Try again
                </button>
              )}
            </p>
          )}

          <div className="prejoin__actions">
            {room ? (
              <>
                <button className="btn btn--primary btn--big" onClick={() => onJoin(room)} disabled={!media.ready || full} data-testid="join-now">
                  Join now
                </button>
                <button className="btn btn--secondary btn--big" onClick={() => openChat(room)}>
                  <ChatIcon width={18} height={18} /> Open chat
                </button>
                <button className="link-btn" onClick={() => setRoom('')}>
                  Not this room
                </button>
              </>
            ) : (
              <>
                <button className="btn btn--primary btn--big" onClick={() => onJoin(generateRoomId())} disabled={!media.ready} data-testid="start-now">
                  <PlusIcon width={18} height={18} /> New meeting
                </button>
                <button className="btn btn--secondary btn--big" onClick={() => setRoom(generateRoomId())} title="Make a room code to share before you join">
                  <SparkIcon width={18} height={18} /> Get a code to share
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
