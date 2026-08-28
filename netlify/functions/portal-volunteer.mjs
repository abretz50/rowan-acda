import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { generateSlots, POINTS_PER_SLOT } from './_lib/volunteerSlots.mjs';

const FOOD_DEFAULT_POINTS = 10;

// Volunteer events don't use the check-in code/window system at all — they
// use their own signup flow (slots for bake_sale/time_slot, a single signup
// for full_event, plus a separate "bring food" option on bake sales), open
// any time up until the event ends. Every signup becomes a normal pending
// points entry, so it goes through the same secretary approval queue as
// everything else instead of needing its own review UI.
export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const eventId = url.searchParams.get('eventId');
    if (!eventId) return json({ ok: false, error: 'eventId is required.' }, 400);
    const events = await getCollection('events', []);
    const event = events.find(e => e.id === eventId);
    if (!event) return json({ ok: false, error: 'Event not found.' }, 404);

    const points = await getCollection('points', []);
    const activeForEvent = points.filter(p => p.eventId === eventId && p.status !== 'denied');
    const token = getSessionUser(req);
    const myEntries = token ? activeForEvent.filter(p => p.memberId === token.id) : [];

    if (!event.volunteerType) {
      return json({ ok: true, volunteerType: '', slots: [], notConfigured: true });
    }

    if (event.volunteerType === 'full_event') {
      return json({ ok: true, volunteerType: 'full_event', signedUp: myEntries.some(p => p.source === 'volunteer-full') });
    }

    const slots = generateSlots(event).map(s => ({
      label: s.label,
      remaining: Math.max(0, (event.slotCapacity || 3) - activeForEvent.filter(p => p.source === 'volunteer-slot' && p.slotLabel === s.label).length),
    }));
    return json({
      ok: true,
      volunteerType: event.volunteerType,
      slots,
      pointsPerSlot: POINTS_PER_SLOT,
      mySlotLabels: myEntries.filter(p => p.source === 'volunteer-slot').map(p => p.slotLabel),
      broughtFood: myEntries.some(p => p.source === 'volunteer-food'),
    });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  const { user: me } = auth;

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { eventId, kind, slotLabel } = body;
  if (!eventId || !kind) return json({ ok: false, error: 'eventId and kind are required.' }, 400);

  const events = await getCollection('events', []);
  const event = events.find(e => e.id === eventId);
  if (!event || !(event.tags || []).includes('Volunteer')) return json({ ok: false, error: 'Not a volunteer event.' }, 400);
  if (new Date(event.end || event.start) < new Date()) return json({ ok: false, error: 'This event has already ended.' }, 403);

  const points = await getCollection('points', []);
  const alreadyHas = (source, extra = {}) => points.some(p =>
    p.eventId === eventId && p.memberId === me.id && p.source === source && p.status !== 'denied' &&
    (!('slotLabel' in extra) || p.slotLabel === extra.slotLabel));

  function pushEntry(entry) {
    points.push({
      id: randomUUID(), memberId: me.id, memberName: me.name, memberEmail: me.email,
      eventId, eventTitle: event.title, slotLabel: null,
      status: 'pending', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
      ...entry,
    });
  }

  if (kind === 'slot') {
    if (event.volunteerType !== 'bake_sale' && event.volunteerType !== 'time_slot') {
      return json({ ok: false, error: 'This event does not use time slots.' }, 400);
    }
    if (!slotLabel) return json({ ok: false, error: 'slotLabel is required.' }, 400);
    if (!generateSlots(event).some(s => s.label === slotLabel)) return json({ ok: false, error: 'Invalid slot.' }, 400);
    if (alreadyHas('volunteer-slot', { slotLabel })) return json({ ok: true, alreadySignedUp: true });
    const taken = points.filter(p => p.eventId === eventId && p.slotLabel === slotLabel && p.source === 'volunteer-slot' && p.status !== 'denied').length;
    if (taken >= (event.slotCapacity || 3)) return json({ ok: false, error: 'That slot is full.' }, 409);
    pushEntry({ source: 'volunteer-slot', slotLabel, amount: POINTS_PER_SLOT, reason: `Volunteer slot: ${slotLabel}` });
    await setCollection('points', points);
    return json({ ok: true, alreadySignedUp: false });
  }

  if (kind === 'food') {
    if (event.volunteerType !== 'bake_sale') return json({ ok: false, error: 'This event does not take food donations.' }, 400);
    if (alreadyHas('volunteer-food')) return json({ ok: true, alreadySignedUp: true });
    pushEntry({ source: 'volunteer-food', amount: FOOD_DEFAULT_POINTS, reason: 'Brought food' });
    await setCollection('points', points);
    return json({ ok: true, alreadySignedUp: false });
  }

  if (kind === 'full') {
    if (event.volunteerType !== 'full_event') return json({ ok: false, error: 'This event does not use full-day signup.' }, 400);
    if (alreadyHas('volunteer-full')) return json({ ok: true, alreadySignedUp: true });
    pushEntry({ source: 'volunteer-full', amount: 0, reason: 'Volunteered — amount to be set by secretary' });
    await setCollection('points', points);
    return json({ ok: true, alreadySignedUp: false });
  }

  return json({ ok: false, error: 'Unknown kind.' }, 400);
}
