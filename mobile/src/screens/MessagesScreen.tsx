import { ApiError, type AuthUser, type Conversation, type DmMessage } from '@vca/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth';
import { useCalling } from '../calling';
import { Avatar } from '../components/Avatar';
import { fonts, theme } from '../config';
import { ago } from '../format';

type Peer = { id: string; name: string; photoUrl?: string | null };

const mergeDm = (a: DmMessage[], b: DmMessage[]) => {
  const m = new Map<string, DmMessage>();
  for (const x of [...a, ...b]) m.set(x.id, x);
  return [...m.values()].sort((x, y) => x.ts - y.ts);
};

/** A one-to-one conversation with a connection. */
function Thread({ user, peer, onBack }: { user: AuthUser; peer: Peer; onBack: () => void }) {
  const { api } = useAuth();
  const { callUser, joinRoom } = useCalling();
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<DmMessage>>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (first: boolean) => {
      try {
        const { messages } = await api.dmThread(peer.id);
        if (cancelled) return;
        setMessages((cur) => (first || !cur ? messages : mergeDm(cur, messages)));
      } catch (err) {
        if (!cancelled && first) setError(err instanceof ApiError ? err.message : 'Couldn’t load this conversation.');
      }
    };
    void load(true);
    const t = setInterval(() => void load(false), 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [api, peer.id]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const { message } = await api.sendDm(peer.id, t);
      setMessages((cur) => mergeDm(cur ?? [], [message]));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Your message couldn’t be sent.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.head}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="All conversations">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Avatar id={peer.id} name={peer.name} photoUrl={peer.photoUrl} size={36} />
        <Text style={styles.headName} numberOfLines={1}>{peer.name}</Text>
        <Pressable style={styles.callBtn} onPress={() => callUser(peer.id, peer.name)} accessibilityLabel={`Video call ${peer.name}`}>
          <Text style={styles.callBtnText}>📹</Text>
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
          ListEmptyComponent={<Text style={styles.empty}>Say hello to {peer.name.split(' ')[0]} — this is the start of your conversation.</Text>}
          renderItem={({ item }) => {
            const mine = item.from === user.id;
            if (item.roomId) {
              return (
                <View style={[styles.callMsg, mine ? styles.callMsgMine : styles.callMsgTheirs]}>
                  <Text style={styles.callMsgText}>📞 {mine ? 'You started a video call' : `${item.fromName.split(' ')[0]} started a video call`}</Text>
                  <Pressable style={styles.joinBtn} onPress={() => joinRoom(item.roomId as string)}>
                    <Text style={styles.joinBtnText}>Join</Text>
                  </Pressable>
                </View>
              );
            }
            return (
              <View style={[styles.bubbleWrap, mine && { alignItems: 'flex-end' }]}>
                <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  <Text style={styles.bubbleText}>{item.text}</Text>
                </View>
                <Text style={styles.bubbleTime}>{ago(item.ts)}</Text>
              </View>
            );
          }}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Message ${peer.name.split(' ')[0]}`}
          placeholderTextColor={theme.faint}
          style={styles.composerInput}
          multiline
          maxLength={1000}
        />
        <Pressable onPress={() => void send()} disabled={!text.trim()} hitSlop={8} accessibilityLabel="Send">
          <Text style={[styles.send, !text.trim() && { color: theme.faint }]}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function MessagesScreen({
  user,
  initialPeer,
  onConsumePeer,
  onOpenPerson,
}: {
  user: AuthUser;
  initialPeer: Peer | null;
  onConsumePeer: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const { api } = useAuth();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);

  const refresh = useCallback(
    () => api.conversations().then(({ conversations }) => setConversations(conversations)).catch(() => setConversations((c) => c ?? [])),
    [api],
  );
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [refresh]);

  // Deep-link: open a specific conversation (from Network / a profile).
  useEffect(() => {
    if (initialPeer) {
      setPeer(initialPeer);
      onConsumePeer();
    }
  }, [initialPeer, onConsumePeer]);

  if (peer) return <Thread user={user} peer={peer} onBack={() => setPeer(null)} />;

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.h1}>Messages</Text>
      {conversations === null ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={theme.primaryText} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.other}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Start a conversation from a connection’s profile.</Text>}
          renderItem={({ item }) => {
            const mine = item.last.from === user.id;
            const preview = item.last.roomId ? '📞 Video call' : `${mine ? 'You: ' : ''}${item.last.text}`;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.surface2 }]}
                onPress={() => setPeer({ id: item.other, name: item.profile.name, photoUrl: item.profile.photoUrl })}
              >
                <Pressable onPress={() => onOpenPerson(item.other)} hitSlop={6}>
                  <Avatar id={item.other} name={item.profile.name} photoUrl={item.profile.photoUrl} size={46} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.profile.name || 'Member'}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{preview}</Text>
                </View>
                <Text style={styles.when}>{ago(item.last.ts)}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: theme.text, fontSize: 26, fontFamily: fonts.bold, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10 },
  rowTitle: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  rowSub: { color: theme.muted, fontSize: 13, marginTop: 1, fontFamily: fonts.regular },
  when: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular },
  empty: { color: theme.muted, textAlign: 'center', padding: 30, lineHeight: 20, fontFamily: fonts.regular },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface },
  back: { color: theme.text, fontSize: 30, lineHeight: 32, paddingHorizontal: 4 },
  headName: { flex: 1, color: theme.text, fontSize: 16, fontFamily: fonts.bold },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySoft },
  callBtnText: { fontSize: 18 },
  err: { color: theme.hotSoft, padding: 10, fontFamily: fonts.regular },
  bubbleWrap: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderTopLeftRadius: 4, backgroundColor: theme.bubble, borderWidth: 1, borderColor: theme.border },
  bubbleMine: { backgroundColor: theme.bubbleMine, borderColor: 'transparent', borderTopLeftRadius: 14, borderTopRightRadius: 4 },
  bubbleText: { color: theme.text, fontSize: 15, lineHeight: 20, fontFamily: fonts.regular },
  bubbleTime: { color: theme.faint, fontSize: 11, marginTop: 3, fontFamily: fonts.regular },
  callMsg: { maxWidth: '80%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.sparkSoft, borderWidth: 1, borderColor: theme.border },
  callMsgMine: { alignSelf: 'flex-end' },
  callMsgTheirs: { alignSelf: 'flex-start' },
  callMsgText: { flex: 1, color: theme.text, fontSize: 14, fontFamily: fonts.regular },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: theme.primary },
  joinBtnText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, margin: 10, padding: 6, paddingLeft: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  composerInput: { flex: 1, maxHeight: 120, minHeight: 36, color: theme.text, fontSize: 15, paddingVertical: 8, fontFamily: fonts.regular },
  send: { color: theme.primaryText, fontSize: 20, paddingHorizontal: 8, paddingBottom: 8 },
});
