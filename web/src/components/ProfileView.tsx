import { ApiError, passwordStrength } from '@vca/shared';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { activeLocale as activeLocaleFor, CURRENCIES, LANGUAGES, setCurrency, setLanguage, useMoney, type CurrencyCode, type LanguageCode } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { KeyIcon, SignOutIcon } from './Icons';
import { Line } from './Line';
import { ProfileAvatar } from './social/common';
import { ProfessionalProfile } from './social/ProfessionalProfile';

type Fields = Record<string, string | undefined>;
type Msg = { ok: boolean; text: string } | null;
type ProfileTab = 'account' | 'basics' | 'exp_edu' | 'preferences' | 'security';

function Status({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={`form-msg${msg.ok ? ' form-msg--ok' : ''}`} role="status">
      {msg.text}
    </p>
  );
}

/** Language + currency pickers. Both apply instantly and are remembered on this device. */
function PreferencesCard() {
  const { t, i18n } = useTranslation();
  const { currency, money } = useMoney();
  return (
    <section id="sec-preferences" className="card profile-settings__card profile-prefs" aria-labelledby="prefs-h">
      <header className="card__head">
        <span className="card__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
        </span>
        <div>
          <h2 id="prefs-h">{t('settings.prefs.title')}</h2>
          <p>{t('settings.prefs.description')}</p>
        </div>
      </header>
      <div className="card__grid profile-prefs__grid">
        <label className="profile-prefs__field">
          <span>{t('settings.prefs.language')}</span>
          <select value={i18n.resolvedLanguage ?? 'en'} onChange={(e) => setLanguage(e.target.value as LanguageCode)} data-testid="pref-language">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="profile-prefs__field">
          <span>{t('settings.prefs.currency')}</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} data-testid="pref-currency">
            {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].label}</option>)}
          </select>
        </label>
      </div>
      <p className="profile-prefs__preview">{t('settings.prefs.preview', { amount: money(1_800_000, 'INR', false) })}</p>
      <p className="profile-prefs__note">{t('settings.prefs.currencyNote')}</p>
    </section>
  );
}

