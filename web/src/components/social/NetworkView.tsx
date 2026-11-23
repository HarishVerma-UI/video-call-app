import type { ConnectionState, Profile } from '@vca/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useCalling } from '../../calling';
import { ConnectButton, ProfileAvatar, roleBadges } from './common';

type ConnectionFilter = 'all' | 'mentors' | 'mentees';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function NetworkView({ openUser, openMessages }: { openUser: (id: string) => void; openMessages: (id: string) => void }) {
  const { api } = useAuth();
  const { callUser } = useCalling();
  const [requests, setRequests] = useState<Profile[] | null>(null);
  const [connections, setConnections] = useState<Profile[] | null>(null);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConnectionFilter>('all');
  const [error, setError] = useState('');
  const [suggestionError, setSuggestionError] = useState('');
  const [actionError, setActionError] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, c] = await Promise.all([api.listRequests(), api.listConnections()]);
      setRequests(r.requests);
      setConnections(c.connections);
    } catch {
      setRequests(null);
      setConnections(null);
      setError("Couldn't load your network. Check your connection and try again.");
    }
  }, [api]);

  useEffect(() => {
    void load();
    api.searchPeople({}).then(({ people }) => setSuggestions(people)).catch(() => setSuggestionError("Couldn't load people suggestions."));
  }, [load, api]);

  const onConn = (id: string, connection: ConnectionState) => {
    setSuggestions((xs) => xs.map((p) => (p.userId === id ? { ...p, connection } : p)));
  };

  const filteredConnections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (connections ?? []).filter((p) => {
      const matchesFilter = filter === 'all' || (filter === 'mentors' ? p.mentor : p.mentee);
      const haystack = [p.name, p.headline, p.location, ...p.skills, ...p.focusAreas].join(' ').toLowerCase();
      return matchesFilter && (!q || haystack.includes(q));
    });
  }, [connections, filter, search]);

  const accept = async (id: string) => {
    setActionError('');
    try {
      await api.acceptConnect(id);
      await load();
    } catch {
      setActionError("Couldn't accept the request. Please try again.");
    }
  };

  const decline = async (id: string) => {
    setActionError('');
    try {
      await api.declineConnect(id);
      await load();
    } catch {
      setActionError("Couldn't decline the request. Please try again.");
    }
  };

  const removeConnection = async (profile: Profile) => {
    if (!window.confirm(`Remove ${profile.name || 'this member'} from your connections?`)) return;
    setActionError('');
    setOpenMenuId(null);
    try {
      await api.removeConnect(profile.userId);
      await load();
    } catch {
      setActionError("Couldn't remove this connection. Please try again.");
    }
  };

  const connectionCount = connections?.length ?? 0;
  const requestCount = requests?.length ?? 0;
  const mentorCount = connections?.filter((p) => p.mentor).length ?? 0;
  const known = suggestions.filter((p) => p.connection === 'none');

  return (
    <section className="network-page" aria-label="Your network" data-testid="network">
      <header className="network-header">
        <div>
          <span className="network-eyebrow">People &amp; connections</span>
          <h1>Your Network</h1>
          <p>Manage your trusted peers, mentors, and referral circle.</p>
        </div>
        <span className="network-header__count">{connectionCount} connection{connectionCount === 1 ? '' : 's'}</span>
      </header>

      <section className="network-stat-grid" aria-label="Network summary">
        <button type="button" className="network-stat-card" onClick={() => { setFilter('all'); scrollToSection('network-connections'); }}>
          <span className="network-stat-card__top"><span>Connections</span><i className="network-stat-card__icon network-stat-card__icon--green" aria-hidden="true">✓</i></span>
          <strong>{connections === null ? '-' : connectionCount}</strong>
          <span className="network-stat-card__hint">View directory <span aria-hidden="true">→</span></span>
        </button>
        <button type="button" className="network-stat-card" onClick={() => scrollToSection('network-requests')}>
          <span className="network-stat-card__top"><span>Pending requests</span><i className="network-stat-card__icon network-stat-card__icon--amber" aria-hidden="true">!</i></span>
          <strong>{requests === null ? '-' : requestCount}</strong>
          <span className="network-stat-card__hint">{requestCount ? 'Review invitations' : 'All caught up'} <span aria-hidden="true">→</span></span>
        </button>
        <button type="button" className="network-stat-card" onClick={() => { setFilter('mentors'); scrollToSection('network-connections'); }}>
          <span className="network-stat-card__top"><span>Mentors</span><i className="network-stat-card__icon network-stat-card__icon--blue" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></svg></i></span>
          <strong>{connections === null ? '-' : mentorCount}</strong>
          <span className="network-stat-card__hint">Find mentors <span aria-hidden="true">→</span></span>
        </button>
      </section>

      {error && (
        <div className="network-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {actionError && <p className="network-alert" role="alert">{actionError}</p>}

      <div className="network-content-grid">
        <main className="network-main">
          <section className="card network-panel" id="network-requests">
            <header className="network-panel__header">
              <div>
                <h2>Pending requests</h2>
                <p>Review people who want to connect with you.</p>
              </div>
              <span className="network-panel__count">{requests === null ? 'Loading' : requestCount}</span>
            </header>
            {requests === null ? (
              error ? <p className="network-empty">Requests are unavailable right now.</p> : <div className="skeleton-list" aria-hidden="true"><i /></div>
            ) : requests.length === 0 ? (
              <div className="network-empty">
                <span className="network-empty__icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
                </span>
                <strong>You&apos;re all caught up</strong>
                <p>New connection requests will appear here.</p>
                <button type="button" className="btn btn--secondary btn--small" onClick={() => scrollToSection('network-discover')}>Discover people</button>
              </div>
            ) : (
              <ul className="network-request-list">
                {requests.map((p) => (
                  <li key={p.userId} className="network-request">
                    <button className="network-person" onClick={() => openUser(p.userId)}>
                      <ProfileAvatar profile={p} size={48} />
                      <span className="network-person__info">
                        <strong>{p.name || 'Member'}</strong>
                        {p.headline && <span>{p.headline}</span>}
                        <small>{[p.location, ...roleBadges(p)].filter(Boolean).join(' · ') || 'Huddle member'}</small>
                      </span>
                    </button>
                    <div className="network-request__actions">
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => openUser(p.userId)}>View profile</button>
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => void decline(p.userId)}>Decline</button>
                      <button type="button" className="btn btn--primary btn--small" onClick={() => void accept(p.userId)}>Accept</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card network-panel" id="network-connections">
            <header className="network-panel__header network-panel__header--directory">
              <div>
                <h2>Your connections</h2>
                <p>Message, call, and view profiles in your network.</p>
              </div>
              <label className="network-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, role, or skill" aria-label="Search connections" />
              </label>
            </header>

            <div className="network-filters" role="group" aria-label="Filter connections">
              {([
                ['all', 'All'],
                ['mentors', 'Mentors'],
                ['mentees', 'Seeking mentorship'],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)} aria-pressed={filter === id}>
                  {label}
                </button>
              ))}
            </div>

            {connections === null ? (
              error ? <p className="network-empty">Your connections are unavailable right now.</p> : <div className="skeleton-list" aria-hidden="true"><i /></div>
            ) : connections.length === 0 ? (
              <div className="network-empty">
                <strong>No connections yet</strong>
                <p>Find people you know and send a connection request.</p>
                <button type="button" className="btn btn--primary btn--small" onClick={() => scrollToSection('network-discover')}>Find people</button>
              </div>
            ) : filteredConnections.length === 0 ? (
              <div className="network-empty">
                <strong>No matching connections found</strong>
                <p>Try a different search or filter.</p>
              </div>
            ) : (
              <ul className="network-connection-list">
                {filteredConnections.map((p) => (
                  <li key={p.userId} className="network-connection">
                    <button className="network-person" onClick={() => openUser(p.userId)}>
                      <ProfileAvatar profile={p} size={48} />
                      <span className="network-person__info">
                        <span className="network-person__name">
                          <strong>{p.name || 'Member'}</strong>
                          <span className="network-connected-label">Connected</span>
                          {roleBadges(p).map((badge) => <span key={badge} className="network-role-label">{badge}</span>)}
                        </span>
                        {p.headline && <span>{p.headline}</span>}
                        <small>{p.location || 'Huddle member'}</small>
                        {p.skills.length > 0 && <span className="network-person__skills">{p.skills.slice(0, 3).map((skill) => <i key={skill}>{skill}</i>)}</span>}
                      </span>
                    </button>
                    <div className="network-connection__actions">
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => openMessages(p.userId)} aria-label={`Message ${p.name || 'member'}`}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        Message
                      </button>
                      <button type="button" className="btn btn--primary btn--small" onClick={() => callUser(p.userId, p.name)} aria-label={`Video call ${p.name || 'member'}`}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                        Meet
                      </button>
                      <div className="network-more">
                        <button type="button" className="network-more__trigger" onClick={() => setOpenMenuId(openMenuId === p.userId ? null : p.userId)} aria-label={`More options for ${p.name || 'member'}`} aria-expanded={openMenuId === p.userId}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
                        </button>
                        {openMenuId === p.userId && (
                          <div className="network-more__menu">
                            <button type="button" onClick={() => { setOpenMenuId(null); openUser(p.userId); }}>View full profile</button>
                            <button type="button" className="is-danger" onClick={() => void removeConnection(p)}>Remove connection</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="network-sidebar" aria-label="Discover people">
          <section className="sidebar-card network-discover" id="network-discover">
            <header className="network-discover__header">
              <div>
                <h2>People you may know</h2>
                <p>Peers and mentors to add to your circle.</p>
              </div>
              <span>{known.length}</span>
            </header>
            {suggestionError ? (
              <p className="sidebar-card__empty" role="status">{suggestionError}</p>
            ) : known.length === 0 ? (
              <p className="sidebar-card__empty">No new suggestions right now. Check back later.</p>
            ) : (
              <ul className="network-suggestions">
                {known.slice(0, 8).map((p) => (
                  <li key={p.userId}>
                    <button className="network-person" onClick={() => openUser(p.userId)}>
                      <ProfileAvatar profile={p} size={42} />
                      <span className="network-person__info">
                        <strong>{p.name || 'Member'}</strong>
                        {p.headline && <span>{p.headline}</span>}
                        <small>{p.location || (p.mentor ? 'Mentor' : 'Suggested for you')}</small>
                      </span>
                    </button>
                    <ConnectButton profile={p} api={api} onChange={(state) => onConn(p.userId, state)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="sidebar-card network-grow">
            <span className="network-grow__icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>
            </span>
            <h2>Grow your network</h2>
            <p>Build your circle by connecting with peers and mentors who share your interests.</p>
            <button type="button" className="btn btn--secondary btn--small" onClick={() => scrollToSection('network-discover')}>Explore suggestions</button>
          </section>
        </aside>
      </div>
    </section>
  );
}
