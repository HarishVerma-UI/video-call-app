import { ApiError, initials, passwordStrength } from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../auth';
import { Aperture } from '../components/Aperture';
import { fonts, theme } from '../config';

type Mode = 'login' | 'register';
type Field = 'name' | 'email' | 'password';
type Lens = 'shut' | 'open' | 'peek' | 'blink' | 'wide';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LENS_OPEN: Record<Lens, number> = { shut: 0, open: 0.62, peek: 0.1, blink: 0, wide: 1 };

const CAST = [
  { name: 'Meera', bg: '#ffc93c', tone: '#3d2a05' },
  { name: 'Arjun', bg: '#5ce1e6', tone: '#0d3a40' },
  { name: 'Priya', bg: '#f2542d', tone: '#4a130a' },
  { name: 'Dev', bg: '#ffe08a', tone: '#3d3305' },
];

const COPY = {
  login: { title: ['Back in', 'focus.'], sub: 'Sign in to start a call or join one.', cta: 'Sign in' },
  register: { title: ['Get in', 'the picture.'], sub: 'One account for web, Android and iOS.', cta: 'Create account' },
};

/* ---------- what the lens sees ---------- */

function Portrait({ size, name, bg, tone, mine }: { size: number; name: string; bg: string; tone: string; mine?: boolean }) {
  const head = size * 0.3;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg, alignItems: 'center' }]}>
      <View style={{ position: 'absolute', top: size * 0.25, width: head, height: head, borderRadius: head / 2, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
        {mine && <Text style={[styles.portraitInitials, { color: bg, fontSize: head * 0.38 }]}>{initials(name)}</Text>}
      </View>
      <View style={{ position: 'absolute', top: size * 0.62, width: size * 0.78, height: size * 0.78, borderRadius: size * 0.39, backgroundColor: tone }} />
      <View style={[styles.tag, { top: size * 0.56 }]}>
        <Text style={styles.tagText}>{mine ? `${name.trim().split(/\s+/)[0]} (you)` : name}</Text>
      </View>
    </View>
  );
}

function LensScene({ size, myName }: { size: number; myName: string }) {
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (myName.trim()) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setI((n) => (n + 1) % CAST.length);
        Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
      });
    }, 3400);
    return () => clearInterval(t);
  }, [myName, fade]);

  if (myName.trim()) return <Portrait size={size} name={myName} bg={theme.accent} tone="#071824" mine />;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <Portrait size={size} {...CAST[i]} />
    </Animated.View>
  );
}

/* ---------- underlined input ---------- */

function Line(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secure?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={[styles.lineLabel, focused && { color: theme.peach }]}>{props.label}</Text>
      <View style={styles.lineRow}>
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          style={styles.lineInput}
          secureTextEntry={props.secure}
          keyboardType={props.keyboardType}
          autoCapitalize={props.keyboardType === 'email-address' || props.secure !== undefined ? 'none' : 'words'}
          autoCorrect={false}
          autoComplete={props.autoComplete}
          selectionColor={theme.peach}
          onFocus={() => {
            setFocused(true);
            props.onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            props.onBlur?.();
          }}
          accessibilityLabel={props.label}
        />
        {props.onToggleSecure && (
          <Pressable onPress={props.onToggleSecure} hitSlop={10}>
            <Text style={styles.toggle}>{props.secure ? 'Show' : 'Hide'}</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.rule, focused && styles.ruleFocus, !!props.error && styles.ruleError]} />
      {!!props.error && <Text style={styles.error}>{props.error}</Text>}
    </View>
  );
}

/* ---------- screen ---------- */