export function ProfileView({ onPreviewPublicProfile, onOpenCareerStudio, initialTab }: { onPreviewPublicProfile: () => void; onOpenCareerStudio: () => void; initialTab?: 'basics' }) {
  const { user, photoUrl, updateProfile, changePassword, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [profileTab, setProfileTab] = useState<ProfileTab>(initialTab ?? 'account');
  const [completion, setCompletion] = useState(0);
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
  const onCompletionChange = useCallback((value: number) => setCompletion(value), []);

  if (!user) return null;

  const hasPassword = user.hasPassword !== false;
  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = name.trim().replace(/\s+/g, ' ') !== user.name || emailChanged;
  const strength = passwordStrength(next);
  const tabs: { id: ProfileTab; label: string }[] = [
    { id: 'account', label: t('settings.tabs.account') },
    { id: 'basics', label: t('settings.tabs.basics') },
    { id: 'exp_edu', label: t('settings.tabs.expEdu') },
    { id: 'preferences', label: t('settings.tabs.preferences') },
    { id: 'security', label: t('settings.tabs.security') },
  ];

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault();
    setDMsg(null);
    const errs: Fields = {};
    if (name.trim().length < 2) errs.name = 'Use at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter an email like name@example.com.';
    if (emailChanged && hasPassword && !emailPw) errs.currentPassword = 'Enter your current password to change your email.';
    setDErr(errs);
    if (Object.keys(errs).length) return;
    setSavingD(true);
    try {
      const u = await updateProfile({
        name: name.trim(),
        ...(emailChanged ? { email: email.trim(), ...(hasPassword ? { currentPassword: emailPw } : {}) } : {}),
      });
      setName(u.name);
      setEmail(u.email);
      setEmailPw('');
      setDMsg({ ok: true, text: 'Saved. People in your next meeting will see the new details.' });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setDErr(apiErr?.fields ?? {});
      setDMsg({ ok: false, text: apiErr?.message ?? 'Couldn’t save. Check your connection and try again.' });
    } finally {
      setSavingD(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPMsg(null);
    const errs: Fields = {};
    if (hasPassword && !current) errs.currentPassword = 'Enter your current password.';
    if (next.length < 8) errs.newPassword = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) errs.newPassword = 'Mix in at least one letter and one number.';
    setPErr(errs);
    if (Object.keys(errs).length) return;
    setSavingP(true);
    try {
      await changePassword(hasPassword ? current : null, next);
      setCurrent('');
      setNext('');
      setPMsg({
        ok: true,
        text: hasPassword ? 'Password changed. Your other devices have been signed out.' : 'Password added. You can now sign in with your email too.',
      });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPErr(apiErr?.fields ?? {});
      setPMsg({ ok: false, text: apiErr?.message ?? 'Couldn’t change your password. Try again.' });
    } finally {
      setSavingP(false);
    }
  };

  return (
    <section className="page profile-settings-page" aria-label="Your profile settings" data-testid="profile">
      <header className="profile-settings__heading">
        <div>
          <span className="profile-settings__eyebrow">{t('settings.eyebrow')}</span>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>
      </header>

      <section className="profile-settings__hero">
        <div className="profile-settings__hero-bar">
          <span>{t('settings.memberSince', { date: new Date(user.createdAt).toLocaleDateString(activeLocaleFor(i18n.language), { month: 'long', year: 'numeric' }) })}</span>
          <div>
            <button type="button" className="btn btn--secondary btn--small" onClick={onPreviewPublicProfile}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
              {t('settings.previewProfile')}
            </button>
            <button type="button" className="btn btn--secondary btn--small profile-settings__signout" onClick={() => logout()} data-testid="sign-out">
              <SignOutIcon width={15} height={15} /> {t('top.signOut')}
            </button>
          </div>
        </div>
        <div className="profile-settings__hero-body">
          <ProfileAvatar profile={{ userId: user.id, name: name || user.name, photoUrl }} size={74} />
          <div className="profile-settings__identity">
            <h2>{name || user.name}</h2>
            <p>{email || 'No email'}</p>
            <span>{t('settings.identityHint')}</span>
          </div>
          <button type="button" className="btn btn--primary profile-settings__career" onClick={onOpenCareerStudio}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>
            {t('settings.polishCv')}
          </button>
        </div>
      </section>

      <div className="profile-settings__layout">
        <aside className="profile-settings__rail" aria-label="Profile settings navigation">
          <section className="profile-settings__side-card">
            <div className="profile-settings__progress-head">
              <div>
                <h2>{t('settings.strength')}</h2>
                <p>{completion >= 70 ? t('settings.gateUnlocked') : t('settings.gateLocked')}</p>
              </div>
              <strong className={completion >= 70 ? 'is-complete' : ''}>{completion}%</strong>
            </div>
            <div className="profile-settings__progress">
              <span style={{ width: `${completion}%` }} />
              <i title="70% job application gate" />
            </div>
            <div className="profile-settings__progress-labels"><span>0%</span><b>{t('settings.jobGate')}</b><span>100%</span></div>
          </section>

          {/* The one section menu (no separate tab bar, so nothing is listed twice). */}
          <nav className="profile-settings__side-card profile-settings__quick-jump" aria-label={t('settings.quickJump')} data-testid="settings-sections">
            <h2>{t('settings.quickJump')}</h2>
            {tabs.map((item) => (
              <button key={item.id} type="button" className={profileTab === item.id ? 'is-on' : ''} onClick={() => setProfileTab(item.id)} aria-current={profileTab === item.id ? 'page' : undefined} data-testid={`settings-tab-${item.id}`}>
                <span>{item.label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </nav>
          <div className="profile-settings__privacy-note">
            <KeyIcon width={16} height={16} />
            <p>{t('settings.privacyNote')}</p>
          </div>
        </aside>

        <main className="profile-settings__editor">
          {profileTab === 'account' && (
            <form id="sec-account-details" className="card profile-settings__card" onSubmit={saveDetails} noValidate aria-labelledby="details-h">
              <header className="card__head">
                <div>
                  <h2 id="details-h">{t('settings.tabs.account')}</h2>
                  <p>Used to sign in to Huddle and shown to people in your meetings.</p>
                </div>
              </header>
              <div className="card__grid">
                <Line name="name" label="Name" type="text" autoComplete="name" value={name} onChange={setName} error={dErr.name} />
                <Line name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={dErr.email} />
              </div>
              {emailChanged && hasPassword && (
                <Line
                  name="currentPassword"
                  label="Current password (to confirm the new email)"
                  type="password"
                  autoComplete="current-password"
                  value={emailPw}
                  onChange={setEmailPw}
                  error={dErr.currentPassword}
                />
              )}
              <div className="profile-settings__card-actions">
                <Status msg={dMsg} />
                <button className="btn btn--primary" type="submit" disabled={savingD || !dirty} data-testid="save-details">
                  {savingD ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}

          {/* Always mounted: it reports profile completion to the strength meter. */}
          <ProfessionalProfile profileTab={profileTab} onCompletionChange={onCompletionChange} />

          {profileTab === 'preferences' && <PreferencesCard />}

          {profileTab === 'security' && (
            <section id="sec-security" className="profile-settings__security">
              <form id="sec-password" className="card profile-settings__card" onSubmit={savePassword} noValidate aria-labelledby="pw-h">
                <header className="card__head">
                  <span className="card__icon"><KeyIcon width={20} height={20} /></span>
                  <div>
                    <h2 id="pw-h">{hasPassword ? 'Password & security' : 'Add a password'}</h2>
                    <p>
                      {hasPassword
                        ? 'Changing your password signs you out on your other devices.'
                        : 'Your account signs in with social login. Add a password so you can also sign in with your email.'}
                    </p>
                  </div>
                </header>
                <div className="card__grid">
                  {hasPassword && (
                    <Line name="currentPassword" label="Current password" type="password" autoComplete="current-password" value={current} onChange={setCurrent} error={pErr.currentPassword} />
                  )}
                  <Line name="newPassword" label={hasPassword ? 'New password' : 'Password'} type="password" autoComplete="new-password" value={next} onChange={setNext} error={pErr.newPassword} />
                </div>
                {next && (
                  <div className={`meter meter--${strength.score}`} aria-live="polite">
                    <div className="meter__track"><span style={{ width: `${strength.score * 25}%` }} /></div>
                    <span className="meter__label">{strength.label}</span>
                  </div>
                )}
                <Status msg={pMsg} />
                <button className="btn btn--secondary" type="submit" disabled={savingP || !next || (hasPassword && !current)} data-testid="save-password">
                  {savingP ? 'Saving…' : hasPassword ? 'Change password' : 'Add password'}
                </button>
              </form>
            </section>
          )}
        </main>
      </div>
    </section>
  );
}
