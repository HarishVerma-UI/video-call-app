import { generateRoomId } from '@vca/shared';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth';
import { CallingContext, IncomingCall } from './src/calling';
import { AppHeader } from './src/components/AppHeader';
import { TabBar, type TabId } from './src/components/TabBar';
import { fonts, theme } from './src/config';
import { PresenceProvider, usePresence, type PresenceMessage } from './src/presence';
import { AuthScreen } from './src/screens/AuthScreen';
import { CallScreen } from './src/screens/CallScreen';
import { CallsScreen } from './src/screens/CallsScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { NetworkScreen } from './src/screens/NetworkScreen';
import { PersonScreen } from './src/screens/PersonScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { useLocalStream } from './src/useLocalStream';

export default function App() {
  // TeX Gyre Adventor (GUST Font License), bundled with the app.
  const [fontsLoaded] = useFonts({
    Adventor: require('./assets/fonts/texgyreadventor-regular.otf'),
    'Adventor-Bold': require('./assets/fonts/texgyreadventor-bold.otf'),
  });
  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={theme.scheme === 'light' ? 'dark' : 'light'} />
        <View style={styles.root}>
          <Gate />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { status } = useAuth();
  if (status === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.peach} size="large" />
      </View>
    );
  }
  if (status === 'signed-out') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <AuthScreen />
      </SafeAreaView>
    );
  }
  // One persistent presence socket for the whole signed-in session.
  return (
    <PresenceProvider>
      <SignedIn />
    </PresenceProvider>
  );
}

type Peer = { id: string; name: string; photoUrl?: string | null };
type MeetView = 'meet' | 'calls' | 'chat';

