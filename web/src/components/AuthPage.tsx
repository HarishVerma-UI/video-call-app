import { ApiError, passwordStrength, type Providers } from '@vca/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../config';
import { Aperture } from './Aperture';
import { FacebookIcon, GitHubIcon, GoogleIcon } from './Icons';
import { Line } from './Line';
import { ModeToggle } from './ModeToggle';
import { uploadFile } from '../upload';

type Tab = 'login' | 'register';
type LoginMode = 'user' | 'recruiter';
type RegistrationRole = 'jobSeeker' | 'recruiter';
type RegistrationStep = 0 | 1;
type Fields = Partial<Record<'name' | 'email' | 'password' | 'cv' | 'recruiterCompany' | 'recruiterWebsite' | 'recruiterReason', string>>;
type InfoPage = 'about' | 'privacy';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CV_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

class RegistrationUploadError extends Error {}

function pathTab(): Tab {
  return location.pathname === '/register' ? 'register' : 'login';
}

function pathInfoPage(): InfoPage | null {
  if (location.pathname === '/about') return 'about';
  if (location.pathname === '/privacy') return 'privacy';
  return null;
}

/** Read ?oauth_error=… left by a failed social login redirect, then clean the URL. */
function readOAuthError(): string | null {
  try {
    const u = new URL(location.href);
    const err = u.searchParams.get('oauth_error');
    if (!err) return null;
    u.searchParams.delete('oauth_error');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    return err;
  } catch {
    return null;
  }
}

function startOAuth(provider: string) {
  const next = encodeURIComponent(location.pathname + location.search);
  window.location.href = `${API_BASE}/api/auth/oauth/${provider}/start?next=${next}`;
}

function SocialButtons({ providers }: { providers: Providers }) {
  const hasAny = providers.google || providers.github || providers.facebook;
  if (!hasAny) return null;
  return (
    <>
      <div className="social">
        {providers.google && (
          <button type="button" className="btn btn--social" onClick={() => startOAuth('google')} data-testid="oauth-google">
            <GoogleIcon /> Continue with Google
          </button>
        )}
        {providers.github && (
          <button type="button" className="btn btn--social" onClick={() => startOAuth('github')} data-testid="oauth-github">
            <GitHubIcon /> Continue with GitHub
          </button>
        )}
        {providers.facebook && (
          <button type="button" className="btn btn--social" onClick={() => startOAuth('facebook')} data-testid="oauth-facebook">
            <FacebookIcon /> Continue with Facebook
          </button>
        )}
      </div>
      <div className="or">
        <span>or use your email</span>
      </div>
    </>
  );
}

