import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatSheet } from '../components/ChatSheet';
import { ControlButton } from '../components/ControlButton';
import { ParticipantTile } from '../components/ParticipantTile';
import { API_BASE, theme } from '../config';
import { useCallClient } from '../useCallClient';
import type { LocalStream } from '../useLocalStream';

interface Props {
  roomId: string;
  auth: { token: string; name: string };
  media: LocalStream;
  onLeave: (reason?: string, code?: string) => void;
}

export function CallScreen({ roomId, auth, media, onLeave }: Props) {
  const { client, participants, status, messages, error, clearError } = useCallClient(roomId, auth, media.stream);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef(0);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const local = participants.find((p) => p.isLocal);
  const audioOn = local?.media.audio ?? media.audioOn;
  const videoOn = local?.media.video ?? media.videoOn;

  useEffect(() => {
    if (chatOpen) {
      seen.current = messages.length;
      setUnread(0);
    } else setUnread(messages.length - seen.current);
  }, [messages.length, chatOpen]);

  useEffect(() => {
    if (!error) return;
    if (error.code === 'room-full' || error.code === 'unauthorized' || (error.code === 'signaling' && status === 'error'))
      onLeave(error.message, error.code);
    else {
      setToast(error.message);
      clearError();
    }
  }, [error, status, onLeave, clearError]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleAudio = () => {
    media.setAudioOn(!audioOn);
    client.current?.setAudioEnabled(!audioOn);
  };
  const toggleVideo = () => {
    media.setVideoOn(!videoOn);
    client.current?.setVideoEnabled(!videoOn);
  };
  const invite = () => {
    void Share.share({ message: `Join my Huddle call — room code: ${roomId}\n${API_BASE}/r/${roomId}` });
  };

  // Lay tiles out to fill the space: 1 → full, 2 → stacked, 3–4 → 2×2, 5–6 → 2×3.
  const count = participants.length;
  const cols = count <= 2 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const gap = 8;
  const areaW = width - 16;
  const areaH = height - insets.top - insets.bottom - 56 /* header */ - 96; /* controls */
  const tileW = (areaW - gap * (cols - 1)) / cols;
  const tileH = Math.max(120, (areaH - gap * (rows - 1)) / rows);

  const statusText =
    status === 'joined' ? `${count} ${count === 1 ? 'person' : 'people'}` : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, status === 'joined' && styles.dotLive]} />
          <Text style={styles.code} numberOfLines={1}>
            {roomId}
          </Text>
          <Text style={styles.meta}>{statusText}</Text>
        </View>
        <Text style={styles.invite} onPress={invite}>
          Invite
        </Text>
      </View>

      <View style={styles.grid}>
        {participants.map((p) => (
          <ParticipantTile
            key={p.id}
            participant={p}
            mirrorLocal={media.facing === 'user'}
            style={{ width: tileW, height: tileH }}
          />
        ))}
      </View>
      {count === 1 && status === 'joined' && (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>You're the only one here. Tap Invite to share the room.</Text>
        </View>
      )}

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <ControlButton icon={audioOn ? '🎙️' : '🔇'} label="Microphone" variant={audioOn ? 'default' : 'off'} onPress={toggleAudio} disabled={!media.hasAudio} />
        <ControlButton icon={videoOn ? '📹' : '🚫'} label="Camera" variant={videoOn ? 'default' : 'off'} onPress={toggleVideo} disabled={!media.hasVideo} />
        <ControlButton icon="🔄" label="Flip camera" onPress={media.flipCamera} disabled={!media.hasVideo || !videoOn} />
        <ControlButton icon="💬" label="Chat" variant={chatOpen ? 'active' : 'default'} onPress={() => setChatOpen(true)} badge={unread} />
        <ControlButton icon="📞" label="Leave" variant="end" onPress={() => onLeave()} />
      </View>

      <ChatSheet
        visible={chatOpen}
        messages={messages}
        selfId={local?.id ?? ''}
        onSend={(t) => client.current?.sendChat(t)}
        onClose={() => setChatOpen(false)}
      />

      {toast && (
        <View style={[styles.toast, { top: insets.top + 10 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.amber },
  dotLive: { backgroundColor: theme.green },
  code: { color: theme.text, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  meta: { color: theme.muted, fontSize: 13 },
  invite: { color: theme.text, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8, alignContent: 'flex-start' },
  waiting: { position: 'absolute', left: 16, right: 16, bottom: 120, padding: 14, borderRadius: 14, backgroundColor: 'rgba(17,22,34,0.92)', borderWidth: 1, borderColor: theme.border },
  waitingText: { color: '#cdd3de', fontSize: 13, textAlign: 'center' },
  dock: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 12 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f8fafc' },
  toastText: { color: theme.bg, fontWeight: '500' },
});
