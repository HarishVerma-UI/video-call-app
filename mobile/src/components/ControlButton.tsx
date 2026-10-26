import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../config';

interface Props {
  icon: string;
  label: string;
  onPress: () => void;
  variant?: 'default' | 'off' | 'active' | 'end';
  disabled?: boolean;
  badge?: number;
}

export function ControlButton({ icon, label, onPress, variant = 'default', disabled, badge }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        variant === 'off' && styles.off,
        variant === 'active' && styles.active,
        variant === 'end' && styles.end,
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
      {!!badge && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface2,
  },
  off: { backgroundColor: 'rgba(244,63,94,0.22)' },
  active: { backgroundColor: 'rgba(139,92,246,0.3)' },
  end: { backgroundColor: theme.red, width: 64 },
  icon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#04222a', fontSize: 10, fontWeight: '700' },
});
