import { ApiError, colorFor, initials, normalizeRoomId, type AuthUser, type ChatMessage, type ChatSummary } from '@vca/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth';
import { fonts, theme } from '../config';

const title = (roomId: string) => {
  const t = roomId.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const badgeText = (roomId: string) =>
  roomId
    .split(/[-_]+/)
    .filter((w) => /[a-z]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '#';
const when = (ts: number | string) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const merge = (a: ChatMessage[], b: ChatMessage[]) => {
  const m = new Map<string, ChatMessage>();
  for (const x of [...a, ...b]) m.set(x.id, x);
  return [...m.values()].sort((x, y) => x.ts - y.ts);
};

export function RoomBadge({ roomId, live, size = 42 }: { roomId: string; live?: boolean; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: colorFor(roomId) }]}>
      <Text style={styles.badgeText}>{badgeText(roomId)}</Text>
      {live && <View style={styles.liveDot} />}
    </View>
  );
}

function Conversation({ user, room, summary, onBack, onJoin }: { user: AuthUser; room: string; summary?: ChatSummary; onBack: () => void; onJoin: () => void }) {
  const { api } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (first: boolean) => {
      try {
        const page = await api.roomMessages(room, { limit: 50 });
        if (cancelled) return;
        setMessages((cur) => (first || !cur ? page.messages : merge(cur, page.messages)));
        if (first) setHasMore(page.hasMore);
      } catch (err) {
        if (!cancelled && first) setError(err instanceof ApiError ? err.message : 'Couldn’t load this chat.');
      }
    };
    void load(true);
    const t = setInterval(() => void load(false), 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [api, room]);

  const earlier = async () => {
    if (!messages?.length) return;
    const page = await api.roomMessages(room, { before: messages[0].ts, limit: 50 });
    setMessages((cur) => merge(page.messages, cur ?? []));
    setHasMore(page.hasMore);
  };
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const { message } = await api.sendRoomMessage(room, t);
      setMessages((cur) => merge(cur ?? [], [message]));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Your message couldn’t be sent.');
    }
  };
  const inCall = summary?.inCall ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.convHead}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="All chats">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <RoomBadge roomId={room} size={34} live={inCall.length > 0} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title(room)}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {inCall.length ? `In the meeting: ${inCall.map((p) => p.name.split(' ')[0]).join(', ')}` : `Room code ${room}`}
          </Text>
        </View>
        <Pressable style={[styles.joinBtn, inCall.length > 0 && { backgroundColor: theme.live }]} onPress={onJoin}>
          <Text style={styles.joinText}>{inCall.length ? 'Join' : 'Meet'}</Text>
        </Pressable>
      </View>
      {!!error && <Text style={styles.err}>{error}</Text>}
      {messages === null ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primaryText} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            hasMore ? (
              <Pressable onPress={() => void earlier()} style={styles.earlier}>
                <Text style={styles.earlierText}>Load earlier messages</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Anyone who joins this room will see what you write.</Text>}
          renderItem={({ item, index }) => {
            const mine = item.userId === user.id;
            const prev = messages[index - 1];
            const grouped = !!prev && prev.userId === item.userId && item.ts - prev.ts < 5 * 60_000;
            return (
              <View style={[styles.msg, mine && styles.msgMine]}>
                {!mine && (
                  <View style={[styles.avatar, { backgroundColor: grouped ? 'transparent' : colorFor(item.userId) }]}>
                    {!grouped && <Text style={styles.avatarText}>{initials(item.name)}</Text>}
                  </View>
                )}
                <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!grouped && (
                    <Text style={styles.meta}>
                      {mine ? '' : `${item.name}  `}
                      {when(item.ts)}
                    </Text>
                  )}
                  <View style={[styles.bubble, mine && styles.bubbleMine]}>
                    <Text style={styles.bubbleText}>{item.text}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Message ${title(room)}`}
          placeholderTextColor={theme.faint}
          style={styles.composerInput}
          multiline
          maxLength={1000}
        />
        <Pressable onPress={() => void send()} disabled={!text.trim()} style={styles.send} accessibilityLabel="Send">
          <Text style={[styles.sendText, !text.trim() && { color: theme.faint }]}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function ChatScreen({ user, onJoin }: { user: AuthUser; onJoin: (room: string) => void }) {
  const { api } = useAuth();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [room, setRoom] = useState('');
  const [code, setCode] = useState('');

  const refresh = useCallback(() => api.chats().then(({ chats }) => setChats(chats)).catch(() => setChats((c) => c ?? [])), [api]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [refresh]);

  if (room) return <Conversation user={user} room={room} summary={chats?.find((c) => c.roomId === room)} onBack={() => setRoom('')} onJoin={() => onJoin(room)} />;

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.h1}>Chat</Text>
      <View style={styles.codeRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Open a room’s chat by code"
          placeholderTextColor={theme.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.codeInput}
          onSubmitEditing={() => {
            const id = normalizeRoomId(code);
            if (id) {
              setCode('');
              setRoom(id);
            }
          }}
        />
      </View>
      {chats === null ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={theme.primaryText} />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.roomId}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.empty}>Chats from your meetings live here. Join a meeting, or type a room code above.</Text>}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.surface2 }]} onPress={() => setRoom(item.roomId)}>
              <RoomBadge roomId={item.roomId} live={item.inCall.length > 0} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {title(item.roomId)}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.lastMessage ? `${item.lastMessage.userId === user.id ? 'You' : item.lastMessage.name.split(' ')[0]}: ${item.lastMessage.text}` : 'No messages yet'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.when}>{when(item.lastMessage?.ts ?? item.lastActiveAt)}</Text>
                {item.inCall.length > 0 && <Text style={styles.live}>Live</Text>}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

export const listStyles = StyleSheet.create({
  h1: { color: theme.text, fontSize: 26, fontFamily: fonts.bold, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
});

const styles = StyleSheet.create({
  h1: listStyles.h1,
  codeRow: { paddingHorizontal: 16, paddingBottom: 8 },
  codeInput: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text, paddingHorizontal: 12, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10 },
  rowTitle: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  rowSub: { color: theme.muted, fontSize: 13, marginTop: 1, fontFamily: fonts.regular },
  when: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular },
  live: { color: theme.live, backgroundColor: theme.liveSoft, fontSize: 11, fontFamily: fonts.bold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: theme.ink, fontFamily: fonts.bold, fontSize: 13 },
  liveDot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: theme.live, borderWidth: 2, borderColor: theme.bg },
  empty: { color: theme.muted, textAlign: 'center', padding: 30, lineHeight: 20, fontFamily: fonts.regular },
  convHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface },
  back: { color: theme.text, fontSize: 30, lineHeight: 32, paddingHorizontal: 4 },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.primary },
  joinText: { color: '#fff', fontFamily: fonts.bold },
  err: { color: theme.hotSoft, padding: 10, fontFamily: fonts.regular },
  earlier: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  earlierText: { color: theme.primaryText, fontFamily: fonts.bold, fontSize: 13 },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgMine: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.ink, fontSize: 11, fontFamily: fonts.bold },
  meta: { color: theme.faint, fontSize: 12, marginBottom: 3, fontFamily: fonts.regular },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderTopLeftRadius: 4, backgroundColor: theme.bubble, borderWidth: 1, borderColor: theme.border },
  bubbleMine: { backgroundColor: theme.bubbleMine, borderColor: 'transparent', borderTopLeftRadius: 12, borderTopRightRadius: 4 },
  bubbleText: { color: theme.text, fontSize: 15, lineHeight: 20, fontFamily: fonts.regular },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, margin: 10, padding: 6, paddingLeft: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  composerInput: { flex: 1, maxHeight: 120, minHeight: 36, color: theme.text, fontSize: 15, paddingVertical: 8 },
  send: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: theme.primaryText, fontSize: 20 },
});
