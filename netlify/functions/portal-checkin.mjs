import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { json } from './_lib/auth.mjs';
import { isCheckinOpen, checkinWindow } from './_lib/checkinWindow.mjs';

function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function findEventByCode(events, code) {
  const c = String(code || '').trim().toUpperCase();
  return events.find(e => e.checkinCode === c);
}

export default async function handler(req) {
  const events = await getCollection('events', []);

  if (req.method === 'GET') {
    const code = new URL(req.url).searchParams.get('code');
    const event = findEventByCode(events, code);
    if (!event) return json({ ok: false, error: 'Invalid code.' }, 404);
    const { opensAt, closesAt } = checkinWindow(event);
    return json({
      ok: true,
      event: { title: event.title, location: event.location, start: event.start, end: event.end },
      open: isCheckinOpen(event),
      opensAt: opensAt ? opensAt.toISOString() : null,
      closesAt: closesAt ? closesAt.toISOString() : null,
    });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { code, name, email } = body;
  if (!code || !name || !email) return json({ ok: false, error: 'Code, name, and email are required.' }, 400);

  const event = findEventByCode(events, code);
  if (!event) return json({ ok: false, error: 'Invalid check-in code.' }, 404);
  if (!isCheckinOpen(event)) return json({ ok: false, error: 'Check-in is not open for this event right now.' }, 403);

  const [members, attendance] = await Promise.all([
    getCollection('members', []),
    getCollection('attendance', []),
  ]);

  let member = members.find(m => normEmail(m.email) === normEmail(email));
  if (!member) {
    member = { id: randomUUID(), name, email, year: '', voicePart: '', joinedAt: new Date().toISOString(), active: true };
    members.push(member);
    await setCollection('members', members);
  }

  const already = attendance.find(a => a.eventId === event.id && a.memberId === member.id);
  if (already) return json({ ok: true, alreadyCheckedIn: true });

  attendance.push({
    id: randomUUID(), eventId: event.id, eventTitle: event.title,
    memberId: member.id, name: member.name, email: member.email,
    checkedInAt: new Date().toISOString(),
  });
  await setCollection('attendance', attendance);

  return json({ ok: true, alreadyCheckedIn: false });
}
