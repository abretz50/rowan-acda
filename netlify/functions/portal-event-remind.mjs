// Manual "Send Reminder" for a single event, from the Events tab — emails
// every active member right now, regardless of when the event actually is.
// Gated the same way portal-events.mjs's manage operations are.
import { getCollection } from './_lib/blobs.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { sendEmail } from './_lib/email.mjs';
import { eventReminderEmailHtml } from './_lib/reminders.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req, { perm: 'events' });
  if (auth.deny) return auth.deny;
  if (!process.env.RESEND_API_KEY) return json({ ok: false, error: 'Email is not configured (missing RESEND_API_KEY).' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  const events = await getCollection('events', []);
  const event = events.find(e => e.id === body.id);
  if (!event) return json({ ok: false, error: 'Event not found.' }, 404);

  const members = await loadMembers();
  const activeEmails = [...new Set(members.filter(m => m.active !== false && m.email).map(m => m.email))];
  const html = eventReminderEmailHtml(event, null);

  const jobs = activeEmails.map(email => sendEmail({ to: email, subject: `Reminder: ${event.title}`, html }));
  const results = await Promise.allSettled(jobs);
  const failed = results.filter(r => r.status === 'rejected' || r.value?.ok === false).length;
  return json({ ok: true, sent: jobs.length, failed });
}
