import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { hasPermission } from './_lib/permissions.mjs';
import { generateCheckinCode } from './_lib/codes.mjs';
import { parseEventsCsv } from './_lib/parseEventsCsv.mjs';
import { SEED_EVENTS_CSV } from './_lib/eventsSeedCsv.mjs';
import { isCheckinOpen } from './_lib/checkinWindow.mjs';

function dedupeKey(title, start) { return `${title.trim().toLowerCase()}|${start}`; }

// Public visitors never see the code or the exact window boundaries (those
// stay E-Board-only), but they do need to know whether check-in is open
// right now so events.html can enable/disable its "Check In" button.
function publicEvent(ev) {
  const { checkinCode, checkinOpensAt, checkinClosesAt, ...safe } = ev;
  return { ...safe, checkinOpen: isCheckinOpen(ev) };
}

// Only members who can actually manage events get the check-in code back —
// otherwise any member account (not just event_coordinator/president) could
// read and share codes meant to be handed out in person.
async function canManageEvents(req) {
  const token = getSessionUser(req);
  if (!token) return false;
  const members = await loadMembers();
  const m = members.find(x => x.id === token.id && x.hasAccount && x.active !== false);
  return m ? hasPermission(m.role, 'events') : false;
}

// If nothing has been created yet, seed from the retired Google Sheet
// snapshot — same auto-migrate pattern as portal-library.mjs/portal-content.mjs,
// so events show up without anyone needing to be logged in to import them.
async function loadEvents() {
  const events = await getCollection('events', []);
  if (events.length > 0) return events;
  const seeded = parseEventsCsv(SEED_EVENTS_CSV).map(ev => ({
    id: randomUUID(), ...ev, points: 1,
    checkinCode: generateCheckinCode(),
    checkinOpensAt: '', checkinClosesAt: '',
  }));
  await setCollection('events', seeded);
  return seeded;
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const events = await loadEvents();
    const authed = await canManageEvents(req);
    return json({ ok: true, events: authed ? events : events.map(publicEvent) });
  }

  const auth = await requireAuth(req, { perm: 'events' });
  if (auth.deny) return auth.deny;

  const events = await loadEvents();

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST' && body.op === 'importFromSheet') {
    const parsed = parseEventsCsv(SEED_EVENTS_CSV);
    const existingKeys = new Set(events.map(e => dedupeKey(e.title, e.start)));
    let added = 0;
    for (const ev of parsed) {
      const key = dedupeKey(ev.title, ev.start);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      events.push({
        id: randomUUID(), ...ev, points: 1,
        checkinCode: generateCheckinCode(),
        checkinOpensAt: '', checkinClosesAt: '',
      });
      added++;
    }
    await setCollection('events', events);
    return json({ ok: true, added, skipped: parsed.length - added, total: events.length });
  }

  if (req.method === 'POST') {
    const { title, description, location, start, end, tags, signinLink, imageUrl, checkinOpensAt, checkinClosesAt, points } = body;
    if (!title || !start) return json({ ok: false, error: 'Title and start date/time are required.' }, 400);
    const event = {
      id: randomUUID(), title, description: description || '', location: location || '',
      start, end: end || start, tags: Array.isArray(tags) ? tags : [],
      signinLink: signinLink || '', imageUrl: imageUrl || '',
      points: typeof points === 'number' ? points : 1,
      checkinCode: generateCheckinCode(),
      checkinOpensAt: checkinOpensAt || '', checkinClosesAt: checkinClosesAt || '',
    };
    events.push(event);
    await setCollection('events', events);
    return json({ ok: true, event });
  }

  if (req.method === 'PATCH') {
    const target = events.find(e => e.id === body.id);
    if (!target) return json({ ok: false, error: 'Event not found.' }, 404);
    for (const f of ['title', 'description', 'location', 'start', 'end', 'signinLink', 'imageUrl', 'checkinOpensAt', 'checkinClosesAt']) {
      if (f in body) target[f] = body[f];
    }
    if ('points' in body) target.points = Number(body.points);
    if ('tags' in body) target.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.regenerateCode) target.checkinCode = generateCheckinCode();
    await setCollection('events', events);
    return json({ ok: true, event: target });
  }

  if (req.method === 'DELETE') {
    if (!events.some(e => e.id === body.id)) return json({ ok: false, error: 'Event not found.' }, 404);
    await setCollection('events', events.filter(e => e.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
