import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { AuthPage } from './components/AuthPage';
import { CallRoom } from './components/CallRoom';
import { Shell, useRoute } from './components/Shell';
import { useLocalMedia } from './hooks/useLocalMedia';

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
  // from the URL again once you're signed in.
  if (status === 'signed-out') return <AuthPage />;
  return <SignedInApp />;
}

/** Camera is only requested after sign-in. */
function SignedInApp() {
  const { user, token, logout } = useAuth();
  const media = useLocalMedia();
  const [route, go] = useRoute();
  const [call, setCall] = useState<{ roomId: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname === '/login' || location.pathname === '/register') go({ view: 'meet', room: '' }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser Back during a call leaves it.
  useEffect(() => {
    const onPop = () => setCall(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const join = (roomId: string) => {
    go({ view: 'meet', room: roomId });
    setNotice(null);
    setCall({ roomId });
  };

  const leave = useCallback(
    (reason?: string, code?: string) => {
      setCall(null);
      if (code === 'unauthorized') logout('Your session expired. Please sign in again.');
      else setNotice(reason ?? 'You left the meeting.');
    },
    [logout],
  );

  if (!user || !token) return null;
  if (call) return <CallRoom roomId={call.roomId} auth={{ token, name: user.name, userId: user.id }} media={media} onLeave={leave} />;
  return <Shell user={user} media={media} route={route} go={go} notice={notice} onJoin={join} />;
}
