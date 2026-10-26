import { normalizeRoomId } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { AuthPage } from './components/AuthPage';
import { CallRoom } from './components/CallRoom';
import { Lobby } from './components/Lobby';
import { useLocalMedia } from './hooks/useLocalMedia';

function roomFromPath(): string {
  const m = location.pathname.match(/^\/r\/([^/]+)/);
  return m ? normalizeRoomId(decodeURIComponent(m[1])) ?? '' : '';
}

export function App() {
  const { status } = useAuth();
  if (status === 'checking') {
    return (
      <div className="splash" aria-busy="true">
        <span className="spinner" />
      </div>
    );
  }
  // An invite link like /r/swift-comet-482 survives sign-in: the room is read
  // from the URL again once the lobby mounts.
  if (status === 'signed-out') return <AuthPage />;
  return <SignedInApp />;
}

/** Camera is only requested after sign-in. */
function SignedInApp() {
  const { user, token, logout } = useAuth();
  const media = useLocalMedia();
  const [call, setCall] = useState<{ roomId: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRoom, setLastRoom] = useState(roomFromPath);

  useEffect(() => {
    if (location.pathname === '/login' || location.pathname === '/register') history.replaceState(null, '', '/');
  }, []);

  // Browser back button leaves the call.
  useEffect(() => {
    const onPop = () => {
      setLastRoom(roomFromPath());
      setCall(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const join = (roomId: string) => {
    if (location.pathname !== `/r/${roomId}`) history.pushState(null, '', `/r/${roomId}`);
    setNotice(null);
    setLastRoom(roomId);
    setCall({ roomId });
  };

  const leave = useCallback(
    (reason?: string, code?: string) => {
      setCall(null);
      if (code === 'unauthorized') logout('Your session expired. Please sign in again.');
      else setNotice(reason ?? 'You left the call.');
    },
    [logout],
  );

  if (!user || !token) return null;
  if (call) return <CallRoom roomId={call.roomId} auth={{ token, name: user.name }} media={media} onLeave={leave} />;
  return <Lobby media={media} user={user} initialRoom={lastRoom} notice={notice} onJoin={join} onSignOut={() => logout()} />;
}
