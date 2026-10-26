import { normalizeRoomId } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { CallRoom } from './components/CallRoom';
import { Lobby } from './components/Lobby';
import { useLocalMedia } from './hooks/useLocalMedia';

const NAME_KEY = 'huddle:name';

function roomFromPath(): string {
  const m = location.pathname.match(/^\/r\/([^/]+)/);
  return m ? normalizeRoomId(decodeURIComponent(m[1])) ?? '' : '';
}
function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function App() {
  const media = useLocalMedia();
  const [call, setCall] = useState<{ roomId: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRoom, setLastRoom] = useState(roomFromPath);

  // Browser back button leaves the call.
  useEffect(() => {
    const onPop = () => {
      setLastRoom(roomFromPath());
      setCall(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const join = (roomId: string, name: string) => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* private mode */
    }
    if (location.pathname !== `/r/${roomId}`) history.pushState(null, '', `/r/${roomId}`);
    setNotice(null);
    setLastRoom(roomId);
    setCall({ roomId, name });
  };

  const leave = useCallback((reason?: string) => {
    setCall(null);
    setNotice(reason ?? 'You left the call.');
  }, []);

  if (call) return <CallRoom roomId={call.roomId} name={call.name} media={media} onLeave={leave} />;
  return <Lobby media={media} initialRoom={lastRoom} initialName={readName()} notice={notice} onJoin={join} />;
}
