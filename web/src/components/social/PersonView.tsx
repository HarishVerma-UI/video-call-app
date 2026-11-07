import type { ConnectionState, Post, Profile } from '@vca/shared';
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

  const load = useCallback(async () => {
    try {
      const { profile, posts } = await api.getProfile(userId);
      setProfile(profile);
      setPosts(posts);
    } catch {
      setMissing(true);
    }
  }, [api, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onConn = (_s: ConnectionState) => void load();

  if (missing) return <section className="page page--narrow"><button className="link-btn" onClick={back}>&larr; Back</button><p className="card__empty">This person doesn&apos;t have a profile yet.</p></section>;
  if (!profile) return <section className="page page--narrow"><div className="skeleton-list" aria-hidden="true"><i /></div></section>;

  const full = profile.connection === 'connected' || profile.connection === 'self';

  return (
    <section className="page page--narrow" aria-label="Profile" data-testid="person">
      <button className="link-btn" onClick={back}>&larr; Back</button>
      <div className="card">
        <div className="person-hero">
          <ProfileAvatar profile={profile} size={84} />
          <div className="person-hero__text">
            <h1>{profile.name || 'Member'}</h1>
            {(profile.headline || profile.location) && (
              <p>{profile.headline || ''}{profile.headline && profile.location ? ' · ' : ''}{profile.location || ''}</p>
            )}
            {roleBadges(profile).length > 0 && (
              <div className="person-hero__badges">{roleBadges(profile).map((b) => <span key={b} className="pill pill--role">{b}</span>)}</div>
            )}
          </div>
          <div className="person-hero__actions">
            <ConnectButton profile={profile} api={api} onChange={onConn} />
            {full && profile.connection !== 'self' && (
              <>
                <button className="btn btn--secondary btn--small" onClick={() => openMessages(profile.userId)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Message
                </button>
                <button className="btn btn--primary btn--small" onClick={() => callUser(profile.userId, profile.name)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                  Video call
                </button>
              </>
            )}
          </div>
        </div>

        {profile.skills.length > 0 && (
          <p className="person-skills">{profile.skills.map((s) => <span key={s} className="pill">{s}</span>)}</p>
        )}

        {full ? (
          <>
            {profile.bio && <p className="person-bio">{profile.bio}</p>}
            {profile.mobile && <p className="person-field"><strong>Mobile:</strong> {profile.mobile}</p>}
            {profile.cvUrl && <p className="person-field"><a className="btn btn--secondary btn--small" href={profile.cvUrl} target="_blank" rel="noreferrer">Download CV</a></p>}
            {(profile.experience ?? []).length > 0 && (
              <div className="person-section">
                <h3>Experience</h3>
                {(profile.experience ?? []).map((x, i) => (
                  <p key={i} className="person-field"><strong>{x.title}</strong>{x.company ? ` · ${x.company}` : ''}{x.start || x.end ? ` (${x.start}–${x.end})` : ''}</p>
                ))}
              </div>
            )}
            {(profile.education ?? []).length > 0 && (
              <div className="person-section">
                <h3>Education</h3>
                {(profile.education ?? []).map((x, i) => (
                  <p key={i} className="person-field"><strong>{x.school}</strong>{x.degree ? ` · ${x.degree}` : ''}{x.year ? ` (${x.year})` : ''}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="card__empty">Connect to see {profile.name || 'this person'}&apos;s full profile, CV and contact details.</p>
        )}
      </div>

      {posts.length > 0 && (
        <div className="person-posts">
          <h3>Recent posts</h3>
          {posts.map((p) => (
            <article key={p.id} className="post">
              <div className="post__by"><strong>{p.authorName}</strong><span>{ago(p.createdAt)}</span></div>
              {p.text && <p className="post__text">{p.text}</p>}
              {p.imageUrl && <img className="post__img" src={p.imageUrl} alt="" />}
              <div className="post__actions"><span>♥ {p.likeCount}</span><span>{p.comments.length} comments</span></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
