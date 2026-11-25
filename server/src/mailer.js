// Minimal, dependency-free outbound email.
//
// If a transactional mail HTTP API is configured via env — MAIL_API_URL plus
// MAIL_API_KEY (e.g. a provider like Resend/Postmark that accepts a JSON POST) —
// messages are sent with the built-in fetch. With nothing configured, send() is a
// no-op that reports delivered:false, and the caller falls back to surfacing the
// link another way (in dev, on screen). No SMTP, no npm dependency.
export function createMailer({ log } = {}) {
  const url = process.env.MAIL_API_URL || '';
  const key = process.env.MAIL_API_KEY || '';
  const from = process.env.MAIL_FROM || 'Huddle <no-reply@huddle.app>';
  const configured = !!(url && key);
  return {
    configured,
    /** Returns { delivered: boolean }. Never throws. */
    async send({ to, subject, text, html }) {
      if (!configured) return { delivered: false };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({ from, to, subject, text, html }),
        });
        if (!res.ok) { log?.(`mail   send failed (${res.status})`); return { delivered: false }; }
        return { delivered: true };
      } catch (err) {
        log?.('mail   send error', err?.message || err);
        return { delivered: false };
      }
    },
  };
}

export function passwordResetEmail({ name, resetUrl }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  const text = `${hi}

We received a request to reset your Huddle password. Open the link below to choose a new one — it expires in 1 hour and can be used once:

${resetUrl}

If you didn't ask for this, you can ignore this email; your password stays the same.

— Huddle`;
  const html = `<p>${hi}</p><p>We received a request to reset your Huddle password. Choose a new one with the button below — it expires in 1 hour and can be used once.</p><p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#4F46E5;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p><p>Or paste this link: <br><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't ask for this, you can ignore this email; your password stays the same.</p><p>— Huddle</p>`;
  return { subject: 'Reset your Huddle password', text, html };
}
