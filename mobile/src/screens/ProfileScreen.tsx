import { ApiError, colorFor, initials, passwordStrength } from '@vca/shared';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth';
import { fonts, theme } from '../config';

type Fields = Record<string, string | undefined>;
type Msg = { ok: boolean; text: string } | null;

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={[styles.label, focused && { color: theme.accentText }]}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        keyboardType={props.keyboardType}
        autoCapitalize={props.keyboardType === 'email-address' || props.secure ? 'none' : 'words'}
        autoCorrect={false}
        autoComplete={props.autoComplete}
        selectionColor={theme.accentText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.input}
        accessibilityLabel={props.label}
      />
      <View style={[styles.rule, focused && styles.ruleFocus, !!props.error && styles.ruleError]} />
      {!!props.error && <Text style={styles.error}>{props.error}</Text>}
    </View>
  );
}

/** Edit name, email and password; sign out lives here too. */
export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { user, updateProfile, changePassword, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPw, setEmailPw] = useState('');
  const [dErr, setDErr] = useState<Fields>({});
  const [dMsg, setDMsg] = useState<Msg>(null);
  const [savingD, setSavingD] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pErr, setPErr] = useState<Fields>({});
  const [pMsg, setPMsg] = useState<Msg>(null);
  const [savingP, setSavingP] = useState(false);
  if (!user) return null;

  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = name.trim().replace(/\s+/g, ' ') !== user.name || emailChanged;
  const strength = passwordStrength(next);

  const saveDetails = async () => {
    setDMsg(null);
    const errs: Fields = {};
    if (name.trim().length < 2) errs.name = 'Use at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter an email like name@example.com.';
    if (emailChanged && !emailPw) errs.currentPassword = 'Enter your current password to change your email.';
    setDErr(errs);
    if (Object.keys(errs).length) return;
    setSavingD(true);
    try {
      const u = await updateProfile({ name: name.trim(), ...(emailChanged ? { email: email.trim(), currentPassword: emailPw } : {}) });
      setName(u.name);
      setEmail(u.email);
      setEmailPw('');
      setDMsg({ ok: true, text: 'Saved. People in your next call will see the new details.' });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setDErr(err?.fields ?? {});
      setDMsg({ ok: false, text: err?.message ?? 'Couldn’t save. Check your connection and try again.' });
    } finally {
      setSavingD(false);
    }
  };

  const savePassword = async () => {
    setPMsg(null);
    const errs: Fields = {};
    if (!current) errs.currentPassword = 'Enter your current password.';
    if (next.length < 8) errs.newPassword = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) errs.newPassword = 'Mix in at least one letter and one number.';
    setPErr(errs);
    if (Object.keys(errs).length) return;
    setSavingP(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setPMsg({ ok: true, text: 'Password changed. Your other devices have been signed out.' });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setPErr(err?.fields ?? {});
      setPMsg({ ok: false, text: err?.message ?? 'Couldn’t change your password. Try again.' });
    } finally {
      setSavingP(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: colorFor(user.id) }]}>
            <Text style={styles.avatarText}>{initials(name || user.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your profile</Text>
            <Text style={styles.sub}>Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          </View>
        </View>

        <Text style={styles.section}>Details</Text>
        <View style={{ gap: 18 }}>
          <Field label="Name" value={name} onChangeText={setName} error={dErr.name} autoComplete="name" />
          <Field label="Email" value={email} onChangeText={setEmail} error={dErr.email} keyboardType="email-address" autoComplete="email" />
          {emailChanged && (
            <Field
              label="Current password (to confirm the new email)"
              value={emailPw}
              onChangeText={setEmailPw}
              error={dErr.currentPassword}
              secure
              autoComplete="password"
            />
          )}
        </View>
        {dMsg && <Text style={[styles.msg, dMsg.ok && styles.msgOk]}>{dMsg.text}</Text>}
        <Pressable style={[styles.primary, (!dirty || savingD) && { opacity: 0.5 }]} onPress={saveDetails} disabled={!dirty || savingD}>
          {savingD ? <ActivityIndicator color={theme.ink} /> : <Text style={styles.primaryText}>Save changes</Text>}
        </Pressable>

        <Text style={[styles.section, { marginTop: 32 }]}>Password</Text>
        <View style={{ gap: 18 }}>
          <Field label="Current password" value={current} onChangeText={setCurrent} error={pErr.currentPassword} secure autoComplete="password" />
          <Field label="New password" value={next} onChangeText={setNext} error={pErr.newPassword} secure autoComplete="new-password" />
          {!!next && (
            <View style={styles.meter}>
              <View style={styles.meterTrack}>
                <View
                  style={{
                    width: `${strength.score * 25}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: [theme.hot, theme.hot, theme.amber, theme.cool, theme.cool][strength.score],
                  }}
                />
              </View>
              <Text style={styles.meterLabel}>{strength.label}</Text>
            </View>
          )}
        </View>
        {pMsg && <Text style={[styles.msg, pMsg.ok && styles.msgOk]}>{pMsg.text}</Text>}
        <Pressable style={[styles.secondary, (!current || !next || savingP) && { opacity: 0.5 }]} onPress={savePassword} disabled={!current || !next || savingP}>
          <Text style={styles.secondaryText}>{savingP ? 'Changing…' : 'Change password'}</Text>
        </Pressable>
        <Text style={styles.note}>Changing your password signs you out on your other devices.</Text>

        <Pressable style={styles.signOut} onPress={() => void logout()} accessibilityRole="button">
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 22, paddingBottom: 48 },
  back: { color: theme.muted, fontSize: 16, fontFamily: fonts.bold, marginBottom: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.accent },
  avatarText: { color: theme.ink, fontSize: 22, fontFamily: fonts.bold },
  title: { color: theme.text, fontSize: 28, fontFamily: fonts.bold, letterSpacing: -1 },
  sub: { color: theme.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 2 },
  section: { color: theme.muted, fontSize: 15, fontFamily: fonts.bold, marginBottom: 14 },
  label: { color: theme.muted, fontSize: 14, fontFamily: fonts.regular, marginBottom: 4 },
  input: { color: theme.text, fontSize: 19, fontFamily: fonts.regular, paddingVertical: 8 },
  rule: { height: 1, backgroundColor: theme.border },
  ruleFocus: { height: 2, backgroundColor: theme.accentText },
  ruleError: { backgroundColor: theme.hot },
  error: { color: theme.hotSoft, fontSize: 14, fontFamily: fonts.regular, marginTop: 6 },
  msg: { marginTop: 16, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: theme.hot, color: theme.hotSoft, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  msgOk: { borderLeftColor: theme.cool, color: theme.text },
  primary: { marginTop: 20, height: 54, borderRadius: 999, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.ink, fontSize: 17, fontFamily: fonts.bold },
  secondary: { marginTop: 20, alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 },
  secondaryText: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  note: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 10 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meterTrack: { flex: 1, height: 4, borderRadius: 4, backgroundColor: theme.surface2, overflow: 'hidden' },
  meterLabel: { color: theme.muted, fontSize: 13, minWidth: 70, textAlign: 'right', fontFamily: fonts.bold },
  signOut: { marginTop: 40, alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12 },
  signOutText: { color: theme.hotSoft, fontSize: 16, fontFamily: fonts.bold },
});
