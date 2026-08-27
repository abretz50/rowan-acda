import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

function toCSV(rows, header) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [header.map(esc).join(',')]
    .concat(rows.map(r => header.map(h => esc(r[h])).join(',')))
    .join('\n');
}

export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;

  const url = new URL(req.url);
  const attendance = await getCollection('attendance', []);

  if (req.method === 'GET') {
    if (url.searchParams.get('summary')) {
      const byMember = {};
      for (const a of attendance) {
        if (!byMember[a.memberId]) byMember[a.memberId] = { memberId: a.memberId, name: a.name, email: a.email, count: 0 };
        byMember[a.memberId].count++;
      }
      const summary = Object.values(byMember).sort((a, b) => b.count - a.count);
      if (url.searchParams.get('csv')) {
        return new Response(toCSV(summary, ['name', 'email', 'count']), {
          headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="attendance-summary.csv"' },
        });
      }
      return json({ ok: true, summary });
    }

    let rows = attendance;
    const eventId = url.searchParams.get('eventId');
    const memberId = url.searchParams.get('memberId');
    if (eventId) rows = rows.filter(a => a.eventId === eventId);
    if (memberId) rows = rows.filter(a => a.memberId === memberId);

    if (url.searchParams.get('csv')) {
      return new Response(toCSV(rows, ['eventTitle', 'name', 'email', 'checkedInAt']), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="attendance.csv"' },
      });
    }
    return json({ ok: true, attendance: rows });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(url.searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  // Manual add — for E-Board correcting a missed self check-in.
  if (req.method === 'POST') {
    const { eventId, memberId, name, email } = body;
    if (!eventId) return json({ ok: false, error: 'eventId is required.' }, 400);

    const events = await getCollection('events', []);
    const event = events.find(e => e.id === eventId);
    if (!event) return json({ ok: false, error: 'Event not found.' }, 404);

    const members = await getCollection('members', []);
    let member = memberId ? members.find(m => m.id === memberId) : null;
    if (!member && email) member = members.find(m => normEmail(m.email) === normEmail(email));
    if (!member) {
      if (!name || !email) return json({ ok: false, error: 'A known memberId, or a name and email, is required.' }, 400);
      member = { id: randomUUID(), name, email, year: '', voicePart: '', joinedAt: new Date().toISOString(), active: true };
      members.push(member);
      await setCollection('members', members);
    }

    if (attendance.some(a => a.eventId === eventId && a.memberId === member.id)) {
      return json({ ok: false, error: 'Already marked present for this event.' }, 409);
    }
    const record = {
      id: randomUUID(), eventId, eventTitle: event.title,
      memberId: member.id, name: member.name, email: member.email,
      checkedInAt: new Date().toISOString(),
    };
    attendance.push(record);
    await setCollection('attendance', attendance);
    return json({ ok: true, record });
  }

  if (req.method === 'DELETE') {
    if (!attendance.some(a => a.id === body.id)) return json({ ok: false, error: 'Record not found.' }, 404);
    await setCollection('attendance', attendance.filter(a => a.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
