import { ApiError, passwordStrength } from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useAuth } from '../auth';
import { theme } from '../config';

type Mode = 'login' | 'register';
type Field = 'name' | 'email' | 'password';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- animated constellation header ---------- */

const NODES = [
  { t: 'PS', c: '#8b5cf6', r: 1, a: 0 },
  { t: 'AK', c: '#22d3ee', r: 1, a: 72 },
  { t: 'MR', c: '#f59e0b', r: 1, a: 144 },
  { t: 'RJ', c: '#e11d48', r: 1, a: 216 },
  { t: 'SN', c: '#10b981', r: 1, a: 288 },
  { t: 'DV', c: '#6366f1', r: 0.62, a: 40 },
  { t: 'TK', c: '#ec4899', r: 0.62, a: 160 },
  { t: 'LO', c: '#06b6d4', r: 0.62, a: 280 },
];

function Constellation({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 60000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counter = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const half = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.orbit, { width: size * 0.92, height: size * 0.92, borderRadius: size, left: size * 0.04, top: size * 0.04 }]} />
      <View style={[styles.orbit, { width: size * 0.57, height: size * 0.57, borderRadius: size, left: size * 0.215, top: size * 0.215 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        {NODES.map((n) => {
          const rad = (n.a * Math.PI) / 180;
          const d = n.r === 1 ? size * 0.46 : size * 0.285; // radius of the outer / inner orbit
          const bubble = n.r === 1 ? 44 : 34;
          return (
            <Animated.View
              key={n.t}
              style={[
                styles.bubble,
                {
                  width: bubble,
                  height: bubble,
                  borderRadius: bubble / 2,
                  backgroundColor: n.c,
                  left: half + Math.cos(rad) * d - bubble / 2,
                  top: half + Math.sin(rad) * d - bubble / 2,
                  transform: [{ rotate: counter }],
                },
              ]}
            >
              <Text style={[styles.bubbleText, { fontSize: n.r === 1 ? 13 : 11 }]}>{n.t}</Text>
            </Animated.View>
          );
        })}
      </Animated.View>
      <Animated.View
        style={[
          styles.pulse,
          {
            left: half - 34,
            top: half - 34,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
          },
        ]}
      />
      <View style={[styles.core, { left: half - 34, top: half - 34 }]}>
        <Text style={{ fontSize: 26 }}>📹</Text>
      </View>
    </View>
  );
}

/* ---------- inputs ---------- */

function Input(props: {
  icon: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secure?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
  onBlur?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={[styles.field, focused && styles.fieldFocus, !!props.error && styles.fieldError]}>
        <Text style={styles.fieldIcon}>{props.icon}</Text>
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.label}
          placeholderTextColor={theme.muted}
          style={styles.fieldInput}
          secureTextEntry={props.secure}
          keyboardType={props.keyboardType}
          autoCapitalize={props.keyboardType === 'email-address' || props.secure !== undefined ? 'none' : 'words'}
          autoCorrect={false}
          autoComplete={props.autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            props.onBlur?.();
          }}
          accessibilityLabel={props.label}
        />
        {props.onToggleSecure && (
          <Pressable onPress={props.onToggleSecure} hitSlop={10} accessibilityLabel={props.secure ? 'Show password' : 'Hide password'}>
            <Text style={styles.eye}>{props.secure ? '👁️' : '🙈'}</Text>
          </Pressable>
        )}
      </View>
      {!!props.error && <Text style={styles.errorText}>{props.error}</Text>}
    </View>
  );
}

/* ---------- screen ---------- */

