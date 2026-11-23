import { ApiError, type Post, type Profile } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useCalling } from '../../calling';
import { ago } from '../../format';
import { ConnectButton, ProfileAvatar, roleBadges } from './common';

export function PersonView({ userId, openMessages, back }: { userId: string; openMessages: (id: string) => void; back: () => void }) {
  const { api } = useAuth();
  const { callUser } = useCalling();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    setMissing(false);
    try {
      const { profile, posts } = await api.getProfile(userId);
      setProfile(profile);
      setPosts(posts);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setMissing(true);
      else setLoadError('Could not load this member profile. Please try again.');
    }
  }, [api, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onConn = () => void load();

  if (missing) return <section className="page page--narrow" data-testid="member-not-found"><button className="link-btn" onClick={back}>&larr; Back</button><div className="card__empty"><h1>404: Member not found</h1><p>This Huddle member profile could not be found.</p></div></section>;
  if (loadError) return <section className="page page--narrow"><button className="link-btn" onClick={back}>&larr; Back</button><p className="form-msg" role="alert">{loadError}</p><button className="btn btn--secondary btn--small" onClick={() => void load()}>Retry</button></section>;
  if (!profile) return <section className="page page--narrow"><div className="skeleton-list" aria-hidden="true"><i /></div></section>;

  const full = profile.connection === 'connected' || profile.connection === 'self';
  const experiences = profile.experience ?? [];
  const education = profile.education ?? [];
  const badges = roleBadges(profile);

  return (
    <section className="page person-page" aria-label="Profile" data-testid="person">
      <div className="person-toolbar">
        <button className="btn btn--secondary btn--small" onClick={back}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /><path d="M20 12H9" /></svg>
          Back
        </button>
        <span>Member profile</span>
      </div>

      <section className="person-identity-card">
        <div className="person-cover">
          <div className="person-cover__badges">
            {profile.mentor && <span className="person-cover__badge">Available as a mentor</span>}
            {full && profile.connection === 'connected' && <span className="person-cover__badge person-cover__badge--connected">1st-degree connection</span>}
          </div>
          <span className="person-cover__label">Huddle member</span>
        </div>
        <div className="person-identity">
          <ProfileAvatar profile={profile} size={88} />
          <div className="person-identity__details">
            <h1>{profile.name || 'Member'}</h1>
            {profile.headline && <p className="person-identity__headline">{profile.headline}</p>}
            {profile.location && <p className="person-identity__location">{profile.location}</p>}
            <p className="person-identity__location">{profile.mutualConnections ?? 0} mutual connection{profile.mutualConnections === 1 ? '' : 's'}</p>
            {badges.length > 0 && (
              <div className="person-identity__roles">
                {badges.map((badge) => <span key={badge} className="pill pill--role">{badge}</span>)}
              </div>
            )}
          </div>
          <div className="person-identity__actions">
            <ConnectButton profile={profile} api={api} onChange={onConn} />
            {!full && (
              // Messages are limited to connections (server rule), so show the option
              // but explain how to unlock it rather than hiding it.
              <button
                className="btn btn--secondary btn--small"
                disabled
                title={profile.connection === 'pending_outgoing' ? 'You can message once they accept your request.' : 'Connect first to send a message.'}
                aria-describedby="person-msg-hint"
                data-testid="person-message-locked"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                Message
              </button>
            )}
            {!full && (
              <p id="person-msg-hint" className="person-identity__hint">
                {profile.connection === 'pending_outgoing'
                  ? 'Request sent, you can message once they accept.'
                  : profile.connection === 'pending_incoming'
                    ? 'Accept their request to start messaging.'
                    : 'Connect to send a message.'}
              </p>
            )}
            {full && profile.connection !== 'self' && (
              <>
                <button className="btn btn--secondary btn--small" onClick={() => openMessages(profile.userId)} data-testid="person-message">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Message
                </button>
                <button className="btn btn--primary btn--small" onClick={() => callUser(profile.userId, profile.name)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                  Video call
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="person-profile-grid">
        <main className="person-profile-main">
          <section className="person-panel">
            <header className="person-panel__heading">
              <div>
                <h2>About &amp; career focus</h2>
                <p>A public overview of this member&apos;s professional profile.</p>
              </div>
              <span className="person-public-label">Public profile</span>
            </header>
            <p className="person-about">{profile.bio || 'This member has not added an introduction yet.'}</p>
            {profile.mentor && profile.focusAreas.length > 0 && (
              <div className="person-mentor">
                <strong>Mentorship focus</strong>
                <p>{profile.focusAreas.join(' · ')}</p>
              </div>
            )}
            <div className="person-public-details">
              <div>
                <h3>Focus areas</h3>
                {profile.focusAreas.length > 0 ? (
                  <div className="person-chips">{profile.focusAreas.map((area) => <span key={area} className="person-chip">{area}</span>)}</div>
                ) : <p className="person-empty">No focus areas added.</p>}
              </div>
              <div>
                <h3>Core skills</h3>
                {profile.skills.length > 0 ? (
                  <div className="person-chips person-chips--skills">{profile.skills.map((skill) => <span key={skill} className="person-chip">{skill}</span>)}</div>
                ) : <p className="person-empty">No skills added.</p>}
              </div>
            </div>
          </section>

          <section className="person-panel">
            <header className="person-panel__heading">
              <div>
                <h2>Experience &amp; education</h2>
                <p>Work history and academic background shared on this profile.</p>
              </div>
              <span className="person-public-label">Public profile</span>
            </header>
            <div className="person-history">
              <div className="person-history__column">
                <h3>Work experience</h3>
                {experiences.length ? experiences.map((item, index) => (
                  <article className="person-history__item" key={`${item.company}-${item.title}-${index}`}>
                    <span className="person-history__icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></svg>
                    </span>
                    <div>
                      <h4>{item.title || 'Role'}</h4>
                      {item.company && <p>{item.company}</p>}
                      {(item.start || item.end) && <span>{item.start || '-'} – {item.end || 'Present'}</span>}
                      {item.description && <p className="person-history__description">{item.description}</p>}
                    </div>
                  </article>
                )) : <p className="person-empty">No work experience added.</p>}
              </div>
              <div className="person-history__column">
                <h3>Education</h3>
                {education.length ? education.map((item, index) => (
                  <article className="person-history__item" key={`${item.school}-${item.degree}-${index}`}>
                    <span className="person-history__icon person-history__icon--education" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6" /></svg>
                    </span>
                    <div>
                      <h4>{item.degree || 'Education'}</h4>
                      {item.school && <p>{item.school}</p>}
                      {item.year && <span>{item.year}</span>}
                    </div>
                  </article>
                )) : <p className="person-empty">No education added.</p>}
              </div>
            </div>
          </section>

          <section className="person-panel person-activity">
            <header className="person-panel__heading">
              <div>
                <h2>Recent activity</h2>
                <p>Latest posts shared on Huddle.</p>
              </div>
            </header>
            {posts.length > 0 ? (
              <div className="person-activity__list">
                {posts.map((post) => (
                  <article key={post.id} className="person-post">
                    <div className="person-post__head">
                      <ProfileAvatar profile={{ userId: post.authorId, name: post.authorName, photoUrl: post.authorPhotoUrl }} size={36} />
                      <div><strong>{post.authorName}</strong><span>{ago(post.createdAt)}</span></div>
                    </div>
                    {post.text && <p className="post__text">{post.text}</p>}
                    {post.imageUrl && <img className="post__img" src={post.imageUrl} alt="" />}
                    <div className="person-post__meta"><span>{post.likeCount} likes</span><span>{post.comments.length} comments</span></div>
                  </article>
                ))}
              </div>
            ) : <p className="person-empty">No public posts yet.</p>}
          </section>
        </main>

        <aside className={`person-vault${full ? ' person-vault--open' : ''}`} aria-label="Private profile details">
          <header className="person-vault__heading">
            <span className="person-vault__icon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{full ? <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0" /></> : <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>}</svg>
            </span>
            <div>
              <h2>{full ? 'Connection details' : 'Private details'}</h2>
              <p>{full ? 'Shared with accepted connections.' : 'Contact details and CV are shared only after connecting.'}</p>
            </div>
          </header>
          <div className="person-vault__items">
            <div className="person-vault__item">
              <span>Email</span>
              <strong>{full ? profile.email || 'Not shared' : 'Visible to accepted connections'}</strong>
            </div>
            <div className="person-vault__item">
              <span>Mobile</span>
              <strong>{full ? profile.mobile || 'Not shared' : 'Visible to accepted connections'}</strong>
            </div>
            <div className="person-vault__item">
              <span>Expected salary</span>
              <strong>{full ? profile.expectedSalary || 'Not shared' : 'Visible to accepted connections'}</strong>
            </div>
            <div className="person-vault__item person-vault__item--cv">
              <span>CV / Resume</span>
              {full ? (
                profile.hasCv ? (
                  profile.cvUrl ? <a href={profile.cvUrl} target="_blank" rel="noopener noreferrer">{profile.cvName || 'View CV'}</a> : <strong>{profile.cvName || 'Uploaded'}</strong>
                ) : <strong>Not shared</strong>
              ) : <strong>Hidden until you connect</strong>}
            </div>
          </div>
          {!full && (
            <p className="person-vault__note">
              {profile.connection === 'pending_outgoing'
                ? 'Your connection request is waiting for a response.'
                : profile.connection === 'pending_incoming'
                  ? 'Accept the connection request to view private details.'
                  : 'Send a connection request to unlock shared contact details and CV.'}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
