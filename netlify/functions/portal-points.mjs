import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { isCheckinOpen } from './_lib/checkinWindow.mjs';
import { easternDateOnly } from './_lib/dateFmt.mjs';
import {
  loadEventDefaults, saveEventDefaults, DEFAULT_EVENT_POINTS,
  VOLUNTEER_SLOT_KEY, BAKE_SALE_SLOT_KEY, BAKE_SALE_ITEM_KEY,
} from './_lib/eventDefaults.mjs';

const EDITABLE_DEFAULT_KEYS = [...Object.keys(DEFAULT_EVENT_POINTS), VOLUNTEER_SLOT_KEY, BAKE_SALE_SLOT_KEY, BAKE_SALE_ITEM_KEY];

function withDeciderNames(rows, members) {
  const nameById = new Map(members.map(m => [m.id, m.name]));
  return rows.map(p => p.decidedBy ? { ...p, decidedByName: nameById.get(p.decidedBy) || null } : p);
}

export default async function handler(req) {
  const url = new URL(req.url);

  // ── Self check-in: any signed-in account, no special permission ──
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

    if (body.action === 'checkin') {
      const auth = await requireAuth(req);
      if (auth.deny) return auth.deny;
      const { user: me } = auth;

      if (!body.eventId) return json({ ok: false, error: 'eventId is required.' }, 400);
      const events = await getCollection('events', []);
      const event = events.find(e => e.id === body.eventId);
      if (!event) return json({ ok: false, error: 'Event not found.' }, 404);
      if ((event.tags || []).includes('Volunteer')) {
        return json({ ok: false, error: 'This is a volunteer event — sign up for it on the Events page instead of checking in.' }, 400);
      }
      if (!isCheckinOpen(event)) return json({ ok: false, error: 'Check-in is not open for this event right now.' }, 403);

      const points = await getCollection('points', []);
      if (points.some(p => p.eventId === event.id && p.memberId === me.id && p.status !== 'denied')) {
        return json({ ok: true, alreadyCheckedIn: true });
      }
      const entry = {
        id: randomUUID(), memberId: me.id, memberName: me.name, memberEmail: me.email,
        source: 'event', eventId: event.id, eventTitle: event.title,
        amount: typeof event.points === 'number' ? event.points : 1,
        status: 'pending', reason: '',
        requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
      };
      points.push(entry);
      await setCollection('points', points);
      return json({ ok: true, alreadyCheckedIn: false });
    }

    // ── Set an event's point value — scoped narrower than full 'events'
    // permission, since the secretary manages points but not event details.
    if (body.action === 'setEventPoints') {
      const auth = await requireAuth(req, { perm: 'points' });
      if (auth.deny) return auth.deny;
      const { eventId, points } = body;
      if (!eventId || typeof points !== 'number') return json({ ok: false, error: 'eventId and a numeric points value are required.' }, 400);
      const events = await getCollection('events', []);
      const event = events.find(e => e.id === eventId);
      if (!event) return json({ ok: false, error: 'Event not found.' }, 404);
      event.points = points;
      // Setting it from the Points tab (secretary/president only) IS the
      // sign-off for full-day headcount events — that's the whole point of
      // the "organizer picks a number, secretary approves it" flow.
      if (event.volunteerType === 'full_event') event.pointsApprovedBySecretary = true;
      await setCollection('events', events);
      return json({ ok: true, event });
    }

    // ── Approve a full-day volunteer event's points value without changing
    // it — for when the secretary agrees with what the organizer entered.
    if (body.action === 'approveEventPoints') {
      const auth = await requireAuth(req, { perm: 'points' });
      if (auth.deny) return auth.deny;
      const events = await getCollection('events', []);
      const event = events.find(e => e.id === body.eventId);
      if (!event) return json({ ok: false, error: 'Event not found.' }, 404);
      event.pointsApprovedBySecretary = true;
      await setCollection('events', events);
      return json({ ok: true, event });
    }

    // ── Add someone to an event's attendance after the fact (they forgot to
    // check in, or checked in in person on paper) — scoped to 'events' since
    // it's attendance record-keeping, not the points-approval workflow
    // itself. Still lands as a normal pending entry so the secretary
    // reviews it like any other attendance.
    if (body.action === 'addAttendance') {
      const auth = await requireAuth(req, { perm: 'events' });
      if (auth.deny) return auth.deny;
      const { user: me } = auth;
      const { eventId, memberId } = body;
      if (!eventId || !memberId) return json({ ok: false, error: 'eventId and memberId are required.' }, 400);

      const events = await getCollection('events', []);
      const event = events.find(e => e.id === eventId);
      if (!event) return json({ ok: false, error: 'Event not found.' }, 404);

      const members = await loadMembers();
      const member = members.find(m => m.id === memberId);
      if (!member) return json({ ok: false, error: 'Member not found.' }, 404);

      const points = await getCollection('points', []);
      if (points.some(p => p.eventId === eventId && p.memberId === memberId && p.status !== 'denied')) {
        return json({ ok: false, error: `${member.name} is already on this event's attendance.` }, 409);
      }
      const entry = {
        id: randomUUID(), memberId: member.id, memberName: member.name, memberEmail: member.email,
        source: 'event', eventId: event.id, eventTitle: event.title,
        amount: typeof event.points === 'number' ? event.points : 1,
        status: 'pending', reason: `Added by ${me.name}`,
        addedBy: me.id, addedByName: me.name,
        requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
      };
      points.push(entry);
      await setCollection('points', points);
      return json({ ok: true, entry });
    }

    // ── Update one tag's default attendance points — Points tab's "Edit
    // Event Defaults", scoped like setEventPoints above.
    if (body.action === 'setEventDefault') {
      const auth = await requireAuth(req, { perm: 'points' });
      if (auth.deny) return auth.deny;
      const { tag, points } = body;
      if (!tag || !EDITABLE_DEFAULT_KEYS.includes(tag) || typeof points !== 'number') {
        return json({ ok: false, error: 'A known tag and a numeric points value are required.' }, 400);
      }
      const defaults = await loadEventDefaults();
      defaults[tag] = points;
      await saveEventDefaults(defaults);
      return json({ ok: true, defaults });
    }

    // ── Manual award — secretary/president only, still goes through the
    // normal pending-approval queue like every other point entry, rather
    // than being auto-approved just because a secretary/president entered
    // it directly. Keeps one single review step for all point changes.
    if (body.action === 'manualAward') {
      const auth = await requireAuth(req, { perm: 'points' });
      if (auth.deny) return auth.deny;
      const { user: me } = auth;
      const { memberId, amount, reason } = body;
      if (!memberId || !amount || !reason) return json({ ok: false, error: 'Member, amount, and reason are required.' }, 400);

      const members = await loadMembers();
      const member = members.find(m => m.id === memberId);
      if (!member) return json({ ok: false, error: 'Member not found.' }, 404);

      const points = await getCollection('points', []);
      const entry = {
        id: randomUUID(), memberId: member.id, memberName: member.name, memberEmail: member.email,
        source: 'manual', eventId: null, eventTitle: null,
        amount: Number(amount), status: 'pending', reason,
        addedBy: me.id, addedByName: me.name,
        requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
      };
      points.push(entry);
      await setCollection('points', points);
      return json({ ok: true, entry });
    }

    return json({ ok: false, error: 'Unknown action.' }, 400);
  }

  // ── Everything below requires the 'points' permission (secretary/president) ──
  if (req.method === 'GET') {
    if (url.searchParams.get('defaults')) {
      const auth = await requireAuth(req, { perm: 'points' });
      if (auth.deny) return auth.deny;
      return json({ ok: true, defaults: await loadEventDefaults() });
    }
    if (url.searchParams.get('mine')) {
      const auth = await requireAuth(req);
      if (auth.deny) return auth.deny;
      const [points, members] = await Promise.all([getCollection('points', []), loadMembers()]);
      return json({ ok: true, points: withDeciderNames(points.filter(p => p.memberId === auth.user.id), members) });
    }
    // Export Attendance (Events tab) — gated by 'events' rather than
    // 'points', since it's who showed up, not the point-approval workflow.
    // Denied check-ins (mistaken/fraudulent) are excluded; pending ones
    // still count as attendance even before a secretary approves the points.
    if (url.searchParams.get('eventId')) {
      const auth = await requireAuth(req, { perm: 'events' });
      if (auth.deny) return auth.deny;
      const [points, members] = await Promise.all([getCollection('points', []), loadMembers()]);
      const photoById = new Map(members.map(m => [m.id, m.photoUrl || null]));
      const eventId = url.searchParams.get('eventId');
      const rows = withDeciderNames(points.filter(p => p.eventId === eventId && p.status !== 'denied'), members)
        .map(p => ({ ...p, memberPhotoUrl: photoById.get(p.memberId) || null }));
      return json({ ok: true, points: rows });
    }
    const auth = await requireAuth(req, { perm: 'points' });
    if (auth.deny) return auth.deny;
    const [points, members] = await Promise.all([getCollection('points', []), loadMembers()]);
    const status = url.searchParams.get('status');
    const memberId = url.searchParams.get('memberId');
    let rows = points;
    if (status) rows = rows.filter(p => p.status === status);
    if (memberId) rows = rows.filter(p => p.memberId === memberId);
    // A volunteer signup (bake sale slot/items, full-day) can happen weeks
    // ahead of the event — the secretary shouldn't see it in the approval
    // queue (and can't meaningfully approve it) until the event has
    // actually happened, so hold those out of the *pending* list until then.
    // The signup itself, and its capacity/occupant effects, exist from the
    // moment someone signs up; only this queue's visibility is delayed.
    if (status === 'pending') {
      const events = await getCollection('events', []);
      const eventStartById = new Map(events.map(e => [e.id, e.start]));
      const today = easternDateOnly(new Date());
      rows = rows.filter(p => {
        if (!p.source?.startsWith('volunteer-')) return true;
        const start = eventStartById.get(p.eventId);
        return !start || easternDateOnly(start) <= today;
      });
    }
    return json({ ok: true, points: withDeciderNames(rows, members) });
  }

  const auth = await requireAuth(req, { perm: 'points' });
  if (auth.deny) return auth.deny;

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(url.searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'PATCH') {
    const points = await getCollection('points', []);
    const target = points.find(p => p.id === body.id);
    if (!target) return json({ ok: false, error: 'Entry not found.' }, 404);
    if ('amount' in body) target.amount = Number(body.amount);
    if (body.status && ['approved', 'denied', 'pending'].includes(body.status)) {
      target.status = body.status;
      target.decidedAt = body.status === 'pending' ? null : new Date().toISOString();
      target.decidedBy = body.status === 'pending' ? null : auth.user.id;
    }
    await setCollection('points', points);
    return json({ ok: true, entry: target });
  }

  if (req.method === 'DELETE') {
    const points = await getCollection('points', []);
    if (!points.some(p => p.id === body.id)) return json({ ok: false, error: 'Entry not found.' }, 404);
    await setCollection('points', points.filter(p => p.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
