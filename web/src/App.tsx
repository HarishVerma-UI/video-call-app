import { generateRoomId } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { CallingContext, IncomingCallModal } from './calling';
import { AuthPage } from './components/AuthPage';
import { CallRoom } from './components/CallRoom';
import { Shell, useRoute } from './components/Shell';
import { useLocalMedia } from './hooks/useLocalMedia';
import { PresenceProvider, usePresence, type PresenceMessage } from './presence';

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
  return (
    <PresenceProvider>
      <SignedInApp />
    </PresenceProvider>
  );
}

/** Camera is only requested after sign-in. */
function SignedInApp() {
  const { user, token, logout, api } = useAuth();
  const presence = usePresence();
  const [route, go] = useRoute();
  const [call, setCall] = useState<{ roomId: string } | null>(null);
  // Only request camera/mic on the Meet or call screens — never on sign-in or the feed.
  const media = useLocalMedia(route.view === 'meet' || call !== null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{ from: string; fromName: string; roomId: string } | null>(null);
  const [callToast, setCallToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setCallToast(msg);
    window.setTimeout(() => setCallToast((m) => (m === msg ? null : m)), 4000);
  }, []);

  useEffect(() => {
    if (location.pathname === '/login' || location.pathname === '/register') go({ view: 'feed' }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser Back during a call leaves it.
  useEffect(() => {
    const onPop = () => setCall(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const join = useCallback((roomId: string) => {
    go({ view: 'meet', room: roomId });
    setNotice(null);
    setCall({ roomId });
  }, [go]);

  // Start a 1:1 call: ring the person (live), drop a call message + notification
  // in case they missed the ring, then enter the room to wait for them.
  const callUser = useCallback((userId: string, name: string) => {
    const roomId = generateRoomId();
    presence.send({ type: 'invite', to: userId, roomId });
    void api.startCall(userId, roomId).catch(() => {});
    flash(`Calling ${name || 'them'}…`);
    join(roomId);
  }, [presence, api, join, flash]);

  // Live call signalling over the presence channel.
  useEffect(() => {
    const subs = [
      presence.subscribe('incoming-call', (m: PresenceMessage) =>
        setIncoming({ from: String(m.from), fromName: String(m.fromName ?? ''), roomId: String(m.roomId) }),
      ),
      presence.subscribe('call-cancelled', (m: PresenceMessage) =>
        setIncoming((cur) => (cur && cur.roomId === m.roomId ? null : cur)),
      ),
      presence.subscribe('call-declined', (m: PresenceMessage) => flash(`${String(m.fromName || 'They')} declined the call`)),
      presence.subscribe('invite-status', (m: PresenceMessage) => {
        if (m.delivered === false) flash('They are offline right now.');
      }),
    ];
    return () => subs.forEach((u) => u());
  }, [presence, flash]);

  // Ring tone + auto-dismiss while a call is incoming.
  useEffect(() => {
    if (!incoming) return;
    const AC = window.AudioContext;
    let ctx: AudioContext | null = null;
    let beeper: number | undefined;
    if (AC) {
      try {
        ctx = new AC();
        const beep = () => {
          if (!ctx) return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 480;
          osc.connect(gain);
          gain.connect(ctx.destination);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
          osc.start();
          osc.stop(ctx.currentTime + 0.6);
        };
        beep();
        beeper = window.setInterval(beep, 2500);
      } catch {
        /* audio blocked until a user gesture — show the prompt silently */
      }
    }
    const missed = window.setTimeout(() => setIncoming(null), 35000);
    return () => {
      if (beeper) clearInterval(beeper);
      clearTimeout(missed);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [incoming]);

  const acceptIncoming = useCallback(() => {
    setIncoming((cur) => {
      if (cur) join(cur.roomId);
      return null;
    });
  }, [join]);
  const declineIncoming = useCallback(() => {
    setIncoming((cur) => {
      if (cur) presence.send({ type: 'invite-decline', to: cur.from, roomId: cur.roomId });
      return null;
    });
  }, [presence]);

  const leave = useCallback(
    (reason?: string, code?: string) => {
      setCall(null);
      if (code === 'unauthorized') logout('Your session expired. Please sign in again.');
      else setNotice(reason ?? 'You left the meeting.');
    },
    [logout],
  );

  if (!user || !token) return null;
  const content = call ? (
    media.ready ? (
      <CallRoom roomId={call.roomId} auth={{ token, name: user.name, userId: user.id }} media={media} onLeave={leave} />
    ) : (
      <div className="call-preparing" role="status">
        <div className="call-preparing__spinner" aria-hidden="true" />
        <p>Setting up your camera and mic…</p>
        <small>Allow access when your browser asks.</small>
      </div>
    )
  ) : (
    <Shell user={user} media={media} route={route} go={go} notice={notice} onJoin={join} />
  );
  return (
    <CallingContext.Provider value={{ callUser, joinRoom: join }}>
      {content}
      {callToast && <div className="call-toast" role="status">{callToast}</div>}
      {incoming && <IncomingCallModal fromName={incoming.fromName} fromId={incoming.from} onAccept={acceptIncoming} onDecline={declineIncoming} />}
    </CallingContext.Provider>
  );
}
