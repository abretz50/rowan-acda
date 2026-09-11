// One-off personal note to everyone who attended the most recent Meeting,
// e.g. "thanks for coming, hope to see you at the next one" — distinct from
// the templated task/event reminder system, since this is free-form text
// with a {{name}} token the sender fills in themselves. Always test with
// action:'sample' (goes only to the sender) before action:'send' (goes to
// every attendee), same "preview before blast" shape as everything else in
// the reminder system.
import { getCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { sendEmail, memberEmails, emailLayout, escapeHtml } from './_lib/email.mjs';

function firstNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

function bodyHtml(message, name) {
  const personalized = String(message || '').replace(/\{\{\s*name\s*\}\}/gi, firstNameOf(name));
  const paragraphs = personalized.split(/\n{2,}/).map(p => `<p style="margin:0 0 1rem">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('');
  return emailLayout(paragraphs);
}

async function lastMeetingAttendees() {
  const [events, points] = await Promise.all([getCollection('events', []), getCollection('points', [])]);
  const now = new Date();
  const pastMeetings = events
    .filter(e => (e.tags || []).includes('Meeting') && new Date(e.end || e.start) <= now)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const meeting = pastMeetings[0] || null;
  if (!meeting) return { meeting: null, attendees: [] };

  const seen = new Set();
  const attendees = [];
  for (const p of points) {
    if (p.eventId !== meeting.id || p.status === 'denied' || seen.has(p.memberId)) continue;
    seen.add(p.memberId);
    if (p.memberEmail) attendees.push({ memberId: p.memberId, name: p.memberName, email: p.memberEmail });
  }
  return { meeting, attendees };
}

export default async function handler(req) {
  // Gated on 'members' (not 'events') since this lives on the Members tab
  // and is about contacting people directly, not managing event records.
  const auth = await requireAuth(req, { perm: 'members' });
  if (auth.deny) return auth.deny;

  if (req.method === 'GET') {
    const { meeting, attendees } = await lastMeetingAttendees();
    return json({ ok: true, meeting: meeting ? { id: meeting.id, title: meeting.title, start: meeting.start } : null, attendeeCount: attendees.length });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!process.env.RESEND_API_KEY) return json({ ok: false, error: 'Email is not configured (missing RESEND_API_KEY).' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { action, subject, message } = body;
  if (!subject || !message) return json({ ok: false, error: 'Subject and message are required.' }, 400);

  const { meeting, attendees } = await lastMeetingAttendees();
  if (!meeting) return json({ ok: false, error: 'No past Meeting-tagged event found to pull attendees from.' }, 404);

  if (action === 'sample') {
    const sampleName = attendees[0]?.name || 'Member';
    const { ok, error } = await sendEmail({ to: memberEmails(auth.user), subject: `[SAMPLE] ${subject}`, html: bodyHtml(message, sampleName) });
    if (!ok) return json({ ok: false, error }, 500);
    return json({ ok: true, sentTo: 'sample', sampleName, attendeeCount: attendees.length, meetingTitle: meeting.title });
  }

  if (action === 'send') {
    if (!attendees.length) return json({ ok: false, error: `No attendees found for "${meeting.title}".` }, 400);
    const jobs = attendees.map(a => sendEmail({ to: a.email, subject, html: bodyHtml(message, a.name) }));
    const results = await Promise.allSettled(jobs);
    const failed = results.filter(r => r.status === 'rejected' || r.value?.ok === false).length;
    return json({ ok: true, sent: jobs.length, failed, meetingTitle: meeting.title });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
}
