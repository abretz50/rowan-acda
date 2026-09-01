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

// A styled call-to-action link every email template can drop in instead of
// a plain blue underlined link.
export function ctaButton(href, label) {
  return `<p style="margin:1.5rem 0 0"><a href="${href}" style="display:inline-block;background:#7A0A0A;color:#ffffff;text-decoration:none;padding:.65rem 1.4rem;border-radius:6px;font-weight:bold;font-size:.9rem">${escapeHtml(label)}</a></p>`;
}

// A full-bleed photo, used for event reminders. Capped width so it never
// overflows narrow mobile mail clients.
export function emailPhoto(url, alt) {
  if (!url) return '';
  return `<img src="${url}" alt="${escapeHtml(alt || '')}" style="display:block;width:100%;max-width:480px;height:auto;border-radius:10px;margin:.75rem 0;border:1px solid #eee"/>`;
}

// Small shared wrapper so every notification email looks like it's from the
// same place, without every call site repeating the boilerplate.
export function emailLayout(bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden">
    <div style="background:#7A0A0A;padding:1.1rem 1.5rem">
      <h1 style="margin:0;color:#ffffff;font-size:1.2rem;letter-spacing:.02em">Rowan ACDA</h1>
    </div>
    <div style="padding:1.5rem;color:#1a1a1a;line-height:1.55;font-size:.95rem">
      ${bodyHtml}
    </div>
    <div style="padding:1rem 1.5rem;background:#f7f7f7;border-top:1px solid #eee">
      <p style="margin:0;font-size:.78rem;color:#777">You're receiving this because you have a Rowan ACDA account. Manage your account at <a href="https://rowanacda.org/account" style="color:#7A0A0A">rowanacda.org/account</a>.</p>
    </div>
  </div>`;
}
