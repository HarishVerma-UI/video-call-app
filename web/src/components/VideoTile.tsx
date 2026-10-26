import { colorFor, initials, type Participant } from '@vca/shared';
import { useEffect, useRef } from 'react';
import { useSpeaking } from '../hooks/useSpeaking';
import { MicOffIcon, ScreenIcon } from './Icons';

interface Props {
  participant: Participant;
  /** Override the stream shown (e.g. your own screen share preview). */
  displayStream?: MediaStream | null;
  variant?: 'grid' | 'spotlight' | 'strip';
}

export function VideoTile({ participant: p, displayStream, variant = 'grid' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = displayStream !== undefined ? displayStream : p.stream;
  const speaking = useSpeaking(p.stream, p.media.audio);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // Autoplay can be refused if the page has had no interaction yet; joining is a click, so this is rare.
    el.play().catch(() => {});
  }, [stream, stream?.getTracks().length]);

  const showVideo = !!stream && (p.media.video || p.media.screen) && stream.getVideoTracks().length > 0;
  const mirror = p.isLocal && !p.media.screen;
  const connecting = !p.isLocal && p.connection !== 'connected';

  return (
    <div
      className={`tile tile--${variant}${speaking ? ' tile--speaking' : ''}`}
      data-testid={p.isLocal ? 'tile-local' : 'tile-remote'}
      data-peer={p.id}
    >
      {/* The <video> stays mounted even with the camera off: it also plays the person's audio. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={p.isLocal}
        className={`tile__video${mirror ? ' tile__video--mirror' : ''}${p.media.screen ? ' tile__video--contain' : ''}`}
        style={{ opacity: showVideo ? 1 : 0 }}
      />
      {!showVideo && (
        <div className="tile__avatar-wrap">
          <div className="tile__avatar" style={{ background: colorFor(p.id) }}>
            {initials(p.name)}
          </div>
        </div>
      )}
      {connecting && <div className="tile__badge tile__badge--top">Connecting…</div>}
      <div className="tile__name">
        {!p.media.audio && <MicOffIcon width={14} height={14} className="tile__muted" />}
        {p.media.screen && <ScreenIcon width={14} height={14} />}
        <span>{p.isLocal ? `${p.name} (you)` : p.name}</span>
      </div>
    </div>
  );
}