/** Segmented control that keeps call set-up, call history and room chat under the Meet tab. */
function MeetSegment({ view, onChange }: { view: MeetView; onChange: (v: MeetView) => void }) {
  const opts: { id: MeetView; label: string }[] = [
    { id: 'meet', label: 'Meet' },
    { id: 'calls', label: 'Calls' },
    { id: 'chat', label: 'Rooms' },
  ];
  return (
    <View style={styles.segment}>
      {opts.map((o) => (
        <Pressable key={o.id} style={[styles.segmentItem, view === o.id && styles.segmentOn]} onPress={() => onChange(o.id)}>
          <Text style={[styles.segmentText, view === o.id && styles.segmentTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SignedIn() {
  const { user, token, logout, api } = useAuth();
  const presence = usePresence();
  const [tab, setTab] = useState<TabId>('home');
  const [meetView, setMeetView] = useState<MeetView>('meet');
  const [call, setCall] = useState<{ roomId: string } | null>(null);
  const [lastRoom, setLastRoom] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [dmPeer, setDmPeer] = useState<Peer | null>(null);
  const [incoming, setIncoming] = useState<{ from: string; fromName: string; roomId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Camera + mic only while actually meeting or in a call — never on the feed.
  const onMeet = tab === 'meet' && meetView === 'meet' && !person;
  const media = useLocalStream(call !== null || onMeet);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((m) => (m === msg ? null : m)), 3500);
  }, []);

  const leave = useCallback(
    (reason?: string, code?: string) => {
      setCall(null);
      if (code === 'unauthorized') void logout('Your session expired. Please sign in again.');
      else if (reason) setNotice(reason);
    },
    [logout],
  );

  const join = useCallback((roomId: string) => {
    setLastRoom(roomId);
    setNotice(null);
    setPerson(null);
    setCall({ roomId });
  }, []);

  // Start a 1:1 call: ring the person live, drop a call message + notification in
  // case they missed the ring, then enter the room to wait for them.
  const callUser = useCallback(
    (userId: string, name: string) => {
      const roomId = generateRoomId();
      presence.send({ type: 'invite', to: userId, roomId });
      void api.startCall(userId, roomId).catch(() => {});
      flash(`Calling ${name || 'them'}…`);
      join(roomId);
    },
    [presence, api, join, flash],
  );

  // Live call signalling over the presence channel.
  useEffect(() => {
    const subs = [
      presence.subscribe('incoming-call', (m: PresenceMessage) =>
        setIncoming({ from: String(m.from), fromName: String(m.fromName ?? ''), roomId: String(m.roomId) }),
      ),
      presence.subscribe('call-cancelled', (m: PresenceMessage) => setIncoming((cur) => (cur && cur.roomId === m.roomId ? null : cur))),
      presence.subscribe('call-declined', (m: PresenceMessage) => flash(`${String(m.fromName || 'They')} declined the call`)),
      presence.subscribe('invite-status', (m: PresenceMessage) => {
        if (m.delivered === false) flash('They are offline right now — they’ll get a call notification.');
      }),
    ];
    return () => subs.forEach((u) => u());
  }, [presence, flash]);

  // Vibrate while a call is ringing; stop after 35s if unanswered.
  useEffect(() => {
    if (!incoming) return;
    Vibration.vibrate([0, 700, 600, 700], true);
    const missed = setTimeout(() => setIncoming(null), 35000);
    return () => {
      Vibration.cancel();
      clearTimeout(missed);
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

  const openPerson = useCallback((id: string) => setPerson(id), []);
  const openMessages = useCallback((id: string, name: string) => {
    setDmPeer({ id, name });
    setPerson(null);
    setTab('messages');
  }, []);
  const changeTab = useCallback((t: TabId) => {
    setPerson(null);
    setTab(t);
  }, []);

  if (!user || !token) return null;

  // A call takes over the whole screen.
  if (call) {
    return media.ready ? (
      <CallScreen roomId={call.roomId} auth={{ token, name: user.name, userId: user.id }} media={media} onLeave={leave} />
    ) : (
      <View style={styles.center}>
        <ActivityIndicator color={theme.peach} size="large" />
        <Text style={styles.prep}>Setting up your camera and mic…</Text>
      </View>
    );
  }

  const content = person ? (
    <PersonScreen userId={person} onBack={() => setPerson(null)} onOpenMessages={openMessages} />
  ) : tab === 'home' ? (
    <FeedScreen user={user} onOpenPerson={openPerson} />
  ) : tab === 'network' ? (
    <NetworkScreen onOpenPerson={openPerson} onOpenMessages={openMessages} />
  ) : tab === 'meet' ? (
    <View style={{ flex: 1 }}>
      <MeetSegment view={meetView} onChange={setMeetView} />
      {meetView === 'meet' && <HomeScreen media={media} user={user} initialRoom={lastRoom} notice={notice} onJoin={join} />}
      {meetView === 'calls' && <CallsScreen onJoin={join} />}
      {meetView === 'chat' && <ChatScreen user={user} onJoin={join} />}
    </View>
  ) : tab === 'messages' ? (
    <MessagesScreen user={user} initialPeer={dmPeer} onConsumePeer={() => setDmPeer(null)} onOpenPerson={openPerson} />
  ) : (
    <ProfileScreen />
  );

  return (
    <CallingContext.Provider value={{ callUser, joinRoom: join }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {!person && <AppHeader onJoinCall={join} onOpenPerson={openPerson} />}
        <View style={{ flex: 1 }}>{content}</View>
        <TabBar tab={tab} onChange={changeTab} user={user} />
      </SafeAreaView>
      {incoming && <IncomingCall fromName={incoming.fromName} fromId={incoming.from} onAccept={acceptIncoming} onDecline={declineIncoming} />}
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </CallingContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: theme.bg },
  prep: { color: theme.muted, fontSize: 15, fontFamily: fonts.regular },
  segment: { flexDirection: 'row', gap: 6, padding: 10, paddingBottom: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  segmentOn: { backgroundColor: theme.primarySoft, borderColor: 'transparent' },
  segmentText: { color: theme.muted, fontSize: 13.5, fontFamily: fonts.bold },
  segmentTextOn: { color: theme.primaryText },
  toast: { position: 'absolute', bottom: 86, left: 24, right: 24, alignItems: 'center' },
  toastText: { backgroundColor: theme.ink, color: '#fff', fontSize: 14, fontFamily: fonts.bold, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, overflow: 'hidden' },
});