export function AuthScreen() {
  const { login, register, notice } = useAuth();
  const { width } = useWindowDimensions();
  const lensSize = Math.min(width - 96, 300);
  const [mode, setMode] = useState<Mode>('login');
  const [v, setV] = useState<Record<Field, string>>({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);
  const [secure, setSecure] = useState(true);
  const [lens, setLens] = useState<Lens>('shut');
  const [reduceMotion, setReduceMotion] = useState(false);
  const passwordFocused = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const t = setTimeout(() => setLens('open'), 250);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => setMessage(notice), [notice]);

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduceMotion ? 0 : ms));

  const errors: Partial<Record<Field, string>> = {};
  if (mode === 'register' && v.name.trim().length < 2) errors.name = 'Add your name, at least 2 characters.';
  if (!EMAIL.test(v.email.trim())) errors.email = 'Enter an email like name@example.com.';
  if (mode === 'register') {
    if (v.password.length < 8) errors.password = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) errors.password = 'Mix in at least one letter and one number.';
  } else if (!v.password) errors.password = 'Enter your password.';
  const err = (f: Field) => serverErrors[f] ?? (touched[f] ? errors[f] : undefined);
  const strength = passwordStrength(v.password);
  const set = (f: Field) => (val: string) => {
    setV((s) => ({ ...s, [f]: val }));
    setServerErrors((s) => ({ ...s, [f]: undefined }));
  };

  const blink = async () => {
    setLens('blink');
    await wait(380);
    setLens(passwordFocused.current ? 'peek' : 'open');
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setTouched({});
    setServerErrors({});
    setMessage(null);
  };

  const submit = async () => {
    setTouched({ name: true, email: true, password: true });
    if (Object.keys(errors).length) return void blink();
    setBusy(true);
    setMessage(null);
    const enter = async () => {
      setLens('wide');
      await wait(700);
    };
    try {
      if (mode === 'register') await register(v.name.trim(), v.email.trim(), v.password, enter);
      else await login(v.email.trim(), v.password, enter);
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      setServerErrors((apiErr?.fields ?? {}) as Partial<Record<Field, string>>);
      setMessage(apiErr?.message ?? 'That didn’t go through. Check your connection and try again.');
      setBusy(false);
      void blink();
    }
  };

  const copy = COPY[mode];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.markRing}>
            <View style={styles.markDot} />
          </View>
          <Text style={styles.brandText}>Huddle</Text>
        </View>

        <View style={styles.lensWrap}>
          <View style={[styles.glow, { width: lensSize * 1.5, height: lensSize * 1.5, borderRadius: lensSize }]} />
          <View style={[styles.barrel, { width: lensSize + 20, height: lensSize + 20, borderRadius: (lensSize + 20) / 2 }]}>
            <Aperture size={lensSize} open={LENS_OPEN[lens]}>
              <LensScene size={lensSize} myName={mode === 'register' ? v.name : ''} />
            </Aperture>
          </View>
          <Text style={styles.caption}>{lens === 'peek' ? 'Lens closed while you type your password.' : ' '}</Text>
        </View>

        <Text style={styles.title}>{copy.title[0]}</Text>
        <Text style={[styles.title, { color: theme.peach }]}>{copy.title[1]}</Text>
        <Text style={styles.sub}>{copy.sub}</Text>

        <View style={styles.switch}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable key={m} onPress={() => switchMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} style={styles.switchBtn}>
              <Text style={[styles.switchText, mode === m && { color: theme.text }]}>{m === 'login' ? 'Sign in' : 'Create account'}</Text>
              <View style={[styles.switchBar, mode === m && { backgroundColor: theme.peach }]} />
            </Pressable>
          ))}
        </View>

        {message && <Text style={styles.message}>{message}</Text>}

        <View style={{ gap: 20 }}>
          {mode === 'register' && (
            <Line label="Your name" value={v.name} onChangeText={set('name')} error={err('name')} autoComplete="name" onBlur={() => v.name && setTouched((t) => ({ ...t, name: true }))} />
          )}
          <Line
            label="Email"
            value={v.email}
            onChangeText={set('email')}
            error={err('email')}
            keyboardType="email-address"
            autoComplete="email"
            onBlur={() => v.email && setTouched((t) => ({ ...t, email: true }))}
          />
          <Line
            label="Password"
            value={v.password}
            onChangeText={set('password')}
            error={err('password')}
            secure={secure}
            onToggleSecure={() => setSecure((s) => !s)}
            autoComplete={mode === 'login' ? 'password' : 'new-password'}
            onFocus={() => {
              passwordFocused.current = true;
              setLens('peek');
            }}
            onBlur={() => {
              passwordFocused.current = false;
              if (v.password) setTouched((t) => ({ ...t, password: true }));
              setLens((l) => (l === 'peek' ? 'open' : l));
            }}
          />
          {mode === 'register' && !!v.password && (
            <View style={styles.meter}>
              <View style={styles.meterTrack}>
                <View
                  style={{
                    width: `${strength.score * 25}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: [theme.coral, theme.coral, theme.amber, theme.mint, theme.mint][strength.score],
                  }}
                />
              </View>
              <Text style={styles.meterLabel}>{strength.label}</Text>
            </View>
          )}
        </View>

        <Pressable style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.98 }] }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={theme.ink} /> : <View style={styles.shutterDot} />}
          <Text style={styles.shutterText}>{busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : copy.cta}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  markRing: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.peach, alignItems: 'center', justifyContent: 'center' },
  markDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.peach },
  brandText: { color: theme.text, fontSize: 20, fontFamily: fonts.bold },
  lensWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 10 },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,201,60,0.10)' },
  barrel: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg2, borderWidth: 1, borderColor: 'rgba(255,201,60,0.2)' },
  caption: { color: theme.muted, fontSize: 13, marginTop: 10, fontFamily: fonts.regular },
  portraitInitials: { fontFamily: fonts.bold },
  tag: { position: 'absolute', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.overlay },
  tagText: { color: theme.text, fontSize: 13, fontFamily: fonts.bold },
  title: { color: theme.text, fontSize: 44, lineHeight: 44, letterSpacing: -2, fontFamily: fonts.bold },
  sub: { color: theme.muted, fontSize: 16, lineHeight: 23, marginTop: 10, marginBottom: 22, fontFamily: fonts.regular },
  switch: { flexDirection: 'row', gap: 26, borderBottomWidth: 1, borderBottomColor: theme.border, marginBottom: 22 },
  switchBtn: { paddingBottom: 0 },
  switchText: { color: theme.muted, fontSize: 16, paddingBottom: 10, fontFamily: fonts.bold },
  switchBar: { height: 3, borderRadius: 3, marginBottom: -1, backgroundColor: 'transparent' },
  message: { color: '#ffb4a2', fontSize: 15, lineHeight: 21, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: theme.coral, marginBottom: 18, fontFamily: fonts.regular },
  lineLabel: { color: theme.muted, fontSize: 14, marginBottom: 4, fontFamily: fonts.regular },
  lineRow: { flexDirection: 'row', alignItems: 'center' },
  lineInput: { flex: 1, color: theme.text, fontSize: 20, paddingVertical: 8, fontFamily: fonts.regular },
  toggle: { color: theme.muted, fontSize: 14, paddingLeft: 12, fontFamily: fonts.bold },
  rule: { height: 1, backgroundColor: 'rgba(253,246,227,0.22)' },
  ruleFocus: { height: 2, backgroundColor: theme.peach },
  ruleError: { backgroundColor: theme.coral },
  error: { color: '#ffb4a2', fontSize: 14, marginTop: 6, fontFamily: fonts.regular },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meterTrack: { flex: 1, height: 4, borderRadius: 4, backgroundColor: 'rgba(253,246,227,0.12)', overflow: 'hidden' },
  meterLabel: { color: theme.muted, fontSize: 13, minWidth: 70, textAlign: 'right', fontFamily: fonts.bold },
  shutter: {
    marginTop: 28,
    height: 58,
    borderRadius: 999,
    backgroundColor: theme.peach,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shutterDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.coral },
  shutterText: { color: theme.ink, fontSize: 18, fontFamily: fonts.bold },
});
