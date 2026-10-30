import type { Profile } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ProfileAvatar, roleBadges } from './common';

export function NetworkView({ openUser, openMessages }: { openUser: (id: string) => void; openMessages: (id: string) => void }) {
  const { api } = useAuth();
  const [requests, setRequests] = useState<Profile[] | null>(null);
  const [connections, setConnections] = useState<Profile[] | null>(null);

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
  }, [load]);

  const accept = async (id: string) => {
    await api.acceptConnect(id).catch(() => {});
    void load();
  };
  const decline = async (id: string) => {
    await api.declineConnect(id).catch(() => {});
    void load();
  };

  return (
    <section className="page page--narrow" aria-label="Your network" data-testid="network">
      <h1 className="social-head">Your network</h1>

      <div className="card">
        <header className="card__head">
          <div>
            <h2>Requests</h2>
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

      <div className="card">
        <header className="card__head">
          <div>
            <h2>Connections</h2>
            <p>{connections ? `${connections.length} connection${connections.length === 1 ? '' : 's'}` : ''}</p>
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
    </section>
  );
}
