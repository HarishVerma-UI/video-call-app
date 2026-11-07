import type { Notification } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { fonts, theme } from '../config';
import { ago } from '../format';
import { usePresence, type PresenceMessage } from '../presence';

const verb = (n: Notification) => (n.kind === 'like' ? 'liked your post' : n.kind === 'call' ? 'called you' : 'commented on your post');
const glyph = (n: Notification) => (n.kind === 'like' ? '♥' : n.kind === 'call' ? '📞' : '💬');

/** Bell with an unread badge; opens a sheet of live like/comment/call notifications. */
export function NotificationBell({ onJoinCall, onOpenPerson }: { onJoinCall: (roomId: string) => void; onOpenPerson: (id: string) => void }) {
  const { api } = useAuth();
  const { subscribe } = usePresence();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api
      .notifications()
      .then(({ notifications, unread }) => {
        setItems(notifications);
        setUnread(unread);
      })
      .catch(() => {});
  }, [api]);
  useEffect(() => load(), [load]);

  // Live pushes over the presence channel.
  useEffect(
    () =>
      subscribe('notification', (msg: PresenceMessage) => {
        const n = msg.notification as Notification | undefined;
        if (n) setItems((xs) => [n, ...xs].slice(0, 40));
        setUnread((u) => (typeof msg.unread === 'number' ? (msg.unread as number) : u + 1));
      }),
    [subscribe],
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      api.markNotificationsRead().catch(() => {});
      setItems((xs) => xs.map((n) => ({ ...n, read: true })));
    }
  };

  return (
    <>
      <Pressable onPress={toggle} hitSlop={10} style={styles.bell} accessibilityLabel={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}>
        <Text style={styles.bellIcon}>🔔</Text>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Notifications</Text>
            {items.length === 0 ? (
              <Text style={styles.empty}>No notifications yet.</Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(n) => n.id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.item, !item.read && styles.itemUnread]}
                    onPress={() => {
                      setOpen(false);
                      if (item.kind === 'call' && item.roomId) onJoinCall(item.roomId);
                      else if (item.actorId) onOpenPerson(item.actorId);
                    }}
                  >
                    <Text style={styles.itemGlyph}>{glyph(item)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemText}>
                        <Text style={styles.itemActor}>{item.actorName || 'Someone'}</Text> {verb(item)}
                      </Text>
                      {!!item.text && <Text style={styles.itemSnippet} numberOfLines={1}>“{item.text}”</Text>}
                      <Text style={styles.itemTime}>{ago(item.ts)}</Text>
                    </View>
                    {item.kind === 'call' && item.roomId && (
                      <Pressable
                        style={styles.joinBtn}
                        onPress={() => {
                          setOpen(false);
                          onJoinCall(item.roomId as string);
                        }}
                      >
                        <Text style={styles.joinText}>Join</Text>
                      </Pressable>
                    )}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: theme.hot, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.chrome },
  badgeText: { color: theme.hotInk, fontSize: 10, fontFamily: fonts.bold },
  backdrop: { flex: 1, backgroundColor: theme.overlay, paddingTop: 70, paddingHorizontal: 12, alignItems: 'flex-end' },
  sheet: { width: '100%', maxWidth: 420, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, paddingVertical: 10 },
  title: { color: theme.text, fontSize: 16, fontFamily: fonts.bold, paddingHorizontal: 16, paddingVertical: 8 },
  empty: { color: theme.muted, textAlign: 'center', padding: 28, fontFamily: fonts.regular },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border },
  itemUnread: { backgroundColor: theme.primarySoft },
  itemGlyph: { fontSize: 18, width: 22, textAlign: 'center' },
  itemText: { color: theme.text, fontSize: 14, lineHeight: 19, fontFamily: fonts.regular },
  itemActor: { fontFamily: fonts.bold },
  itemSnippet: { color: theme.muted, fontSize: 13, marginTop: 1, fontFamily: fonts.regular },
  itemTime: { color: theme.faint, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: theme.primary },
  joinText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 13 },
});
