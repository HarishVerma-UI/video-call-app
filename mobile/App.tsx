import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { theme } from './src/config';
import { CallScreen } from './src/screens/CallScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { useLocalStream } from './src/useLocalStream';

export default function App() {
  const media = useLocalStream();
  const [call, setCall] = useState<{ roomId: string; name: string } | null>(null);
  const [lastName, setLastName] = useState('');
  const [lastRoom, setLastRoom] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const leave = useCallback((reason?: string) => {
    setCall(null);
    setNotice(reason ?? 'You left the call.');
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {call ? (
          <CallScreen roomId={call.roomId} name={call.name} media={media} onLeave={leave} />
        ) : (
          <SafeAreaView style={{ flex: 1 }}>
            <HomeScreen
              media={media}
              initialName={lastName}
              initialRoom={lastRoom}
              notice={notice}
              onJoin={(roomId, name) => {
                setLastName(name);
                setLastRoom(roomId);
                setNotice(null);
                setCall({ roomId, name });
              }}
            />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});
