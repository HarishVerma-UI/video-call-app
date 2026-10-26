import { colorFor, generateRoomId, initials, normalizeRoomId, type AuthUser } from '@vca/shared';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useAuth } from '../auth';
import { theme } from '../config';
import type { LocalStream } from '../useLocalStream';

interface Props {
  media: LocalStream;
  user: AuthUser;
  initialRoom: string;
  notice: string | null;
  onJoin: (roomId: string) => void;
  onSignOut: () => void;
}

export function HomeScreen({ media, user, initialRoom, notice, onJoin, onSignOut }: Props) {
  const { api } = useAuth();
  const [room, setRoom] = useState(initialRoom);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<string | null>(null);

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
          if (info.full) setRoomInfo(`Room is full (${info.participants}/${info.maxPeers})`);
          else if (info.participants > 0) setRoomInfo(`${info.participants} in this room now`);
        })
        .catch(() => setRoomInfo(null));
    }, 350);
    return () => {
      clearTimeout(t);
      cancelled = true;
    };
  }, [room, api]);

  const join = () => {
    const id = normalizeRoomId(room || generateRoomId());
    if (!id) {
      setRoomError('Use letters, numbers, - or _');
      return;
    }
    onJoin(id);
  };

  const stream: any = media.stream;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark} />
            <Text style={styles.logo}>Huddle</Text>
          </View>
          <Pressable style={styles.account} onPress={onSignOut} accessibilityLabel="Sign out">
            <View style={[styles.avatar, { backgroundColor: colorFor(user.id) }]}>
              <Text style={styles.avatarText}>{initials(user.name)}</Text>
            </View>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
        <Text style={styles.h1}>Face-to-face,</Text>
        <Text style={[styles.h1, { color: theme.cyan }]}>from anywhere.</Text>

        <View style={styles.preview}>
          {stream && media.videoOn ? (
            <RTCView streamURL={stream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={media.facing === 'user'} />
          ) : (
            <Text style={styles.previewOff}>{media.ready ? (media.hasVideo ? 'Camera is off' : 'No camera') : 'Starting camera…'}</Text>
          )}
          <View style={styles.previewControls}>
            <Pressable
              style={[styles.round, !media.audioOn && styles.roundOff]}
              onPress={() => media.setAudioOn(!media.audioOn)}
              disabled={!media.hasAudio}
              accessibilityLabel="Toggle microphone"
            >
              <Text style={styles.roundIcon}>{media.audioOn ? '🎙️' : '🔇'}</Text>
            </Pressable>
            <Pressable
              style={[styles.round, !media.videoOn && styles.roundOff]}
              onPress={() => media.setVideoOn(!media.videoOn)}
              disabled={!media.hasVideo}
              accessibilityLabel="Toggle camera"
            >
              <Text style={styles.roundIcon}>{media.videoOn ? '📹' : '🚫'}</Text>
            </Pressable>
            <Pressable style={styles.round} onPress={media.flipCamera} disabled={!media.hasVideo} accessibilityLabel="Flip camera">
              <Text style={styles.roundIcon}>🔄</Text>
            </Pressable>
          </View>
        </View>

        {media.problem && (
          <Pressable onPress={media.retry} style={styles.alert}>
            <Text style={styles.alertText}>{media.problem} Tap to retry.</Text>
          </Pressable>
        )}
        {notice && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <Text style={styles.joiningAs}>
          Joining as <Text style={{ color: theme.text, fontWeight: '700' }}>{user.name}</Text>
        </Text>

        <Text style={styles.label}>Room code</Text>
        <View style={styles.row}>
          <TextInput
            value={room}
            onChangeText={(t) => {
              setRoom(t);
              setRoomError(null);
            }}
            placeholder="Leave empty for a new room"
            placeholderTextColor={theme.muted}
            style={[styles.input, { flex: 1 }]}
            maxLength={64}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.ghost} onPress={() => setRoom(generateRoomId())}>
            <Text style={styles.ghostText}>✦ New</Text>
          </Pressable>
        </View>
        {roomError && <Text style={styles.error}>{roomError}</Text>}
        {roomInfo && <Text style={styles.hint}>{roomInfo}</Text>}

        <Pressable
          style={({ pressed }) => [styles.primary, !media.ready && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}
          onPress={join}
          disabled={!media.ready}
        >
          <Text style={styles.primaryText}>{room ? 'Join call' : 'Start a new call'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.border },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  signOut: { color: theme.text, fontWeight: '600', fontSize: 13 },
  joiningAs: { color: theme.muted, fontSize: 14, marginTop: 18 },
  logoMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: theme.violet },
  logo: { color: theme.text, fontSize: 18, fontWeight: '700' },
  h1: { color: theme.text, marginTop: 6, fontSize: 34, fontWeight: '800', letterSpacing: -1, lineHeight: 40 },
  preview: {
    marginTop: 20,
    aspectRatio: 3 / 4,
    maxHeight: 420,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#070a10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOff: { color: theme.muted, fontSize: 15 },
  previewControls: { position: 'absolute', bottom: 14, flexDirection: 'row', gap: 12 },
  round: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,20,30,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  roundOff: { backgroundColor: theme.red, borderColor: 'transparent' },
  roundIcon: { fontSize: 20 },
  alert: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  alertText: { color: '#fde68a', fontSize: 13, lineHeight: 19 },
  notice: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(34,211,238,0.08)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)' },
  noticeText: { color: '#a5f3fc', fontSize: 13 },
  label: { color: theme.muted, fontSize: 13, fontWeight: '600', marginTop: 18, marginBottom: 7 },
  input: {
    color: theme.text,
    backgroundColor: theme.bg2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  ghost: { paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  ghostText: { color: theme.text, fontWeight: '600' },
  error: { color: '#fda4af', fontSize: 13, marginTop: 6 },
  hint: { color: theme.green, fontSize: 13, marginTop: 6 },
  primary: { marginTop: 22, borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: theme.violet },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
