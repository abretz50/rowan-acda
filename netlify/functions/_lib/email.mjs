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

// A member's primary + optional secondary email, for every notification
// site that emails "this specific person" — sent as one call with both
// addresses in `to`, so it's clearly one notification landing in two
// inboxes, not two separate emails.
export function memberEmails(m) {
  return [m?.email, m?.secondaryEmail].filter(Boolean);
}

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

// Uploaded photos are stored as site-relative paths (/assets/img/...),
// which resolve fine on the website but not in an email with no base URL —
// every image src in an email needs to be absolute.
function absoluteUrl(url) {
  return url.startsWith('http') ? url : `https://rowanacda.org${url}`;
}

// A full-bleed photo, used for event reminders. Capped width so it never
// overflows narrow mobile mail clients.
export function emailPhoto(url, alt) {
  if (!url) return '';
  return `<img src="${absoluteUrl(url)}" alt="${escapeHtml(alt || '')}" style="display:block;width:100%;max-width:480px;height:auto;border-radius:10px;margin:.75rem 0;border:1px solid #eee"/>`;
}

const PRIORITY_COLORS = { high: '#ef4444', medium: '#eab308', low: '#3b82f6' };

// Matches the color coding used for priority badges on the Task Board.
export function priorityBadge(priority) {
  const color = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium;
  return `<span style="display:inline-block;padding:.15rem .6rem;border-radius:999px;font-size:.72rem;font-weight:bold;color:#ffffff;background:${color};text-transform:capitalize;vertical-align:middle">${escapeHtml(priority || 'medium')} priority</span>`;
}

// Small shared wrapper so every notification email looks like it's from the
// same place, without every call site repeating the boilerplate. Uses a
// table for the header row (not flexbox) since Outlook desktop's rendering
// engine doesn't support flexbox in HTML email.
export function emailLayout(bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#7A0A0A">
      <tr>
        <td style="padding:1.1rem 1.5rem" valign="middle">
          <img src="${absoluteUrl('/assets/icons/logo2-email.png')}" alt="Rowan ACDA" width="36" height="36" style="vertical-align:middle;border-radius:6px"/>
          <span style="color:#ffffff;font-size:1.2rem;font-weight:bold;letter-spacing:.02em;vertical-align:middle;margin-left:.6rem">Rowan ACDA</span>
        </td>
      </tr>
    </table>
    <div style="padding:1.5rem;color:#1a1a1a;line-height:1.55;font-size:.95rem">
      ${bodyHtml}
    </div>
    <div style="padding:1rem 1.5rem;background:#f7f7f7;border-top:1px solid #eee">
      <p style="margin:0 0 .4rem;font-size:.78rem;color:#777">Can't see the images? Click "Trust Sender" in Mail Settings.</p>
      <p style="margin:0;font-size:.78rem;color:#777">You're receiving this because you have a Rowan ACDA account. Manage your account at <a href="https://rowanacda.org/account" style="color:#7A0A0A">rowanacda.org/account</a>.</p>
    </div>
  </div>`;
}
