// Central audit recorder. A single store is registered at app start; every route
// records through recordAudit(...), which never throws and never blocks the
// response (fire-and-forget), so adding audit calls can't break a request.

let store = null;

/** Wire the audit store (social.audit) at app startup. */
export function setAuditStore(s) {
  store = s || null;
}

/**
 * Record one audit event. Safe to call from anywhere: if no store is wired or the
 * write fails, it is silently ignored.
 * @param {{ actorId?: string|null, actorName?: string, action: string, category?: string, target?: string, meta?: string }} evt
 */
export function recordAudit(evt) {
  if (!store || !evt || !evt.action) return;
  try {
    const p = store.record({
      actorId: evt.actorId ?? null,
      actorName: evt.actorName ?? 'System',
      action: evt.action,
      category: evt.category ?? 'system',
      target: evt.target ?? '',
      meta: evt.meta ?? '',
    });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* never let auditing break a request */
  }
}

/** Convenience: derive actor fields from a user object. */
export function actorOf(user) {
  return { actorId: user?.id ?? null, actorName: user?.name || user?.email || 'Someone' };
}
