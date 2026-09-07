import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { hasPermission } from './_lib/permissions.mjs';
import { parseEventsCsv } from './_lib/parseEventsCsv.mjs';
import { SEED_EVENTS_CSV } from './_lib/eventsSeedCsv.mjs';
import { isCheckinOpen } from './_lib/checkinWindow.mjs';
import { defaultPointsForTags } from './_lib/eventDefaults.mjs';

function dedupeKey(title, start) { return `${title.trim().toLowerCase()}|${start}`; }

// Compares calendar dates in Eastern time (not the raw UTC ISO string,
// which can roll over to the next date for a late-evening Eastern time) —
// used to enforce "start and end must be the same day unless it's an
// all-day/multi-day event".
function easternDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Public visitors never see the exact check-in window boundaries (those stay
// E-Board-only), but they do need to know whether check-in is open right now
// so events.html can enable/disable its "Check In" button.
function publicEvent(ev) {
  const { checkinOpensAt, checkinClosesAt, ...safe } = ev;
  return { ...safe, checkinOpen: isCheckinOpen(ev) };
}

async function canManageEvents(req) {
  const token = getSessionUser(req);
  if (!token) return false;
  const members = await loadMembers();
  const m = members.find(x => x.id === token.id && x.hasAccount && x.active !== false);
  return m ? await hasPermission(m.role, 'events') : false;
}

// If nothing has been created yet, seed from the retired Google Sheet
// snapshot — same auto-migrate pattern as portal-library.mjs/portal-content.mjs,
// so events show up without anyone needing to be logged in to import them.
async function loadEvents() {
  const events = await getCollection('events', []);
  if (events.length > 0) return events;
  const seeded = parseEventsCsv(SEED_EVENTS_CSV).map(ev => ({
    id: randomUUID(), ...ev, points: 1,
    checkinOpensAt: '', checkinClosesAt: '',
  }));
  await setCollection('events', seeded);
  return seeded;
}

export default async function handler(req) {
  if (req.method === 'GET') {
    // Minimal roster lookup for the Events tab's "add someone to
    // attendance" search — scoped to 'events' rather than the stricter
    // 'members' permission, since an event coordinator without roster
    // access still needs to record who showed up.
    if (new URL(req.url).searchParams.get('membersForAttendance')) {
      if (!(await canManageEvents(req))) return json({ ok: false, error: 'Not authorized.' }, 403);
      const members = await loadMembers();
      return json({
        ok: true,
        members: members.filter(m => m.role !== 'admin' && m.active !== false)
          .map(m => ({ id: m.id, name: m.name, email: m.email, photoUrl: m.photoUrl || null })),
      });
    }
    const events = await loadEvents();
    // Whether to include full admin-only fields is driven by which VIEW is
    // being requested (?admin=1, sent only by the portal's own Events tab),
    // not just whether the requester happens to be signed in — otherwise an
    // E-Board member with Events access browsing the PUBLIC events page
    // would get the raw admin records (which have no computed `checkinOpen`
    // field), breaking their own check-in buttons. Same bug/fix pattern as
    // portal-library.mjs's archived-sets leak.
    const wantsAdmin = new URL(req.url).searchParams.get('admin') === '1';
    const authed = wantsAdmin && await canManageEvents(req);
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
        checkinOpensAt: '', checkinClosesAt: '',
      });
      added++;
    }
    await setCollection('events', events);
    return json({ ok: true, added, skipped: parsed.length - added, total: events.length });
  }

  if (req.method === 'POST') {
    const {
      title, description, location, start, end, tags, signinLink, imageUrl,
      checkinOpensAt, checkinClosesAt, points, volunteerType, slotCapacity, allDay,
      fullDayCapacity, slotMode, slotDurationMinutes, customSlots,
    } = body;
    if (!title || !start) return json({ ok: false, error: 'Title and start date/time are required.' }, 400);
    if (!imageUrl) return json({ ok: false, error: 'An image is required to create an event.' }, 400);
    if (!allDay && end && easternDate(end) !== easternDate(start)) {
      return json({ ok: false, error: 'Start and end must be on the same date unless allDay is set.' }, 400);
    }
    const finalTags = Array.isArray(tags) ? tags : [];
    const finalVolunteerType = finalTags.includes('Volunteer') ? (volunteerType || '') : '';
    // Full-day headcount volunteer events have no store-wide default points
    // value — the organizer has to type one in, and it's flagged below for
    // the secretary to sign off on (pointsApprovedBySecretary).
    if (finalVolunteerType === 'full_event' && typeof points !== 'number') {
      return json({ ok: false, error: 'Full-day volunteer events have no default points value — enter one for the secretary to review.' }, 400);
    }
    const event = {
      id: randomUUID(), title, description: description || '', location: location || '',
      start, end: end || start, allDay: !!allDay, tags: finalTags,
      signinLink: signinLink || '', imageUrl,
      points: finalVolunteerType === 'full_event' ? Number(points) : (typeof points === 'number' ? points : await defaultPointsForTags(finalTags)),
      checkinOpensAt: checkinOpensAt || '', checkinClosesAt: checkinClosesAt || '',
      volunteerType: finalVolunteerType,
      slotCapacity: typeof slotCapacity === 'number' && slotCapacity > 0 ? slotCapacity : 3,
      fullDayCapacity: finalVolunteerType === 'full_event' ? (Number(fullDayCapacity) || 10) : null,
      slotMode: finalVolunteerType === 'time_slot' ? (slotMode === 'custom' ? 'custom' : 'equal') : '',
      slotDurationMinutes: finalVolunteerType === 'time_slot' ? (Number(slotDurationMinutes) || 30) : null,
      customSlots: finalVolunteerType === 'time_slot' && slotMode === 'custom' && Array.isArray(customSlots)
        ? customSlots.filter(s => s && s.label && s.start && s.end).map(s => ({ label: String(s.label), start: s.start, end: s.end }))
        : [],
      // Only the full-day headcount type needs review — every other type's
      // points either come from the tag defaults or a per-slot default, both
      // already secretary-managed on the Points tab.
      pointsApprovedBySecretary: finalVolunteerType !== 'full_event',
    };
    events.push(event);
    await setCollection('events', events);
    return json({ ok: true, event });
  }

  if (req.method === 'PATCH') {
    const target = events.find(e => e.id === body.id);
    if (!target) return json({ ok: false, error: 'Event not found.' }, 404);
    if ('imageUrl' in body && !body.imageUrl) return json({ ok: false, error: 'An event must have an image.' }, 400);
    for (const f of ['title', 'description', 'location', 'start', 'end', 'signinLink', 'imageUrl', 'checkinOpensAt', 'checkinClosesAt', 'volunteerType']) {
      if (f in body) target[f] = body[f];
    }
    if ('allDay' in body) target.allDay = !!body.allDay;
    if ('points' in body) {
      const newPoints = Number(body.points);
      // Changing a full-day event's points value through the Events tab
      // (not the Points tab) re-flags it for secretary review — but only
      // when the number actually changes, so re-saving the event for an
      // unrelated edit doesn't silently revoke an existing approval.
      if (target.volunteerType === 'full_event' && newPoints !== target.points) target.pointsApprovedBySecretary = false;
      target.points = newPoints;
    }
    if ('tags' in body) target.tags = Array.isArray(body.tags) ? body.tags : [];
    if ('slotCapacity' in body) target.slotCapacity = Number(body.slotCapacity) || 3;
    if ('fullDayCapacity' in body) target.fullDayCapacity = Number(body.fullDayCapacity) || 10;
    if ('slotMode' in body) target.slotMode = body.slotMode === 'custom' ? 'custom' : 'equal';
    if ('slotDurationMinutes' in body) target.slotDurationMinutes = Number(body.slotDurationMinutes) || 30;
    if ('customSlots' in body) {
      target.customSlots = Array.isArray(body.customSlots)
        ? body.customSlots.filter(s => s && s.label && s.start && s.end).map(s => ({ label: String(s.label), start: s.start, end: s.end }))
        : [];
    }
    if (!target.tags.includes('Volunteer')) target.volunteerType = '';
    if (target.volunteerType !== 'full_event') target.pointsApprovedBySecretary = true;
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
