import type { Profile } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ProfileAvatar, roleBadges } from './common';

export function NetworkView({ openUser, openMessages }: { openUser: (id: string) => void; openMessages: (id: string) => void }) {
  const { api } = useAuth();
  const [requests, setRequests] = useState<Profile[] | null>(null);
  const [connections, setConnections] = useState<Profile[] | null>(null);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api.listRequests(), api.listConnections()]);
      setRequests(r.requests);
      setConnections(c.connections);
    } catch {
      setRequests([]);
      setConnections([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
    // Load suggested people
    api.searchPeople({}).then(({ people }) => setSuggestions(people.slice(0, 5))).catch(() => {});
  }, [load, api]);

  const accept = async (id: string) => {
    await api.acceptConnect(id).catch(() => {});
    void load();
  };
  const decline = async (id: string) => {
    await api.declineConnect(id).catch(() => {});
    void load();
  };

  const connCount = connections?.length ?? 0;
  const reqCount = requests?.length ?? 0;

  return (
    <section className="network-layout" aria-label="Your network" data-testid="network">
      <div className="network-main">
        <h1 className="social-head">Your network</h1>

        {/* Stats bar */}
        <div className="network-stats">
          <div className="network-stat">
            <span className="network-stat__num">{connCount}</span>
            <span className="network-stat__label">Connections</span>
          </div>
          <div className="network-stat">
            <span className="network-stat__num">{reqCount}</span>
            <span className="network-stat__label">Pending</span>
          </div>
        </div>

        {/* Pending requests */}
        <div className="card">
          <header className="card__head">
            <div>
              <h2>Pending requests</h2>
              <p>People who want to connect with you.</p>
            </div>
          </header>
          {requests === null ? (
            <div className="skeleton-list" aria-hidden="true"><i /></div>
          ) : requests.length === 0 ? (
            <p className="card__empty">No pending requests.</p>
          ) : (
            <ul className="net-list">
              {requests.map((p) => (
                <li key={p.userId}>
                  <button className="net-list__who" onClick={() => openUser(p.userId)}>
                    <ProfileAvatar profile={p} size={40} />
                    <span><strong>{p.name || 'Member'}</strong><span>{p.headline || '—'}</span></span>
                  </button>
                  <span className="net-list__actions">
                    <button className="btn btn--primary btn--small" onClick={() => void accept(p.userId)}>Accept</button>
                    <button className="btn btn--secondary btn--small" onClick={() => void decline(p.userId)}>Decline</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Connections list */}
        <div className="card">
          <header className="card__head">
            <div>
              <h2>Connections</h2>
              <p>{connCount} connection{connCount === 1 ? '' : 's'}</p>
            </div>
          </header>
          {connections === null ? (
            <div className="skeleton-list" aria-hidden="true"><i /></div>
          ) : connections.length === 0 ? (
            <p className="card__empty">No connections yet. Find people to connect with.</p>
          ) : (
            <ul className="net-list">
              {connections.map((p) => (
                <li key={p.userId}>
                  <button className="net-list__who" onClick={() => openUser(p.userId)}>
                    <ProfileAvatar profile={p} size={40} />
                    <span>
                      <strong>{p.name || 'Member'}</strong>
                      <span>{p.headline || '—'}</span>
                      {roleBadges(p).map((b) => <span key={b} className="pill pill--role">{b}</span>)}
                    </span>
                  </button>
                  <button className="btn btn--secondary btn--small" onClick={() => openMessages(p.userId)}>Message</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right sidebar: People You May Know */}
      <aside className="network-sidebar" aria-label="Suggestions">
        <div className="sidebar-card">
          <h3 className="sidebar-card__title">People You May Know</h3>
          {suggestions.length === 0 ? (
            <p className="sidebar-card__empty">No suggestions yet.</p>
          ) : (
            <ul className="sidebar-card__list">
              {suggestions.filter((s) => s.connection === 'none').slice(0, 5).map((p) => (
                <li key={p.userId} className="sidebar-card__person">
                  <button className="sidebar-card__person-btn" onClick={() => openUser(p.userId)}>
                    <ProfileAvatar profile={p} size={32} />
                    <span>
                      <strong>{p.name || 'Member'}</strong>
                      <span>{p.headline || ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="sidebar-card sidebar-card--cta">
          <h3 className="sidebar-card__title">Grow Your Network</h3>
          <p className="sidebar-card__empty">Invite colleagues to join Huddle and start connecting.</p>
        </div>
      </aside>
    </section>
  );
}
