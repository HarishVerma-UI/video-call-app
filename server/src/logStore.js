// Ring-buffer log store: captures server log entries in memory for the /logs UI.
// Keeps the last `maxEntries` lines (default 2000). Each entry has a timestamp,
// level, and message string.

const MAX_ENTRIES = 2000;

export function createLogStore({ maxEntries = MAX_ENTRIES } = {}) {
  const entries = [];
  let seq = 0;

  /** Push a log entry. `args` mirrors what console.log receives. */
  function push(level, ...args) {
    const entry = {
      id: ++seq,
      ts: Date.now(),
      level,
      message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
    };
    entries.push(entry);
    if (entries.length > maxEntries) entries.shift();
  }

  /**
   * Return entries, optionally filtered:
   *   since – only entries with id > since (for polling)
   *   level – 'info' | 'warn' | 'error'
   *   q     – substring search in message
   *   limit – max entries to return (from the tail)
   */
  function query({ since, level, q, limit = 200 } = {}) {
    let list = entries;
    if (since) list = list.filter((e) => e.id > since);
    if (level) list = list.filter((e) => e.level === level);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((e) => e.message.toLowerCase().includes(needle));
    }
    return list.slice(-limit);
  }

  /** Create a `log` function that records to this store AND passes through. */
  function wrapLog(originalLog) {
    return (...args) => {
      push('info', ...args);
      originalLog(...args);
    };
  }

  return { push, query, wrapLog, get size() { return entries.length; } };
}
