import { colorFor, initials } from '@vca/shared';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from '../config';

/**
 * A person's avatar: their uploaded photo when there is one, otherwise a
 * colored circle with their initials (same scheme as the web app).
 */
export function Avatar({
  id,
  name,
  photoUrl,
  size = 44,
  ring,
}: {
  id: string;
  name: string;
  photoUrl?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const radius = size / 2;
  const border = ring ? { borderWidth: 2, borderColor: theme.accent } : null;
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[{ width: size, height: size, borderRadius: radius }, border]} accessibilityLabel={name} />;
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: colorFor(id) }, border]}>
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  text: { color: theme.ink, fontFamily: fonts.bold },
});
