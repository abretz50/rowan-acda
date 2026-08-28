import { getCollection, setCollection } from './blobs.mjs';

// Default attendance points by event tag, applied when an event is created
// without an explicit points value. "Volunteer" itself is deliberately
// excluded here — those events are point-valued per signup, not a flat
// per-event amount, so their defaults (below) work differently.
export const DEFAULT_EVENT_POINTS = {
  Event: 100,
  Meeting: 200,
  'Professional Development': 400,
  Workshop: 300,
  Performance: 50,
};

// Per-signup defaults for volunteer events — not tied to an event tag, so
// they're kept in the same store under their own keys instead of being
// looked up by defaultPointsForTags. Editable from the same "Edit Event
// Defaults" UI so the event coordinator never has to think about points
// when creating a volunteer event.
export const VOLUNTEER_SLOT_KEY = 'VolunteerSlot';
export const VOLUNTEER_FULL_DAY_KEY = 'VolunteerFullDay';
const DEFAULT_VOLUNTEER_POINTS = {
  [VOLUNTEER_SLOT_KEY]: 25,
  [VOLUNTEER_FULL_DAY_KEY]: 100,
};

const ALL_DEFAULTS = { ...DEFAULT_EVENT_POINTS, ...DEFAULT_VOLUNTEER_POINTS };

export async function loadEventDefaults() {
  const existing = await getCollection('eventPointDefaults', null);
  if (!existing) {
    await setCollection('eventPointDefaults', ALL_DEFAULTS);
    return ALL_DEFAULTS;
  }
  // Backfill any default key added after this store was first seeded (e.g.
  // the volunteer keys), so existing deployments pick them up automatically.
  let changed = false;
  for (const [key, value] of Object.entries(ALL_DEFAULTS)) {
    if (typeof existing[key] !== 'number') { existing[key] = value; changed = true; }
  }
  if (changed) await setCollection('eventPointDefaults', existing);
  return existing;
}

export async function saveEventDefaults(defaults) {
  await setCollection('eventPointDefaults', defaults);
}

export async function defaultPointsForTags(tags) {
  const defaults = await loadEventDefaults();
  const tag = (tags || [])[0];
  return typeof defaults[tag] === 'number' ? defaults[tag] : 1;
}

export async function volunteerSlotPointsDefault() {
  const defaults = await loadEventDefaults();
  return defaults[VOLUNTEER_SLOT_KEY];
}

export async function volunteerFullDayPointsDefault() {
  const defaults = await loadEventDefaults();
  return defaults[VOLUNTEER_FULL_DAY_KEY];
}
