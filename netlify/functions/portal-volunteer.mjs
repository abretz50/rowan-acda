import { randomUUID } from 'node:crypto';
import { getCollection, updateCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { generateSlots } from './_lib/volunteerSlots.mjs';
import { volunteerSlotPointsDefault, bakeSaleSlotPointsDefault, bakeSaleItemPointsDefault } from './_lib/eventDefaults.mjs';
import { sendEmail, memberEmails } from './_lib/email.mjs';
import { volunteerConfirmationEmailHtml } from './_lib/reminders.mjs';
import { gcalLink } from './_lib/gcal.mjs';
import { migrateOldVolunteerEntries } from './_lib/volunteerMigration.mjs';

const MAX_BAKE_SALE_ITEMS = 4;
// Signups (and unsigning) stay open until an hour after the event's own
// end time — not just up to the exact end — so someone can still log a
// slot they just worked instead of being locked out the instant it ends.
const SIGNUP_GRACE_MS = 60 * 60 * 1000;

// Volunteer events don't use the check-in code/window system at all — they
// use their own signup flow (slots for bake_sale/time_slot, a bake-sale
// item donation signup, and a single full-day headcount signup for
// full_event), open any time up until the event ends.
//
// Slot + item signups for the same person/event are kept as ONE
// consolidated pending points entry (source: 'volunteer', with a
// slotLabels array and an itemCount/items pair) rather than a separate
// entry per action — so the secretary reviews a single request per
// volunteer describing everything they signed up for, not a pile of
// one-line entries. Full-day headcount signups stay their own single
// entry (source: 'volunteer-full') since there's only ever one per person.
function recomputeVolunteerEntry(entry, perSlot, perItem) {
  const slotLabels = entry.slotLabels || [];
  const parts = [];
  let amount = 0;
  if (slotLabels.length) {
    amount += slotLabels.length * perSlot;
    parts.push(`Worked ${slotLabels.length} time slot${slotLabels.length !== 1 ? 's' : ''}: ${slotLabels.join(', ')}`);
  }
  if (entry.itemCount > 0) {
    amount += entry.itemCount * perItem;
    parts.push(`Brought ${entry.itemCount} item${entry.itemCount !== 1 ? 's' : ''}: ${entry.items}`);
  }
  entry.amount = amount;
  entry.reason = parts.join('. ');
}

// Pure mutation of `points` for one op — called from inside
// updateCollection's retry loop (same pattern as portal-gallery.mjs /
// portal-library.mjs), so it may run more than once per request if a
// concurrent write is detected. Returns { error, addedSlot } — error is
// null on success or { message, status } on a validation failure;
// addedSlot is true only when a genuinely new slot signup was just added
// (not a no-op re-click), which is when the immediate confirmation +
// calendar-link email should go out.
function applyVolunteerOp(points, event, me, kind, body, perSlot, perItem) {
  const { eventId, slotLabel, itemCount, items } = body;
  const findMine = () => points.find(p => p.eventId === eventId && p.memberId === me.id && p.source === 'volunteer' && p.status !== 'denied');
  const fail = (message, status) => ({ error: { message, status }, addedSlot: false });
  let addedSlot = false;

  if (kind === 'slot' || kind === 'unsign-slot') {
    if (event.volunteerType !== 'bake_sale' && event.volunteerType !== 'time_slot') {
      return fail('This event does not use time slots.', 400);
    }
    if (!slotLabel) return fail('slotLabel is required.', 400);
    if (!generateSlots(event).some(s => s.label === slotLabel)) return fail('Invalid slot.', 400);

    let mine = findMine();
    if (kind === 'slot') {
      if (mine && (mine.slotLabels || []).includes(slotLabel)) return { error: null, addedSlot: false }; // already signed up
      const capacity = event.slotCapacity || 3;
      const taken = points.filter(p => p.eventId === eventId && p.status !== 'denied' && (p.slotLabels || []).includes(slotLabel)).length;
      if (taken >= capacity) return fail('That slot is full.', 409);
      if (mine) {
        if (mine.status === 'approved') return fail('Your signup was already approved — ask the secretary to add more.', 409);
        mine.slotLabels = [...(mine.slotLabels || []), slotLabel];
      } else {
        mine = {
          id: randomUUID(), memberId: me.id, memberName: me.name, memberEmail: me.email,
          source: 'volunteer', eventId, eventTitle: event.title, slotLabels: [slotLabel], itemCount: 0, items: '',
          status: 'pending', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
        };
        points.push(mine);
      }
      addedSlot = true;
    } else {
      if (!mine || !(mine.slotLabels || []).includes(slotLabel)) return fail('You are not signed up for that slot.', 404);
      if (mine.status === 'approved') return fail('This was already approved — ask the secretary to remove it.', 409);
      mine.slotLabels = mine.slotLabels.filter(l => l !== slotLabel);
    }
  } else if (kind === 'items' || kind === 'unsign-items') {
    if (event.volunteerType !== 'bake_sale') return fail('This event does not take baked item signups.', 400);
    let mine = findMine();
    if (kind === 'items') {
      const count = Math.round(Number(itemCount));
      if (!count || count < 1 || count > MAX_BAKE_SALE_ITEMS) {
        return fail(`Enter between 1 and ${MAX_BAKE_SALE_ITEMS} items.`, 400);
      }
      const description = String(items || '').trim();
      if (!description) return fail('Say what you\'re bringing (e.g. "2 dozen cookies, 1 tray of brownies").', 400);
      if (mine) {
        if (mine.status === 'approved') return fail('Your item signup was already approved — ask the secretary to adjust it if it changed.', 409);
        mine.itemCount = count;
        mine.items = description;
      } else {
        mine = {
          id: randomUUID(), memberId: me.id, memberName: me.name, memberEmail: me.email,
          source: 'volunteer', eventId, eventTitle: event.title, slotLabels: [], itemCount: count, items: description,
          status: 'pending', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
        };
        points.push(mine);
      }
    } else {
      if (!mine || !mine.itemCount) return fail('You do not have an item signup for this event.', 404);
      if (mine.status === 'approved') return fail('This was already approved — ask the secretary to remove it.', 409);
      mine.itemCount = 0;
      mine.items = '';
    }
  } else if (kind === 'full') {
    if (event.volunteerType !== 'full_event') return fail('This event does not use full-day signup.', 400);
    if (points.some(p => p.eventId === eventId && p.memberId === me.id && p.source === 'volunteer-full' && p.status !== 'denied')) {
      return { error: null, addedSlot: false };
    }
    const activeCount = points.filter(p => p.eventId === eventId && p.source === 'volunteer-full' && p.status !== 'denied').length;
    if (event.fullDayCapacity && activeCount >= event.fullDayCapacity) {
      return fail('This event is already full.', 409);
    }
    points.push({
      id: randomUUID(), memberId: me.id, memberName: me.name, memberEmail: me.email,
      source: 'volunteer-full', eventId, eventTitle: event.title,
      amount: typeof event.points === 'number' ? event.points : 0, reason: 'Full-day volunteer signup',
      status: 'pending', requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null,
    });
    return { error: null, addedSlot: false };
  } else {
    return fail('Unknown kind.', 400);
  }

  // Slot/item ops share one consolidated entry — drop it if it ends up
  // empty (last slot and any items removed), otherwise recompute its
  // total amount and description.
  const mine = findMine();
  if (mine) {
    if (!(mine.slotLabels || []).length && !mine.itemCount) {
      points.splice(points.indexOf(mine), 1);
    } else {
      recomputeVolunteerEntry(mine, perSlot, perItem);
    }
  }
  return { error: null, addedSlot };
}

export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const eventId = url.searchParams.get('eventId');
    if (!eventId) return json({ ok: false, error: 'eventId is required.' }, 400);
    const events = await getCollection('events', []);
    const event = events.find(e => e.id === eventId);
    if (!event) return json({ ok: false, error: 'Event not found.' }, 404);

    let [points, members] = await Promise.all([getCollection('points', []), loadMembers()]);
    if (points.some(p => p.source === 'volunteer-slot' || p.source === 'volunteer-items')) {
      points = await updateCollection('points', [], async (stored) => { migrateOldVolunteerEntries(stored); return stored; });
    }
    const photoById = new Map(members.map(m => [m.id, m.photoUrl || null]));
    const activeForEvent = points.filter(p => p.eventId === eventId && p.status !== 'denied');
    const token = getSessionUser(req);

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

    const myEntry = activeForEvent.find(p => p.source === 'volunteer' && p.memberId === token?.id);
    const slots = generateSlots(event).map(s => {
      const occupantEntries = activeForEvent.filter(p => p.source === 'volunteer' && (p.slotLabels || []).includes(s.label));
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
      mySlotLabels: myEntry?.slotLabels || [],
    };

    if (event.volunteerType === 'bake_sale') {
      const itemEntries = activeForEvent.filter(p => p.source === 'volunteer' && p.itemCount > 0);
      result.pointsPerItem = await bakeSaleItemPointsDefault();
      result.maxItems = MAX_BAKE_SALE_ITEMS;
      result.itemSignups = itemEntries.map(p => ({ name: p.memberName, photoUrl: photoById.get(p.memberId) || null, itemCount: p.itemCount || 0, items: p.items || '', isMe: p.memberId === (token?.id) }));
      result.myItemCount = myEntry?.itemCount || 0;
      result.myItems = myEntry?.items || '';
    }

    return json(result);
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  const { user: me } = auth;

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { eventId, kind } = body;
  if (!eventId || !kind) return json({ ok: false, error: 'eventId and kind are required.' }, 400);

  const events = await getCollection('events', []);
  const event = events.find(e => e.id === eventId);
  if (!event || !(event.tags || []).includes('Volunteer')) return json({ ok: false, error: 'Not a volunteer event.' }, 400);
  const unsigning = kind === 'unsign-slot' || kind === 'unsign-items';
  if (!unsigning && new Date(event.end || event.start).getTime() + SIGNUP_GRACE_MS < Date.now()) {
    return json({ ok: false, error: 'Signups for this event have closed.' }, 403);
  }

  // Point-value defaults are read-only reference data, unrelated to the
  // points-collection race the retry loop below guards against — fetched
  // once up front rather than inside the (possibly re-run) mutation.
  const perSlot = event.volunteerType === 'bake_sale' ? await bakeSaleSlotPointsDefault() : await volunteerSlotPointsDefault();
  const perItem = await bakeSaleItemPointsDefault();

  let opResult = null;
  await updateCollection('points', [], async (stored) => {
    migrateOldVolunteerEntries(stored);
    opResult = applyVolunteerOp(stored, event, me, kind, body, perSlot, perItem);
    return stored;
  });

  if (opResult.error) return json({ ok: false, error: opResult.error.message }, opResult.error.status);

  // Immediate confirmation + "Add to Calendar" for a brand-new slot signup
  // only — not for a food/item-only signup, which has no specific time to
  // confirm. Best-effort: a failed send here shouldn't fail the signup
  // itself, since the slot is already saved.
  if (opResult.addedSlot) {
    try {
      const slotInfo = generateSlots(event).find(s => s.label === body.slotLabel);
      if (slotInfo) {
        const calendarUrl = gcalLink({
          title: `Volunteering: ${event.title}`,
          description: event.description || '',
          location: event.location || '',
          startISO: slotInfo.start,
          endISO: slotInfo.end,
        });
        const emails = memberEmails(me);
        if (emails.length) {
          await sendEmail({ to: emails, subject: `You're signed up: ${event.title}`, html: volunteerConfirmationEmailHtml(event, body.slotLabel, calendarUrl) });
        }
      }
    } catch {}
  }

  return json({ ok: true });
}
