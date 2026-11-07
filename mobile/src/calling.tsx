import { createContext, useContext } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './components/Avatar';
import { fonts, theme } from './config';

export interface CallingApi {
  /** Ring a specific user and enter the call room to wait for them. */
  callUser: (userId: string, name: string) => void;
  /** Join an existing room (e.g. from a call message or notification). */
  joinRoom: (roomId: string) => void;
}

export const CallingContext = createContext<CallingApi | null>(null);

export function useCalling(): CallingApi {
  const ctx = useContext(CallingContext);
  if (!ctx) throw new Error('useCalling must be used within a CallingProvider');
  return ctx;
}

/** Full-screen incoming-call prompt shown to the person being rung. */
export function IncomingCall({ fromName, fromId, onAccept, onDecline }: { fromName: string; fromId: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>INCOMING CALL</Text>
          <Avatar id={fromId} name={fromName} size={96} ring />
          <View style={styles.who}>
            <Text style={styles.name}>{fromName || 'Someone'}</Text>
            <Text style={styles.sub}>is calling you…</Text>
          </View>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.decline]} onPress={onDecline} accessibilityLabel="Decline call">
              <Text style={styles.btnIcon}>✕</Text>
              <Text style={styles.btnLabel}>Decline</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.accept]} onPress={onAccept} accessibilityLabel="Accept call">
              <Text style={styles.btnIcon}>✓</Text>
              <Text style={styles.btnLabel}>Accept</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 18, padding: 30, borderRadius: 24, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  eyebrow: { color: theme.accentText, fontSize: 12, letterSpacing: 1.5, fontFamily: fonts.bold },
  who: { alignItems: 'center', gap: 3 },
  name: { color: theme.text, fontSize: 24, fontFamily: fonts.bold },
  sub: { color: theme.muted, fontSize: 15, fontFamily: fonts.regular },
  actions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  btn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16, borderRadius: 16 },
  btnIcon: { color: theme.onOverlay, fontSize: 26, fontFamily: fonts.bold },
  btnLabel: { color: theme.onOverlay, fontSize: 15, fontFamily: fonts.bold },
  decline: { backgroundColor: theme.hot },
  accept: { backgroundColor: theme.live },
});
