import { colorFor, generateRoomId, initials, normalizeRoomId, type AuthUser } from '@vca/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon, SparkIcon } from './Icons';

interface Props {
  media: LocalMedia;
  user: AuthUser;
  initialRoom: string;
  notice?: string | null;
  onJoin: (roomId: string) => void;
  onSignOut: () => void;
}

const PROBLEM_TEXT: Record<string, string> = {
  denied: 'Camera access was blocked. You can still join with audio, or allow access in your browser settings.',
  'no-device': 'No camera found. You can still join with your microphone.',
  insecure: 'Camera and mic need HTTPS (or localhost). Open this page over HTTPS to use them.',
  other: 'Could not start your camera. You can still join and listen.',
};

export function Lobby({ media, user, initialRoom, notice, onJoin, onSignOut }: Props) {
  const { api } = useAuth();
  const [room, setRoom] = useState(initialRoom);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.stream;
  }, [media.stream]);

  // Show who's already in the room before joining.
  useEffect(() => {
    const id = normalizeRoomId(room);
    setRoomInfo(null);
    if (!id) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .roomInfo(id)
        .then((info) => {
          if (cancelled) return;
          if (info.full) setRoomInfo(`This room is full (${info.participants}/${info.maxPeers}).`);
          else if (info.participants > 0)
            setRoomInfo(`${info.participants} ${info.participants === 1 ? 'person is' : 'people are'} in this room.`);
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      cancelled = true;
    };
  }, [room, api]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = normalizeRoomId(room || generateRoomId());
    if (!id) {
      setRoomError('Use letters, numbers, - or _ (up to 64 characters).');
      return;
    }
    onJoin(id);
  };

  return (
    <div className="lobby-wrap">
    <main className="lobby">
      <header className="lobby__top">
        <div className="logo">
          <span className="logo__mark" />
          Huddle
        </div>
        <div className="account">
          <span className="account__avatar" style={{ background: colorFor(user.id) }}>
            {initials(user.name)}
          </span>
          <span className="account__text">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </span>
          <button className="ghost-btn" onClick={onSignOut} data-testid="sign-out">
            Sign out
          </button>
        </div>
      </header>
      <section className="lobby__brand">
        <h1>
          Face-to-face,
          <br />
          <span className="grad">from anywhere.</span>
        </h1>
        <p className="lobby__lede">
          Private group video calls for up to 6 people. Nothing to install — share a room code and you're in.
        </p>
        <ul className="lobby__points">
          <li>Peer-to-peer, encrypted media</li>
          <li>Screen sharing &amp; live chat</li>
          <li>Works on web, Android &amp; iOS</li>
        </ul>
      </section>

      <section className="lobby__card">
        <div className="preview">
          <video ref={videoRef} autoPlay playsInline muted className="preview__video" style={{ opacity: media.videoOn ? 1 : 0 }} />
          {!media.videoOn && (
            <div className="preview__off">{media.ready ? (media.hasVideo ? 'Camera is off' : 'No camera') : 'Starting camera…'}</div>
          )}
          <div className="preview__controls">
            <button
              type="button"
              className={`round-btn${media.audioOn ? '' : ' round-btn--off'}`}
              onClick={() => media.setAudioOn(!media.audioOn)}
              disabled={!media.hasAudio}
              aria-label={media.audioOn ? 'Turn microphone off' : 'Turn microphone on'}
            >
              {media.audioOn ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button
              type="button"
              className={`round-btn${media.videoOn ? '' : ' round-btn--off'}`}
              onClick={() => media.setVideoOn(!media.videoOn)}
              disabled={!media.hasVideo}
              aria-label={media.videoOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {media.videoOn ? <CamIcon /> : <CamOffIcon />}
            </button>
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
        {notice && <p className="notice">{notice}</p>}

        <form className="join-form" onSubmit={submit}>
          <p className="signed-as">
            Joining as <strong>{user.name}</strong>
          </p>
          <label>
            Room code
            <div className="input-row">
              <input
                value={room}
                onChange={(e) => {
                  setRoom(e.target.value);
                  setRoomError(null);
                }}
                placeholder="Leave empty for a new room"
                maxLength={64}
                spellCheck={false}
              />
              <button type="button" className="ghost-btn" onClick={() => setRoom(generateRoomId())} title="Generate a room code">
                <SparkIcon width={18} height={18} />
                New
              </button>
            </div>
          </label>
          {roomError && <p className="field-error">{roomError}</p>}
          {roomInfo && <p className="field-hint">{roomInfo}</p>}
          <button className="primary-btn" type="submit" disabled={!media.ready}>
            {room ? 'Join call' : 'Start a new call'}
          </button>
        </form>
      </section>
    </main>
    </div>
  );
}
