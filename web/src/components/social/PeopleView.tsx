import type { ConnectionState, Profile } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ConnectButton, ProfileAvatar, roleBadges } from './common';

export function PeopleView({ openUser }: { openUser: (id: string) => void }) {
  const { api } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);

  const load = useCallback(async () => {
    try {
      setPeople((await api.searchPeople({ q, role })).people);
    } catch {
      setPeople([]);
    }
  }, [api, q, role]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const setConn = (userId: string, connection: ConnectionState) =>
    setPeople((xs) => (xs ?? []).map((p) => (p.userId === userId ? { ...p, connection } : p)));

  return (
    <section className="page" aria-label="People" data-testid="people">
      <header className="social-head">
        <h1>Find people &amp; mentors</h1>
        <div className="social-filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, skill or place…" aria-label="Search people" />
          <div className="social-filters__tabs" role="tablist" aria-label="Filter by role">
            <button role="tab" aria-selected={role === ''} className={role === '' ? 'is-on' : ''} onClick={() => setRole('')}>All Members</button>
            <button role="tab" aria-selected={role === 'mentor'} className={role === 'mentor' ? 'is-on' : ''} onClick={() => setRole('mentor')}>Mentors</button>
            <button role="tab" aria-selected={role === 'mentee'} className={role === 'mentee' ? 'is-on' : ''} onClick={() => setRole('mentee')}>Mentees</button>
          </div>
        </div>
      </header>

      {people === null ? (
        <div className="skeleton-list" aria-hidden="true"><i /><i /></div>
      ) : people.length === 0 ? (
        <p className="card__empty">No one found. Try a different search.</p>
      ) : (
        <ul className="people-grid">
          {people.map((p) => (
            <li key={p.userId} className="person-card card">
              <div className="person-card__banner" />
              <div className="person-card__body">
                <button className="person-card__main" onClick={() => openUser(p.userId)}>
                  <ProfileAvatar profile={p} size={64} />
                  <span className="person-card__text">
                    <strong>{p.name || 'Member'}</strong>
                    <span className="person-card__headline">{p.headline || '—'}</span>
                    {p.location && <span className="person-card__location">{p.location}</span>}
                  </span>
                </button>
                {p.skills.length > 0 && (
                  <div className="person-card__skills">
                    {p.skills.slice(0, 4).map((s) => <span key={s} className="pill">{s}</span>)}
                    {p.skills.length > 4 && <span className="pill pill--more">+{p.skills.length - 4}</span>}
                  </div>
                )}
                {roleBadges(p).length > 0 && (
                  <div className="person-card__roles">
                    {roleBadges(p).map((b) => <span key={b} className="pill pill--role">{b}</span>)}
                  </div>
                )}
                <div className="person-card__footer">
                  <ConnectButton profile={p} api={api} onChange={(s) => setConn(p.userId, s)} />
                  {p.connection === 'connected' && (
                    <button className="btn btn--secondary btn--small" onClick={(e) => { e.stopPropagation(); openUser(p.userId); }}>
                      Message
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
