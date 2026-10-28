import { colorFor, initials, type AuthUser } from '@vca/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, theme } from '../config';

export type TabId = 'meet' | 'chat' | 'calls' | 'profile';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'meet', label: 'Meet', glyph: '▣' },
  { id: 'chat', label: 'Chat', glyph: '◫' },
  { id: 'calls', label: 'Calls', glyph: '✆' },
];

/** Teams-style bottom tabs; the active one gets the amber spark on top. */
export function TabBar({ tab, onChange, user }: { tab: TabId; onChange: (t: TabId) => void; user: AuthUser }) {
  const insets = useSafeAreaInsets();
  const item = (id: TabId, label: string, icon: ReactNode) => {
    const on = tab === id;
    return (
      <Pressable key={id} style={styles.item} onPress={() => onChange(id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
        <View style={[styles.spark, on && styles.sparkOn]} />
        {icon}
        <Text style={[styles.label, on && { color: theme.primaryText }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS.map((t) => item(t.id, t.label, <Text style={[styles.glyph, tab === t.id && { color: theme.primaryText }]}>{t.glyph}</Text>))}
      {item(
        'profile',
        'Profile',
        <View style={[styles.avatar, { backgroundColor: colorFor(user.id) }, tab === 'profile' && { borderColor: theme.accent }]}>
          <Text style={styles.avatarText}>{initials(user.name)}</Text>
        </View>,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: theme.chrome, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 2 },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingTop: 6 },
  spark: { position: 'absolute', top: -2, width: 0, height: 3, borderRadius: 2, backgroundColor: theme.accent },
  sparkOn: { width: 26 },
  glyph: { fontSize: 20, color: theme.muted, height: 24 },
  label: { fontSize: 11, color: theme.muted, fontFamily: fonts.bold },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  avatarText: { fontSize: 9, color: theme.ink, fontFamily: fonts.bold },
});
