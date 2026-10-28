import { ApiError, passwordStrength } from '@vca/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth';
import { Aperture } from '../components/Aperture';
import { fonts, theme } from '../config';
import { FaceCancelled } from '../faceUnlock';

type Tab = 'login' | 'register';
type Face = 'idle' | 'busy' | 'done';
type Fields = Partial<Record<'name' | 'email' | 'password', string>>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secure?: boolean;
  email?: boolean;
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        keyboardType={props.email ? 'email-address' : 'default'}
        autoCapitalize={props.email || props.secure ? 'none' : 'words'}
        autoCorrect={false}
        autoComplete={props.autoComplete}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[styles.input, focus && styles.inputFocus, !!props.error && { borderColor: theme.hot }]}
        placeholderTextColor={theme.faint}
        accessibilityLabel={props.label}
      />
      {!!props.error && <Text style={styles.error}>{props.error}</Text>}
    </View>
  );
}

/** The big "use your face" button. */
function FaceButton({ state, title, hint, onPress }: { state: Face; title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={state !== 'idle'}
      style={({ pressed }) => [styles.faceBtn, state === 'done' && { backgroundColor: theme.live }, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.faceIcon}>
        {state === 'busy' ? <ActivityIndicator color="#ffd08a" /> : <Text style={styles.faceGlyph}>{state === 'done' ? '✓' : '◉'}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.faceTitle}>{state === 'busy' ? 'Look at your phone…' : state === 'done' ? 'Verified' : title}</Text>
        <Text style={styles.faceHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

export function AuthScreen() {
  const { login, register, loginWithFace, registerWithFace, face, notice } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Fields>({});
  const [message, setMessage] = useState<string | null>(notice);
  const [faceState, setFaceState] = useState<Face>('idle');
  const [busy, setBusy] = useState(false);
  const [usePassword, setUsePassword] = useState(!face.available);
  const strength = passwordStrength(password);
  // Face support is checked asynchronously at launch; prefer it once we know.
  useEffect(() => setUsePassword(!face.available), [face.available]);
  useEffect(() => setMessage(notice), [notice]);
  const hint = `Uses ${face.label} on this phone. Your face never leaves it.`;

  const switchTab = (t: Tab) => {
    setTab(t);
    setErrors({});
    setMessage(null);
  };
  const celebrate = async () => {
    setFaceState('done');
    await wait(500);
  };
  const fail = (err: unknown) => {
    setFaceState('idle');
    setBusy(false);
    if (err instanceof FaceCancelled) setMessage('Face sign-in was cancelled. Try again, or use your email and password.');
    else if (err instanceof ApiError) {
      setErrors(err.fields as Fields);
      setMessage(err.message);
    } else setMessage((err as Error)?.message ?? 'Something went wrong. Please try again.');
  };
  const checkNameEmail = (): Fields => {
    const e: Fields = {};
    if (name.trim().length < 2) e.name = 'Add your name, at least 2 characters.';
    if (!EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
    return e;
  };

  const faceLogin = async () => {
    setMessage(null);
    setFaceState('busy');
    try {
      await loginWithFace(celebrate);
    } catch (err) {
      fail(err);
    }
  };
  const faceRegister = async () => {
    setMessage(null);
    const e = checkNameEmail();
    setErrors(e);
    if (Object.keys(e).length) return;
    setFaceState('busy');
    try {
      await registerWithFace(name.trim(), email.trim(), celebrate);
    } catch (err) {
      fail(err);
    }
  };
  const submitPassword = async () => {
    setMessage(null);
    const e: Fields = tab === 'register' ? checkNameEmail() : {};
    if (tab === 'login' && !EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
    if (tab === 'login' && !password) e.password = 'Enter your password.';
    if (tab === 'register') {
      if (password.length < 8) e.password = 'Use at least 8 characters.';
      else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) e.password = 'Mix in at least one letter and one number.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (tab === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (err) {
      fail(err);
    }
  };

  const first = face.meta?.name.split(' ')[0];
  const lens = faceState === 'busy' ? 0.2 : faceState === 'done' ? 1 : 0.6;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark} />
            <Text style={styles.logo}>Huddle</Text>
          </View>
          <View style={styles.lensWrap}>
            <Aperture size={120} open={lens}>
              <View style={styles.lensFace}>
                <Text style={{ fontSize: 36, color: '#ffd08a' }}>◉</Text>
              </View>
            </Aperture>
          </View>
          <Text style={styles.pitch}>Meet face to face.{'\n'}Sign in the same way.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.seg}>
            {(['login', 'register'] as Tab[]).map((t) => (
              <Pressable key={t} onPress={() => switchTab(t)} style={[styles.segBtn, tab === t && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
                <Text style={[styles.segText, tab === t && { color: theme.text }]}>{t === 'login' ? 'Sign in' : 'Create account'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.title}>{tab === 'login' ? (first ? `Welcome back, ${first}` : 'Welcome back') : 'Create your account'}</Text>
          <Text style={styles.sub}>
            {tab === 'login'
              ? face.meta
                ? `Sign in as ${face.meta.email} with ${face.label}.`
                : 'Sign in with your email. You can turn on face sign-in after.'
              : 'Your face unlocks your account. You can add a password later as a backup.'}
          </Text>

          {!!message && <Text style={styles.msg}>{message}</Text>}

          {tab === 'login' ? (
            <>
              {face.available && face.meta && <FaceButton state={faceState} title={`Sign in with ${face.label}`} hint={hint} onPress={() => void faceLogin()} />}
              {face.available && face.meta && <Text style={styles.or}>or use your email</Text>}
              <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} email autoComplete="email" />
              <Field label="Password" value={password} onChangeText={setPassword} error={errors.password} secure autoComplete="password" />
              <Pressable style={[styles.secondary, busy && { opacity: 0.6 }]} onPress={() => void submitPassword()} disabled={busy}>
                <Text style={styles.secondaryText}>{busy ? 'Signing in…' : 'Sign in with password'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Field label="Your name" value={name} onChangeText={setName} error={errors.name} autoComplete="name" />
              <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} email autoComplete="email" />
              {!usePassword ? (
                <>
                  <FaceButton state={faceState} title={`Create with ${face.label}`} hint={hint} onPress={() => void faceRegister()} />
                  <Pressable onPress={() => setUsePassword(true)} style={styles.linkWrap}>
                    <Text style={styles.link}>Use a password instead</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Field label="Password" value={password} onChangeText={setPassword} error={errors.password} secure autoComplete="new-password" />
                  {!!password && (
                    <View style={styles.meter}>
                      <View style={styles.meterTrack}>
                        <View
                          style={{
                            width: `${strength.score * 25}%`,
                            height: '100%',
                            borderRadius: 4,
                            backgroundColor: strength.score >= 3 ? theme.live : strength.score === 2 ? theme.accent : theme.hot,
                          }}
                        />
                      </View>
                      <Text style={styles.meterLabel}>{strength.label}</Text>
                    </View>
                  )}
                  <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={() => void submitPassword()} disabled={busy}>
                    <Text style={styles.primaryText}>{busy ? 'Creating…' : 'Create account'}</Text>
                  </Pressable>
                  {face.available && (
                    <Pressable onPress={() => setUsePassword(false)} style={styles.linkWrap}>
                      <Text style={styles.link}>Use {face.label} instead</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}
          {!face.available && <Text style={styles.fine}>Set up Face ID, face unlock or a fingerprint on this phone to sign in with your face.</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40, backgroundColor: theme.bg, flexGrow: 1 },
  brand: { backgroundColor: '#1d1d4a', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 54 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 24, height: 24, borderRadius: 12, borderWidth: 5, borderColor: '#ffb547', backgroundColor: '#5b5fc7' },
  logo: { color: '#f4f3ff', fontSize: 18, fontFamily: fonts.bold },
  lensWrap: { alignItems: 'center', marginTop: 18 },
  lensFace: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2c2d72' },
  pitch: { color: '#f4f3ff', fontSize: 24, lineHeight: 30, fontFamily: fonts.bold, marginTop: 18, letterSpacing: -0.5 },
  card: { marginTop: -32, marginHorizontal: 16, padding: 20, gap: 14, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 9, backgroundColor: theme.surface2 },
  segBtn: { flex: 1, height: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: theme.surface, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { color: theme.muted, fontFamily: fonts.bold, fontSize: 14 },
  title: { color: theme.text, fontSize: 24, fontFamily: fonts.bold, marginTop: 4 },
  sub: { color: theme.muted, fontSize: 14, lineHeight: 20, marginTop: -6, fontFamily: fonts.regular },
  msg: { color: theme.text, fontSize: 14, lineHeight: 20, padding: 10, borderLeftWidth: 3, borderLeftColor: theme.hot, backgroundColor: theme.surface2, borderRadius: 6, fontFamily: fonts.regular },
  label: { color: theme.muted, fontSize: 13, fontFamily: fonts.bold },
  input: { height: 46, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text, paddingHorizontal: 12, fontSize: 16 },
  inputFocus: { borderColor: theme.primary, borderBottomWidth: 2 },
  error: { color: theme.hotSoft, fontSize: 13, fontFamily: fonts.regular },
  faceBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 14, backgroundColor: theme.primary },
  faceIcon: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  faceGlyph: { color: '#ffd08a', fontSize: 26 },
  faceTitle: { color: '#fff', fontSize: 17, fontFamily: fonts.bold },
  faceHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2, fontFamily: fonts.regular },
  or: { color: theme.faint, textAlign: 'center', fontSize: 12, fontFamily: fonts.regular },
  primary: { height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary },
  primaryText: { color: theme.onPrimary, fontSize: 16, fontFamily: fonts.bold },
  secondary: { height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  secondaryText: { color: theme.text, fontSize: 16, fontFamily: fonts.bold },
  linkWrap: { alignSelf: 'center', padding: 6 },
  link: { color: theme.primaryText, fontFamily: fonts.bold, fontSize: 14 },
  fine: { color: theme.faint, fontSize: 12, textAlign: 'center', fontFamily: fonts.regular },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meterTrack: { flex: 1, height: 4, borderRadius: 4, backgroundColor: theme.surface2, overflow: 'hidden' },
  meterLabel: { color: theme.muted, fontSize: 12, minWidth: 64, textAlign: 'right', fontFamily: fonts.bold },
});