export function AuthPage() {
  const { api, login, register, notice } = useAuth();
  const [tab, setTabState] = useState<Tab>(pathTab);
  const infoPage = pathInfoPage();
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>(0);
  const [registrationRole, setRegistrationRole] = useState<RegistrationRole>('jobSeeker');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginMode, setLoginMode] = useState<LoginMode>('user');
  const [headline, setHeadline] = useState('');
  const [locationText, setLocationText] = useState('');
  const [mobile, setMobile] = useState('');
  const [skills, setSkills] = useState('');
  const [experienceTitle, setExperienceTitle] = useState('');
  const [experienceCompany, setExperienceCompany] = useState('');
  const [experienceStart, setExperienceStart] = useState('');
  const [experienceEnd, setExperienceEnd] = useState('');
  const [experienceDescription, setExperienceDescription] = useState('');
  const [educationSchool, setEducationSchool] = useState('');
  const [educationDegree, setEducationDegree] = useState('');
  const [educationYear, setEducationYear] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [recruiterCompany, setRecruiterCompany] = useState('');
  const [recruiterWebsite, setRecruiterWebsite] = useState('');
  const [recruiterReason, setRecruiterReason] = useState('');
  const [errors, setErrors] = useState<Fields>({});
  const [message, setMessage] = useState<string | null>(() => readOAuthError() ?? notice);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers>({});
  const strength = passwordStrength(password);
  const registrationSteps = ['Account details', registrationRole === 'recruiter' ? 'Recruiter details' : 'Professional profile'];

  useEffect(() => setMessage((m) => m ?? notice), [notice]);
  useEffect(() => {
    let cancelled = false;
    // Which social buttons to show is decided by the server's configuration.
    fetch(`${API_BASE}/api/auth/providers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.providers) setProviders(d.providers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = (t: Tab) => {
    setTabState(t);
    setRegistrationStep(0);
    setErrors({});
    setMessage(null);
    const path = t === 'register' ? '/register' : '/login';
    if (!location.pathname.startsWith('/r/') && location.pathname !== path) history.replaceState(null, '', path);
  };

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      setErrors(err.fields as Fields);
      setMessage(err.message);
    } else setMessage((err as Error)?.message ?? 'Something went wrong. Please try again.');
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage(null);
    const e: Fields = {};
    if (tab === 'login') {
      if (!EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
      if (!password) e.password = 'Enter your password.';
    } else if (registrationStep === 0) {
      if (name.trim().length < 2) e.name = 'Add your name, at least 2 characters.';
      if (!EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
      if (password.length < 8) e.password = 'Use at least 8 characters.';
      else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) e.password = 'Mix in at least one letter and one number.';
    } else if (registrationStep === 1 && registrationRole === 'jobSeeker') {
      if (cvFile && !CV_TYPES.includes(cvFile.type)) e.cv = 'Upload a PDF or Word document.';
      if (cvFile && cvFile.size > 10 * 1024 * 1024) e.cv = 'CV files must be 10 MB or smaller.';
    } else if (registrationStep === 1 && registrationRole === 'recruiter') {
      if (recruiterCompany.trim().length < 2) e.recruiterCompany = 'Enter your company or organization.';
      if (recruiterReason.trim().length < 10) e.recruiterReason = 'Tell us a little more about your recruiting work.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (tab === 'register' && registrationStep === 0) {
      setRegistrationStep(1);
      return;
    }
    setBusy(true);
    try {
      if (tab === 'login') {
        await login(email.trim(), password, loginMode);
      } else {
        const experience = [experienceTitle, experienceCompany, experienceStart, experienceEnd, experienceDescription].some((value) => value.trim())
          ? [{ title: experienceTitle.trim(), company: experienceCompany.trim(), start: experienceStart.trim(), end: experienceEnd.trim(), description: experienceDescription.trim() }]
          : [];
        const education = [educationSchool, educationDegree, educationYear].some((value) => value.trim())
          ? [{ school: educationSchool.trim(), degree: educationDegree.trim(), year: educationYear.trim() }]
          : [];
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          profile: registrationRole === 'jobSeeker'
            ? {
              headline: headline.trim(),
              location: locationText.trim(),
              mobile: mobile.trim(),
              skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean),
              experience,
              education,
            }
            : undefined,
          applyAsRecruiter: registrationRole === 'recruiter',
          recruiterApplication: registrationRole === 'recruiter'
            ? { company: recruiterCompany.trim(), website: recruiterWebsite.trim(), reason: recruiterReason.trim() }
            : undefined,
        }, async () => {
          if (registrationRole !== 'jobSeeker' || !cvFile) return;
          try {
            const cvKey = await uploadFile(api, 'cv', cvFile);
            await api.saveProfile({ cvKey, cvName: cvFile.name });
          } catch (error) {
            const detail = error instanceof Error ? ` ${error.message}` : '';
            throw new RegistrationUploadError(`Your account was created, but the CV upload failed.${detail} Sign in and upload it from your Profile.`);
          }
        });
      }
    } catch (err) {
      if (err instanceof RegistrationUploadError) {
        setTab('login');
        setMessage(err.message);
        setPassword('');
        setBusy(false);
      } else {
        setBusy(false);
        fail(err);
      }
      if (err instanceof ApiError && err.status === 401) setPassword('');
    }
  };

  return (
    <div className="auth">
      <main className="auth__panel">
        <ModeToggle className="auth__mode" />
        {infoPage ? (
          <section className="auth__card auth__card--wide" aria-labelledby="public-page-title">
            <div className="auth__brandmark" aria-label="Huddle">
              <Aperture open={0.42} className="mark" />
              <span>Huddle</span>
            </div>
            <a className="auth__back" href="/login">← Back to sign in</a>
            <h1 className="auth__title" id="public-page-title">{infoPage === 'about' ? 'About Huddle' : 'Privacy'}</h1>
            {infoPage === 'about' ? (
              <>
                <p>Huddle brings people together for video calls and helps members connect around professional opportunities.</p>
                <p>Members can build a profile and connect with others. Recruiter tools and job requirements are available only to accounts approved by an administrator.</p>
                <p>Recruiter applications are reviewed by the Huddle administrators. Choosing recruiter at sign-in does not grant access by itself.</p>
              </>
            ) : (
              <>
                <p>Huddle uses account information such as your name and email to provide sign-in and account services. Profile details you add, including work history, skills, location, and education, are used to support professional features.</p>
                <p>If you apply for recruiter access, the company, website, and explanation you submit are visible to administrators who review the application. Approved recruiters can use the recruiter features allowed by their account role.</p>
                <p>Video calls and messaging are provided as part of the service. Avoid adding sensitive information that is not needed for your profile. The operator of this Huddle deployment is responsible for configuring data retention and publishing any additional legal disclosures required for its users.</p>
              </>
            )}
            <a className="btn btn--primary btn--wide" href="/register">Create an account</a>
          </section>
        ) : <div className={`auth__card${tab === 'register' ? ' auth__card--wide' : ''}`}>
          <div className="auth__brandmark" aria-label="Huddle">
            <Aperture open={0.42} className="mark" />
            <span>Huddle</span>
          </div>
          <div className="seg" role="tablist" aria-label="Account">
            <button role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'is-on' : ''} onClick={() => setTab('login')} data-testid="tab-login">
              Sign in
            </button>
            <button role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'is-on' : ''} onClick={() => setTab('register')} data-testid="tab-register">
              Create account
            </button>
            <i className="seg__thumb" style={{ transform: `translateX(${tab === 'login' ? 0 : 100}%)` }} />
          </div>

          <h1 className="auth__title">
            {tab === 'login' ? 'Welcome back' : registrationStep === 0 ? 'Create your account' : registrationSteps[registrationStep]}
          </h1>
          <p className="auth__lede">
            {tab === 'login'
              ? 'Sign in with your email and password.'
              : registrationStep === 0
                ? 'Choose your account type and enter your sign-in details.'
                : registrationRole === 'recruiter'
                  ? 'Tell us about your organization. Recruiter access requires admin approval.'
                  : 'Add professional details and an optional CV to help others find you.'}
          </p>

          {tab === 'register' && (
            <ol className="auth-progress" aria-label="Registration progress">
              {registrationSteps.map((step, index) => (
                <li
                  key={step}
                  className={index === registrationStep ? 'is-current' : index < registrationStep ? 'is-complete' : ''}
                  aria-current={index === registrationStep ? 'step' : undefined}
                >
                  <span>{index < registrationStep ? '✓' : index + 1}</span>
                  <small>{step}</small>
                </li>
              ))}
            </ol>
          )}

          {message && (
            <p className="auth__msg" role="alert" data-testid="auth-message">
              {message}
            </p>
          )}

          {tab === 'login' && loginMode === 'user' && <SocialButtons providers={providers} />}
          {tab === 'login' && loginMode === 'recruiter' && <p className="auth__social-note">Use your approved recruiter account’s email and password.</p>}

          <form className="auth__form" onSubmit={submit} noValidate>
            {tab === 'login' && (
              <fieldset className="auth__role">
                <legend>Sign in as</legend>
                <label>
                  <input type="radio" name="login-mode" value="user" checked={loginMode === 'user'} onChange={() => setLoginMode('user')} />
                  Career Explorer
                </label>
                <label>
                  <input type="radio" name="login-mode" value="recruiter" checked={loginMode === 'recruiter'} onChange={() => setLoginMode('recruiter')} />
                  Talent Partner
                </label>
                {loginMode === 'recruiter' && <p>Recruiter access requires administrator approval.</p>}
              </fieldset>
            )}
            {tab === 'register' && registrationStep === 0 && (
              <>
                <fieldset className="auth__role">
                  <legend>I’m registering as</legend>
                  <label>
                    <input type="radio" name="registration-role" value="job-seeker" checked={registrationRole === 'jobSeeker'} onChange={() => setRegistrationRole('jobSeeker')} />
                    Career Explorer
                  </label>
                  <label>
                    <input type="radio" name="registration-role" value="recruiter" checked={registrationRole === 'recruiter'} onChange={() => setRegistrationRole('recruiter')} />
                    Talent Partner
                  </label>
                </fieldset>
                <Line name="name" label="Your name" type="text" autoComplete="name" value={name} onChange={setName} error={errors.name} />
              </>
            )}
            {(tab === 'login' || registrationStep === 0) && (
              <>
                <Line name="email" label="Email" type="email" autoComplete={tab === 'login' ? 'username' : 'email'} value={email} onChange={setEmail} error={errors.email} />
                <Line
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={setPassword}
                  error={errors.password}
                />
                {tab === 'register' && password && (
                  <div className={`meter meter--${strength.score}`} aria-live="polite">
                    <div className="meter__track">
                      <span style={{ width: `${strength.score * 25}%` }} />
                    </div>
                    <span className="meter__label">{strength.label}</span>
                  </div>
                )}
              </>
            )}
            {tab === 'register' && registrationStep === 1 && registrationRole === 'jobSeeker' && (
              <section className="auth__details" aria-label="Profile details">
                <p>Add your profile details now; you can update them later.</p>
                <Line name="headline" label="Job title or headline" type="text" autoComplete="organization-title" value={headline} onChange={setHeadline} />
                <div className="auth__field-grid">
                  <Line name="location" label="Location" type="text" autoComplete="address-level2" value={locationText} onChange={setLocationText} />
                  <Line name="mobile" label="Phone (optional)" type="tel" autoComplete="tel" value={mobile} onChange={setMobile} />
                  <Line name="skills" label="Skills (comma separated)" type="text" autoComplete="off" value={skills} onChange={setSkills} />
                </div>
                <h3>Experience</h3>
                <div className="auth__field-grid">
                  <Line name="experience-title" label="Role" type="text" autoComplete="off" value={experienceTitle} onChange={setExperienceTitle} />
                  <Line name="experience-company" label="Company" type="text" autoComplete="organization" value={experienceCompany} onChange={setExperienceCompany} />
                  <Line name="experience-start" label="From" type="text" autoComplete="off" value={experienceStart} onChange={setExperienceStart} />
                  <Line name="experience-end" label="To" type="text" autoComplete="off" value={experienceEnd} onChange={setExperienceEnd} />
                </div>
                <Line name="experience-description" label="Experience details (optional)" type="text" autoComplete="off" value={experienceDescription} onChange={setExperienceDescription} />
                <h3>Education</h3>
                <div className="auth__field-grid">
                  <Line name="education-school" label="School" type="text" autoComplete="organization" value={educationSchool} onChange={setEducationSchool} />
                  <Line name="education-degree" label="Degree or qualification" type="text" autoComplete="off" value={educationDegree} onChange={setEducationDegree} />
                  <Line name="education-year" label="Year" type="text" autoComplete="off" value={educationYear} onChange={setEducationYear} />
                </div>
                <label className={`auth__file${errors.cv ? ' has-error' : ''}`} htmlFor="registration-cv">
                  <span>CV or resume (optional)</span>
                  <input id="registration-cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setCvFile(event.target.files?.[0] ?? null)} />
                  <small>{errors.cv ?? (cvFile ? cvFile.name : 'PDF or Word document, up to 10 MB.')}</small>
                </label>
              </section>
            )}
            {tab === 'register' && registrationStep === 1 && registrationRole === 'recruiter' && (
              <section className="auth__details auth__application" aria-label="Recruiter application">
                <p>Your account will have standard access until an administrator approves your recruiter application.</p>
                <Line name="recruiter-company" label="Company or organization" type="text" autoComplete="organization" value={recruiterCompany} onChange={setRecruiterCompany} error={errors.recruiterCompany} />
                <Line name="recruiter-website" label="Company website (optional)" type="url" autoComplete="url" value={recruiterWebsite} onChange={setRecruiterWebsite} error={errors.recruiterWebsite} />
                <div className={`line${errors.recruiterReason ? ' line--error' : ''}`}>
                  <label htmlFor="recruiter-reason">Why do you need recruiter access?</label>
                  <textarea id="recruiter-reason" className="pp-textarea" rows={3} maxLength={1200} value={recruiterReason} onChange={(event) => setRecruiterReason(event.target.value)} />
                  <span className="line__rule" />
                  {errors.recruiterReason && <p className="line__error">{errors.recruiterReason}</p>}
                </div>
              </section>
            )}
            <div className="auth__actions">
              {tab === 'register' && registrationStep > 0 && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setRegistrationStep(0);
                    setErrors({});
                    setMessage(null);
                  }}
                  disabled={busy}
                >
                  Back
                </button>
              )}
              <button className="btn btn--primary" type="submit" disabled={busy} data-testid="password-submit">
                {busy
                  ? tab === 'login' ? 'Signing in…' : 'Creating…'
                  : tab === 'login' ? 'Sign in' : registrationStep === 0 ? 'Continue' : 'Create account'}
              </button>
            </div>
          </form>
        </div>}
        {!infoPage && <p className="auth__foot">Connect with people. Find your next opportunity.</p>}
        <nav className="auth__legal" aria-label="Legal and company information">
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          {infoPage && <a href="/register">Create account</a>}
        </nav>
      </main>
    </div>
  );
}