export function AuthScreen() {
  const { login, register, notice } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [v, setV] = useState<Record<Field, string>>({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);
  const [secure, setSecure] = useState(true);
  const [segW, setSegW] = useState(0);
  const thumb = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => setBanner(notice), [notice]);
  useEffect(() => {
    Animated.spring(thumb, { toValue: mode === 'login' ? 0 : 1, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [mode, thumb]);

  const errors: Partial<Record<Field, string>> = {};
  if (mode === 'register' && v.name.trim().length < 2) errors.name = 'Tell us your name (2+ characters).';
  if (!EMAIL.test(v.email.trim())) errors.email = 'Enter a valid email address.';
  if (mode === 'register') {
    if (v.password.length < 8) errors.password = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) errors.password = 'Include a letter and a number.';
  } else if (!v.password) errors.password = 'Enter your password.';
  const err = (f: Field) => serverErrors[f] ?? (touched[f] ? errors[f] : undefined);
  const strength = passwordStrength(v.password);

  const set = (f: Field) => (val: string) => {
    setV((s) => ({ ...s, [f]: val }));
    setServerErrors((s) => ({ ...s, [f]: undefined }));
  };
  const doShake = () =>
    Animated.sequence(
      [8, -8, 6, -6, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 60, useNativeDriver: true })),
    ).start();

  const switchMode = (m: Mode) => {
    setMode(m);
    setTouched({});
    setServerErrors({});
    setBanner(null);
  };

  const submit = async () => {
    setTouched({ name: true, email: true, password: true });
    if (Object.keys(errors).length) return doShake();
    setBusy(true);
    setBanner(null);
    try {
      if (mode === 'register') await register(v.name.trim(), v.email.trim(), v.password);
      else await login(v.email.trim(), v.password);
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      setServerErrors((apiErr?.fields ?? {}) as Partial<Record<Field, string>>);
      setBanner(apiErr?.message ?? 'Something went wrong. Please try again.');
      doShake();
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          <Constellation size={250} />
        </View>

        <Text style={styles.h1}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.sub}>{mode === 'login' ? 'Sign in to start or join a call.' : 'It takes 20 seconds. No credit card.'}</Text>

        <View style={styles.seg} onLayout={(e: LayoutChangeEvent) => setSegW(e.nativeEvent.layout.width)}>
          {segW > 0 && (
            <Animated.View
              style={[
                styles.segThumb,
                { width: (segW - 8) / 2, transform: [{ translateX: thumb.interpolate({ inputRange: [0, 1], outputRange: [0, (segW - 8) / 2] }) }] },
              ]}
            />
          )}
          {(['login', 'register'] as const).map((m) => (
            <Pressable key={m} style={styles.segBtn} onPress={() => switchMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
              <Text style={[styles.segText, mode === m && { color: '#fff' }]}>{m === 'login' ? 'Sign in' : 'Create account'}</Text>
            </Pressable>
          ))}
        </View>

        <Animated.View style={{ transform: [{ translateX: shake }], gap: 12 }}>
          {banner && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{banner}</Text>
            </View>
          )}
          {mode === 'register' && (
            <Input icon="👤" label="Full name" value={v.name} onChangeText={set('name')} error={err('name')} autoComplete="name" onBlur={() => setTouched((t) => ({ ...t, name: true }))} />
          )}
          <Input
            icon="✉️"
            label="Email"
            value={v.email}
            onChangeText={set('email')}
            error={err('email')}
            keyboardType="email-address"
            autoComplete="email"
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          />
          <Input
            icon="🔒"
            label="Password"
            value={v.password}
            onChangeText={set('password')}
            error={err('password')}
            secure={secure}
            onToggleSecure={() => setSecure((s) => !s)}
            autoComplete={mode === 'login' ? 'password' : 'new-password'}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          />
          {mode === 'register' && !!v.password && (
            <View style={styles.meter}>
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.meterBar,
                    i <= strength.score && { backgroundColor: ['', theme.red, theme.amber, theme.cyan, theme.green][strength.score] },
                  ]}
                />
              ))}
              <Text style={styles.meterLabel}>{strength.label}</Text>
            </View>
          )}
        </Animated.View>

        <Pressable style={({ pressed }) => [styles.submit, (pressed || busy) && { opacity: 0.85 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{mode === 'login' ? 'Sign in  →' : 'Create account  →'}</Text>}
        </Pressable>

        <Text style={styles.switch}>
          {mode === 'login' ? 'New to Huddle? ' : 'Already have an account? '}
          <Text style={styles.switchLink} onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  hero: { height: 270, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden', borderRadius: 24, backgroundColor: '#070910' },
  glowA: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(139,92,246,0.25)', left: -40, top: -60 },
  glowB: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(34,211,238,0.16)', right: -50, bottom: -60 },
  orbit: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)' },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  bubbleText: { color: '#fff', fontWeight: '700' },
  core: { position: 'absolute', width: 68, height: 68, borderRadius: 20, backgroundColor: theme.violet, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 68, height: 68, borderRadius: 20, borderWidth: 2, borderColor: theme.cyan },
  h1: { color: theme.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 14 },
  sub: { color: theme.muted, fontSize: 15, marginTop: 4, marginBottom: 18 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 16 },
  segThumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 10, backgroundColor: theme.violet },
  segBtn: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  segText: { color: theme.muted, fontWeight: '600', fontSize: 14 },
  banner: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)' },
  bannerText: { color: '#fecdd3', fontSize: 14, lineHeight: 20 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg2 },
  fieldFocus: { borderColor: theme.violet, backgroundColor: '#131a28' },
  fieldError: { borderColor: 'rgba(244,63,94,0.7)' },
  fieldIcon: { fontSize: 16 },
  fieldInput: { flex: 1, color: theme.text, fontSize: 16, height: '100%' },
  eye: { fontSize: 18 },
  errorText: { color: '#fda4af', fontSize: 13, marginTop: 6, marginLeft: 2 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meterBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  meterLabel: { color: theme.muted, fontSize: 12, fontWeight: '600', minWidth: 64, textAlign: 'right' },
  submit: { marginTop: 18, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.violet },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switch: { color: theme.muted, textAlign: 'center', marginTop: 20, fontSize: 14 },
  switchLink: { color: theme.cyan, fontWeight: '600' },
});
