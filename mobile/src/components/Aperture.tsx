import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { theme } from '../config';

/**
 * Six-blade camera iris, the same idea as the web version, built from plain
 * Views so it needs no SVG library. Each blade lives in a full-size wrapper
 * rotated about the lens centre; the blade itself slides out from the centre
 * as `open` goes from 0 (shut) to 1 (wide open). Runs on the native driver.
 */
export function Aperture({ size, open, children }: { size: number; open: number; children?: ReactNode }) {
  const v = useRef(new Animated.Value(open)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: open,
      duration: 900,
      easing: Easing.bezier(0.68, -0.18, 0.24, 1.18),
      useNativeDriver: true,
    }).start();
  }, [open, v]);

  const R = size / 2;
  const slide = v.interpolate({ inputRange: [0, 1], outputRange: [0, -1.18 * R] });

  return (
    <View style={[styles.lens, { width: size, height: size, borderRadius: R }]}>
      <View style={StyleSheet.absoluteFill}>{children}</View>
      {Array.from({ length: 6 }, (_, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  // closing twists the blades a little, like a real iris
                  rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${i * 60 + 34}deg`, `${i * 60}deg`] }),
                },
              ],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.blade,
              {
                left: R - 0.7 * R,
                top: R - 2.4 * R,
                width: 2.8 * R,
                height: 2.4 * R,
                backgroundColor: i % 2 ? theme.bladeA : theme.bladeB,
                transform: [{ translateY: slide }],
              },
            ]}
          />
        </Animated.View>
      ))}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: R }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  lens: { overflow: 'hidden', backgroundColor: '#081c28' },
  blade: {
    position: 'absolute',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,201,60,0.55)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(8,4,16,0.45)',
  },
  rim: { borderWidth: 1.5, borderColor: 'rgba(255,201,60,0.55)' },
});
