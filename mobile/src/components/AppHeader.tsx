import { StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from '../config';
import { NotificationBell } from './NotificationBell';

/** Slim top bar shown on the main tabs: brand on the left, the live notification bell on the right. */
export function AppHeader({ onJoinCall, onOpenPerson }: { onJoinCall: (roomId: string) => void; onOpenPerson: (id: string) => void }) {
  return (
    <View style={styles.bar}>
      <View style={styles.brandRow}>
        <View style={styles.mark} />
        <Text style={styles.brand}>Huddle</Text>
      </View>
      <NotificationBell onJoinCall={onJoinCall} onOpenPerson={onOpenPerson} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 8,
    height: 48,
    backgroundColor: theme.chrome,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: theme.accent, backgroundColor: theme.primary },
  brand: { color: theme.text, fontSize: 19, fontFamily: fonts.bold },
});
