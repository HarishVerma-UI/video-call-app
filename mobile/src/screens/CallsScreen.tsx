import type { CallRecord } from '@vca/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { fonts, theme } from '../config';
import { RoomBadge, listStyles } from './ChatScreen';

const dur = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`);
const title = (roomId: string) => {
  const t = roomId.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const when = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `Today, ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};

/** Recent calls with "call again". */
export function CallsScreen({ onJoin }: { onJoin: (room: string) => void }) {
  const { api } = useAuth();
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  useEffect(() => {
    api
      .calls()
      .then(({ calls }) => setCalls(calls))
      .catch(() => setCalls([]));
  }, [api]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={listStyles.h1}>Calls</Text>
      {calls === null ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={theme.primaryText} />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.empty}>No calls yet. When you leave a meeting, it shows up here with who was there.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <RoomBadge roomId={item.roomId} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {title(item.roomId)}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.with.length ? `With ${item.with.join(', ')}` : 'Just you'} · {dur(item.durationSec)}
                </Text>
                <Text style={styles.when}>{when(item.endedAt)}</Text>
              </View>
              <Pressable style={styles.again} onPress={() => onJoin(item.roomId)} accessibilityLabel={`Call ${title(item.roomId)} again`}>
                <Text style={styles.againText}>Call again</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  title: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  sub: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular },
  when: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular },
  again: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  againText: { color: theme.text, fontFamily: fonts.bold, fontSize: 13 },
  empty: { color: theme.muted, textAlign: 'center', padding: 30, lineHeight: 20, fontFamily: fonts.regular },
});
