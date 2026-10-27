import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth';
import { theme } from './src/config';
import { AuthScreen } from './src/screens/AuthScreen';
import { CallScreen } from './src/screens/CallScreen';
import { HomeScreen } from './src/screens/HomeScreen';
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
  return <SignedIn />;
}

/** Camera and mic are only requested once you're signed in. */
function SignedIn() {
  const { user, token, logout } = useAuth();
  const media = useLocalStream();
  const [call, setCall] = useState<{ roomId: string } | null>(null);
  const [lastRoom, setLastRoom] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const leave = useCallback(
    (reason?: string, code?: string) => {
      setCall(null);
      if (code === 'unauthorized') void logout('Your session expired. Please sign in again.');
      else setNotice(reason ?? 'You left the call.');
    },
    [logout],
  );

  if (!user || !token) return null;
  if (call) return <CallScreen roomId={call.roomId} auth={{ token, name: user.name }} media={media} onLeave={leave} />;
  if (profileOpen) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ProfileScreen onBack={() => setProfileOpen(false)} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <HomeScreen
        media={media}
        user={user}
        initialRoom={lastRoom}
        notice={notice}
        onOpenProfile={() => setProfileOpen(true)}
        onJoin={(roomId) => {
          setLastRoom(roomId);
          setNotice(null);
          setCall({ roomId });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
