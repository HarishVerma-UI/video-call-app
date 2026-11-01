import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

interface LogEntry {
  id: number;
  ts: number;
  level: string;
  message: string;
}

export function LogsView() {
  const { api } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);

  const fetchLogs = useCallback(
    async (polling = false) => {
      try {
        const opts: { since?: number; level?: string; q?: string; limit?: number } = {};
        if (polling && lastIdRef.current) opts.since = lastIdRef.current;
        if (level) opts.level = level;
        if (filter) opts.q = filter;
        if (!polling) opts.limit = 500;
        const data = await api.logs(opts);
        const fetched: LogEntry[] = data.logs ?? [];
        if (fetched.length) lastIdRef.current = fetched[fetched.length - 1].id;
        if (polling) {
          setLogs((prev) => {
            const combined = [...prev, ...fetched];
            return combined.length > 2000 ? combined.slice(-2000) : combined;
          });
        } else {
          setLogs(fetched);
        }
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch logs');
      }
    },
    [api, filter, level],
  );

  // Initial load
  useEffect(() => {
    lastIdRef.current = 0;
    fetchLogs(false);
  }, [fetchLogs]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchLogs(true), 3000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  return (
    <section className="logs-view">
      <header className="logs-view__header">
        <h2>Server Logs</h2>
        <div className="logs-view__controls">
          <input
            className="logs-view__search"
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select className="logs-view__level" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <label className="logs-view__auto">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <button className="btn btn--sm" onClick={() => fetchLogs(false)}>
            Refresh
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => { setLogs([]); lastIdRef.current = 0; }}>
            Clear
          </button>
        </div>
      </header>

      {error && <p className="logs-view__error">{error}</p>}

      <div className="logs-view__body">
        {logs.length === 0 && !error && <p className="logs-view__empty">No log entries yet.</p>}
        <table className="logs-view__table">
          <thead>
            <tr>
              <th className="logs-col--time">Time</th>
              <th className="logs-col--level">Level</th>
              <th className="logs-col--msg">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((entry) => (
              <tr key={entry.id} className={`logs-row logs-row--${entry.level}`}>
                <td className="logs-col--time" title={new Date(entry.ts).toISOString()}>
                  <span className="logs-date">{fmtDate(entry.ts)}</span>{' '}
                  {fmtTime(entry.ts)}
                </td>
                <td className="logs-col--level">
                  <span className={`logs-badge logs-badge--${entry.level}`}>{entry.level}</span>
                </td>
                <td className="logs-col--msg"><code>{entry.message}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={bottomRef} />
      </div>

      <footer className="logs-view__footer">
        {logs.length} entries {autoRefresh && '· auto-refreshing every 3s'}
      </footer>
    </section>
  );
}
