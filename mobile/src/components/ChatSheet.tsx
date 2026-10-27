import { colorFor, type ChatMessage } from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, theme } from '../config';

interface Props {
  visible: boolean;
  messages: ChatMessage[];
  /** Your account id: messages from any of your devices count as yours. */
  selfUserId: string;
  historyCount: number;
  hasMore: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  onSend: (text: string) => void;
  onClose: () => void;
}

const time = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function ChatSheet({ visible, messages, selfUserId, historyCount, hasMore, loadingEarlier, onLoadEarlier, onSend, onClose }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length, visible]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Chat</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 14, gap: 10, flexGrow: 1 }}
            ListEmptyComponent={<Text style={styles.empty}>Say hello. Messages are saved in this room, so people who join later can catch up.</Text>}
            ListHeaderComponent={
              hasMore ? (
                <Pressable onPress={onLoadEarlier} disabled={loadingEarlier} style={styles.earlier}>
                  <Text style={styles.earlierText}>{loadingEarlier ? 'Loading…' : 'Load earlier messages'}</Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item, index }) => {
              const mine = item.userId === selfUserId;
              const joinedHere = index === historyCount && historyCount > 0;
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {joinedHere && (
                    <View style={styles.joined}>
                      <View style={styles.joinedLine} />
                      <Text style={styles.joinedText}>You joined</Text>
                      <View style={styles.joinedLine} />
                    </View>
                  )}
                  <View style={styles.meta}>
                    <View style={[styles.dot, { backgroundColor: colorFor(item.userId) }]} />
                    <Text style={styles.metaName}>{mine ? 'You' : item.name}</Text>
                    <Text style={styles.metaTime}>{time(item.ts)}</Text>
                  </View>
                  <View style={[styles.bubble, mine && styles.bubbleMine]}>
                    <Text style={[styles.bubbleText, mine && { color: theme.ink }]}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={styles.form}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Send a message…"
              placeholderTextColor={theme.muted}
              style={styles.input}
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={send}
            />
            <Pressable onPress={send} disabled={!text.trim()} style={[styles.send, !text.trim() && { opacity: 0.4 }]}>
              <Text style={styles.sendText}>➤</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '72%',
    backgroundColor: theme.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  title: { color: theme.text, fontSize: 16, fontFamily: fonts.bold },
  close: { color: theme.cyan, fontFamily: fonts.bold, fontSize: 15 },
  earlier: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.surface2, marginBottom: 6 },
  earlierText: { color: theme.text, fontSize: 13, fontFamily: fonts.bold },
  joined: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginVertical: 6 },
  joinedLine: { flex: 1, height: 1, backgroundColor: theme.accentText, opacity: 0.45 },
  joinedText: { color: theme.accentText, fontSize: 12, fontFamily: fonts.bold },
  empty: { fontFamily: fonts.regular, color: theme.muted, textAlign: 'center', marginTop: 40, fontSize: 13 },
  meta: { fontFamily: fonts.regular, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaName: { color: theme.text, fontSize: 12, fontFamily: fonts.bold },
  metaTime: { fontFamily: fonts.regular, color: theme.muted, fontSize: 11 },
  bubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: theme.surface2 },
  bubbleMine: { backgroundColor: theme.violet },
  bubbleText: { fontFamily: fonts.regular, color: theme.text, fontSize: 14, lineHeight: 20 },
  form: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  input: { fontFamily: fonts.regular, flex: 1, color: theme.text, backgroundColor: theme.bg2, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: theme.border, fontSize: 15 },
  send: { width: 46, borderRadius: 12, backgroundColor: theme.violet, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: fonts.bold, color: theme.ink, fontSize: 18 },
});
