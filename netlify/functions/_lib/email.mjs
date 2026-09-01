// Thin wrapper around the Resend API. Every notification type in the app
// goes through this one function so there's a single place that knows how
// to talk to the email provider.
//
// Required env var: RESEND_API_KEY.
// Optional env var: NOTIFICATIONS_FROM_EMAIL — until a sending domain is
// verified in Resend, sending falls back to their shared test domain,
// which can only deliver to the Resend account's own signup address (every
// other recipient bounces with a 403). Verify rowanacda.org (or a
// subdomain) in the Resend dashboard, then set NOTIFICATIONS_FROM_EMAIL to
// an address at that domain to unlock sending to the whole roster.
const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Rowan ACDA <onboarding@resend.dev>';

export async function sendEmail({ to, subject, html }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { ok: false, error: 'No recipients.' };
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'Email is not configured (missing RESEND_API_KEY).' };

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.NOTIFICATIONS_FROM_EMAIL || DEFAULT_FROM,
      to: recipients,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || `Resend error ${res.status}` };
  }
  return { ok: true };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Small shared wrapper so every notification email looks like it's from
// the same place, without every call site repeating the boilerplate.
export function emailLayout(bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <h2 style="color:#7A0A0A;margin:0 0 1rem">Rowan ACDA</h2>
    ${bodyHtml}
    <p style="margin-top:2rem;font-size:.8rem;color:#666">You're receiving this because you have a Rowan ACDA portal account. Manage your account at rowanacda.org/account.html.</p>
  </div>`;
}
