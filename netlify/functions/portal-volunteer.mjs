import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { generateSlots } from './_lib/volunteerSlots.mjs';
import { volunteerSlotPointsDefault, bakeSaleSlotPointsDefault, bakeSaleItemPointsDefault } from './_lib/eventDefaults.mjs';

const MAX_BAKE_SALE_ITEMS = 4;

// Volunteer events don't use the check-in code/window system at all — they
// use their own signup flow (slots for bake_sale/time_slot, a bake-sale
// item donation signup, and a single full-day headcount signup for
// full_event), open any time up until the event ends. Every signup becomes
// a normal pending points entry, so it goes through the same secretary
// approval queue as everything else instead of needing its own review UI.
export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const eventId = url.searchParams.get('eventId');
    if (!eventId) return json({ ok: false, error: 'eventId is required.' }, 400);
    const events = await getCollection('events', []);
    const event = events.find(e => e.id === eventId);
    if (!event) return json({ ok: false, error: 'Event not found.' }, 404);

    const [points, members] = await Promise.all([getCollection('points', []), loadMembers()]);
    const photoById = new Map(members.map(m => [m.id, m.photoUrl || null]));
    const activeForEvent = points.filter(p => p.eventId === eventId && p.status !== 'denied');
    const token = getSessionUser(req);
    const myEntries = token ? activeForEvent.filter(p => p.memberId === token.id) : [];

    if (!event.volunteerType) {
      return json({ ok: true, volunteerType: '', slots: [], notConfigured: true });
    }

    if (event.volunteerType === 'full_event') {
      const activeSignups = activeForEvent.filter(p => p.source === 'volunteer-full');
      const capacity = event.fullDayCapacity || null;
      return json({
        ok: true, volunteerType: 'full_event', description: event.description || '',
        signedUp: activeSignups.some(p => p.memberId === (token?.id)),
        capacity, remaining: capacity ? Math.max(0, capacity - activeSignups.length) : null,
        signedUpMembers: activeSignups.map(p => ({ name: p.memberName, photoUrl: photoById.get(p.memberId) || null })),
      });
    }

    const slots = generateSlots(event).map(s => {
      const occupantEntries = activeForEvent.filter(p => p.source === 'volunteer-slot' && p.slotLabel === s.label);
      const capacity = event.slotCapacity || 3;
      return {
        label: s.label, capacity, remaining: Math.max(0, capacity - occupantEntries.length),
        // One entry per filled seat, in order — the client renders exactly
        // `capacity` boxes per slot, filling them with these occupants
        // first and an empty "Sign Up" button for the rest.
        occupants: occupantEntries.map(p => ({ name: p.memberName, photoUrl: photoById.get(p.memberId) || null, isMe: p.memberId === (token?.id) })),
      };
    });

    const result = {
      ok: true, volunteerType: event.volunteerType, description: event.description || '', slots,
      pointsPerSlot: event.volunteerType === 'bake_sale' ? await bakeSaleSlotPointsDefault() : await volunteerSlotPointsDefault(),
      mySlotLabels: myEntries.filter(p => p.source === 'volunteer-slot').map(p => p.slotLabel),
    };

    if (event.volunteerType === 'bake_sale') {
      const itemEntries = activeForEvent.filter(p => p.source === 'volunteer-items');
      const myItemEntry = itemEntries.find(p => p.memberId === token?.id);
      result.pointsPerItem = await bakeSaleItemPointsDefault();
      result.maxItems = MAX_BAKE_SALE_ITEMS;
      result.itemSignups = itemEntries.map(p => ({ name: p.memberName, photoUrl: photoById.get(p.memberId) || null, itemCount: p.itemCount || 0, items: p.items || '', isMe: p.memberId === (token?.id) }));
      result.myItemCount = myItemEntry?.itemCount || 0;
      result.myItems = myItemEntry?.items || '';
    }

    return json(result);
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  const { user: me } = auth;

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { eventId, kind, slotLabel, itemCount, items } = body;
  if (!eventId || !kind) return json({ ok: false, error: 'eventId and kind are required.' }, 400);

  const events = await getCollection('events', []);
  const event = events.find(e => e.id === eventId);
  if (!event || !(event.tags || []).includes('Volunteer')) return json({ ok: false, error: 'Not a volunteer event.' }, 400);
  const unsigning = kind === 'unsign-slot' || kind === 'unsign-items';
  if (!unsigning && new Date(event.end || event.start) < new Date()) {
    return json({ ok: false, error: 'This event has already ended.' }, 403);
  }

  const points = await getCollection('points', []);
  const alreadyHas = (source, extra = {}) => points.some(p =>
    p.eventId === eventId && p.memberId === me.id && p.source === source && p.status !== 'denied' &&
    (!('slotLabel' in extra) || p.slotLabel === extra.slotLabel));

  function pushEntry(entry) {
    const record = {
      id: randomUUID(), memberId: me.id, memberName: me.name, memberEmail: me.email,
      eventId, eventTitle: event.title, slotLabel: null,
      status: 'pending', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
      ...entry,
    };
    points.push(record);
    return record;
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
    const amount = event.volunteerType === 'bake_sale' ? await bakeSaleSlotPointsDefault() : await volunteerSlotPointsDefault();
    pushEntry({ source: 'volunteer-slot', slotLabel, amount, reason: `Volunteer slot: ${slotLabel}` });
    await setCollection('points', points);
    return json({ ok: true, alreadySignedUp: false });
  }

  if (kind === 'unsign-slot') {
    if (!slotLabel) return json({ ok: false, error: 'slotLabel is required.' }, 400);
    const idx = points.findIndex(p => p.eventId === eventId && p.memberId === me.id && p.source === 'volunteer-slot' && p.slotLabel === slotLabel && p.status !== 'denied');
    if (idx === -1) return json({ ok: false, error: 'You are not signed up for that slot.' }, 404);
    if (points[idx].status === 'approved') return json({ ok: false, error: 'This was already approved — ask the secretary to remove it.' }, 409);
    points.splice(idx, 1);
    await setCollection('points', points);
    return json({ ok: true });
  }

  // Bake-sale item donation — up to MAX_BAKE_SALE_ITEMS items, worth a flat
  // amount each, one entry per member (re-signing up replaces the count
  // and description rather than stacking a second entry, since it's still
  // pending review either way).
  if (kind === 'items') {
    if (event.volunteerType !== 'bake_sale') return json({ ok: false, error: 'This event does not take baked item signups.' }, 400);
    const count = Math.round(Number(itemCount));
    if (!count || count < 1 || count > MAX_BAKE_SALE_ITEMS) {
      return json({ ok: false, error: `Enter between 1 and ${MAX_BAKE_SALE_ITEMS} items.` }, 400);
    }
    const description = String(items || '').trim();
    if (!description) return json({ ok: false, error: 'Say what you\'re bringing (e.g. "2 dozen cookies, 1 tray of brownies").' }, 400);
    const existing = points.find(p => p.eventId === eventId && p.memberId === me.id && p.source === 'volunteer-items' && p.status !== 'denied');
    const perItem = await bakeSaleItemPointsDefault();
    if (existing) {
      if (existing.status === 'approved') return json({ ok: false, error: 'Your item signup was already approved — ask the secretary to adjust it if it changed.' }, 409);
      existing.itemCount = count;
      existing.items = description;
      existing.amount = count * perItem;
      existing.reason = `Bringing ${count} item${count !== 1 ? 's' : ''}: ${description}`;
    } else {
      pushEntry({ source: 'volunteer-items', itemCount: count, items: description, amount: count * perItem, reason: `Bringing ${count} item${count !== 1 ? 's' : ''}: ${description}` });
    }
    await setCollection('points', points);
    return json({ ok: true });
  }

  if (kind === 'unsign-items') {
    const idx = points.findIndex(p => p.eventId === eventId && p.memberId === me.id && p.source === 'volunteer-items' && p.status !== 'denied');
    if (idx === -1) return json({ ok: false, error: 'You do not have an item signup for this event.' }, 404);
    if (points[idx].status === 'approved') return json({ ok: false, error: 'This was already approved — ask the secretary to remove it.' }, 409);
    points.splice(idx, 1);
    await setCollection('points', points);
    return json({ ok: true });
  }

  if (kind === 'full') {
    if (event.volunteerType !== 'full_event') return json({ ok: false, error: 'This event does not use full-day signup.' }, 400);
    if (alreadyHas('volunteer-full')) return json({ ok: true, alreadySignedUp: true });
    const activeCount = points.filter(p => p.eventId === eventId && p.source === 'volunteer-full' && p.status !== 'denied').length;
    if (event.fullDayCapacity && activeCount >= event.fullDayCapacity) {
      return json({ ok: false, error: 'This event is already full.' }, 409);
    }
    pushEntry({ source: 'volunteer-full', amount: typeof event.points === 'number' ? event.points : 0, reason: 'Full-day volunteer signup' });
    await setCollection('points', points);
    return json({ ok: true, alreadySignedUp: false });
  }

  return json({ ok: false, error: 'Unknown kind.' }, 400);
}
