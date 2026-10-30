import { ApiError, type Education, type Experience, type Profile } from '@vca/shared';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { uploadFile } from '../../upload';
import { Line } from '../Line';
import { ProfileAvatar } from './common';

type Msg = { ok: boolean; text: string } | null;
const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function ProfessionalProfile() {
  const { api, user } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [mobile, setMobile] = useState('');
  const [skills, setSkills] = useState('');
  const [focus, setFocus] = useState('');
  const [mentor, setMentor] = useState(false);
  const [mentee, setMentee] = useState(false);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [busyCv, setBusyCv] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const cvInput = useRef<HTMLInputElement>(null);

  const fill = (prof: Profile) => {
    setP(prof);
    setHeadline(prof.headline ?? '');
    setBio(prof.bio ?? '');
    setLocation(prof.location ?? '');
    setMobile(prof.mobile ?? '');
    setSkills((prof.skills ?? []).join(', '));
    setFocus((prof.focusAreas ?? []).join(', '));
    setMentor(!!prof.mentor);
    setMentee(!!prof.mentee);
    setExperience(prof.experience ?? []);
    setEducation(prof.education ?? []);
  };

  useEffect(() => {
    api.myProfile().then(({ profile }) => fill(profile)).catch(() => setMsg({ ok: false, text: "Couldn't load your profile." }));
  }, [api]);

  const fields = () => ({
    headline,
    bio,
    location,
    mobile,
    skills: toList(skills),
    focusAreas: toList(focus),
    mentor,
    mentee,
    experience: experience.filter((e) => e.title || e.company),
    education: education.filter((e) => e.school || e.degree),
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const { profile } = await api.saveProfile(fields());
      fill(profile);
      setMsg({ ok: true, text: 'Profile saved.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't save your profile." });
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyPhoto(true);
    setMsg(null);
    try {
      const photoKey = await uploadFile(api, 'photo', file);
      const { profile } = await api.saveProfile({ ...fields(), photoKey });
      fill(profile);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : (err as Error).message });
    } finally {
      setBusyPhoto(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  };

  const onCv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyCv(true);
    setMsg(null);
    try {
      const cvKey = await uploadFile(api, 'cv', file);
      const { profile } = await api.saveProfile({ ...fields(), cvKey, cvName: file.name });
      fill(profile);
      setMsg({ ok: true, text: 'CV uploaded.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : (err as Error).message });
    } finally {
      setBusyCv(false);
      if (cvInput.current) cvInput.current.value = '';
    }
  };

  const setExp = (i: number, patch: Partial<Experience>) => setExperience((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setEdu = (i: number, patch: Partial<Education>) => setEducation((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (!p || !user) return null;

  return (
    <form className="card" onSubmit={save} noValidate aria-labelledby="pp-h">
      <header className="card__head">
        <div>
          <h2 id="pp-h">Your professional profile</h2>
          <p>This is what mentors and connections see. Private details (mobile, CV) show only to accepted connections.</p>
        </div>
      </header>

      <div className="pp-photo">
        <ProfileAvatar profile={{ userId: user.id, name: user.name, photoUrl: p.photoUrl }} size={72} />
        <div>
          <button type="button" className="btn btn--secondary btn--small" disabled={busyPhoto} onClick={() => photoInput.current?.click()}>
            {busyPhoto ? 'Uploading…' : p.photoUrl ? 'Change photo' : 'Upload photo'}
          </button>
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e)} />
        </div>
      </div>

      <div className="card__grid">
        <Line name="headline" label="Headline" type="text" autoComplete="off" value={headline} onChange={setHeadline} />
        <Line name="location" label="Location" type="text" autoComplete="off" value={location} onChange={setLocation} />
      </div>
      <label className="line">
        <span>About you</span>
        <textarea className="pp-textarea" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="A short bio" />
      </label>
      <div className="card__grid">
        <Line name="mobile" label="Mobile (private)" type="text" autoComplete="off" value={mobile} onChange={setMobile} />
        <Line name="skills" label="Skills (comma separated)" type="text" autoComplete="off" value={skills} onChange={setSkills} />
      </div>
      <Line name="focus" label="Focus areas (comma separated)" type="text" autoComplete="off" value={focus} onChange={setFocus} />

      <div className="pp-flags">
        <label><input type="checkbox" checked={mentee} onChange={(e) => setMentee(e.target.checked)} /> I&apos;m looking for mentorship</label>
        <label><input type="checkbox" checked={mentor} onChange={(e) => setMentor(e.target.checked)} /> I&apos;m available as a mentor</label>
      </div>

      <div className="pp-cv">
        <span>{p.hasCv ? `CV: ${p.cvName || 'uploaded'}` : 'No CV uploaded'}</span>
        <button type="button" className="btn btn--secondary btn--small" disabled={busyCv} onClick={() => cvInput.current?.click()}>
          {busyCv ? 'Uploading…' : p.hasCv ? 'Replace CV' : 'Upload CV'}
        </button>
        <input ref={cvInput} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => void onCv(e)} />
      </div>

      <section className="pp-repeat">
        <h3>Experience</h3>
        {experience.map((x, i) => (
          <div className="pp-row" key={i}>
            <input placeholder="Title" value={x.title} onChange={(e) => setExp(i, { title: e.target.value })} />
            <input placeholder="Company" value={x.company} onChange={(e) => setExp(i, { company: e.target.value })} />
            <input placeholder="From" value={x.start} onChange={(e) => setExp(i, { start: e.target.value })} />
            <input placeholder="To" value={x.end} onChange={(e) => setExp(i, { end: e.target.value })} />
            <button type="button" className="link-btn" onClick={() => setExperience((xs) => xs.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setExperience((xs) => [...xs, { title: '', company: '', start: '', end: '', description: '' }])}>
          + Add experience
        </button>
      </section>

      <section className="pp-repeat">
        <h3>Education</h3>
        {education.map((x, i) => (
          <div className="pp-row" key={i}>
            <input placeholder="School" value={x.school} onChange={(e) => setEdu(i, { school: e.target.value })} />
            <input placeholder="Degree" value={x.degree} onChange={(e) => setEdu(i, { degree: e.target.value })} />
            <input placeholder="Year" value={x.year} onChange={(e) => setEdu(i, { year: e.target.value })} />
            <button type="button" className="link-btn" onClick={() => setEducation((xs) => xs.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setEducation((xs) => [...xs, { school: '', degree: '', year: '' }])}>
          + Add education
        </button>
      </section>

      {msg && <p className={`form-msg${msg.ok ? ' form-msg--ok' : ''}`} role="status">{msg.text}</p>}
      <button className="btn btn--primary" type="submit" disabled={saving} data-testid="save-professional">
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}
