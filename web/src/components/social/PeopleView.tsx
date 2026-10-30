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
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role" className="admin__select">
            <option value="">Everyone</option>
            <option value="mentor">Mentors</option>
            <option value="mentee">Looking for mentorship</option>
          </select>
        </div>
      </header>

      {people === null ? (
        <div className="skeleton-list" aria-hidden="true"><i /><i /></div>
      ) : people.length === 0 ? (
        <p className="card__empty">No one found. Try a different search.</p>
      ) : (
        <ul className="people-grid">
          {people.map((p) => (
            <li key={p.userId} className="person-card">
              <button className="person-card__main" onClick={() => openUser(p.userId)}>
                <ProfileAvatar profile={p} size={56} />
                <span className="person-card__text">
                  <strong>{p.name || 'Member'}</strong>
                  <span>{p.headline || '—'}</span>
                  {roleBadges(p).map((b) => (
                    <span key={b} className="pill pill--role">{b}</span>
                  ))}
                </span>
              </button>
              <ConnectButton profile={p} api={api} onChange={(s) => setConn(p.userId, s)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
