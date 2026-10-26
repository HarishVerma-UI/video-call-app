import { colorFor, initials, type Participant } from '@vca/shared';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { theme } from '../config';

interface Props {
  participant: Participant;
  style?: ViewStyle;
  /** Back camera shouldn't be mirrored. */
  mirrorLocal?: boolean;
}

export function ParticipantTile({ participant: p, style, mirrorLocal = true }: Props) {
  const stream: any = p.stream;
  const hasVideoTrack = !!stream?.getVideoTracks?.().length;
  const showVideo = !!stream && hasVideoTrack && (p.media.video || p.media.screen);
  const connecting = !p.isLocal && p.connection !== 'connected';

  return (
    <View style={[styles.tile, style]}>
      {/* RTCView also plays the remote audio; keep it mounted even with video off. */}
      {stream && (
        <RTCView
          streamURL={stream.toURL()}
          style={[StyleSheet.absoluteFill, { opacity: showVideo ? 1 : 0 }]}
          objectFit={p.media.screen ? 'contain' : 'cover'}
          mirror={p.isLocal && mirrorLocal && !p.media.screen}
          zOrder={p.isLocal ? 1 : 0}
        />
      )}
      {!showVideo && (
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: colorFor(p.id) }]}>
            <Text style={styles.avatarText}>{initials(p.name)}</Text>
          </View>
        </View>
      )}
      {connecting && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Connecting…</Text>
        </View>
      )}
      <View style={styles.name}>
        {!p.media.audio && <Text style={styles.muted}>🔇 </Text>}
        {p.media.screen && <Text style={styles.nameText}>🖥️ </Text>}
        <Text style={styles.nameText} numberOfLines={1}>
          {p.isLocal ? `${p.name} (you)` : p.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  avatarWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface2 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  name: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(5,8,14,0.62)',
  },
  nameText: { color: theme.text, fontSize: 12, fontWeight: '500' },
  muted: { fontSize: 11 },
  badge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(5,8,14,0.62)' },
  badgeText: { color: theme.amber, fontSize: 11 },
});
