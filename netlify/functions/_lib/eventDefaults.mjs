import { getCollection, setCollection } from './blobs.mjs';

// Default attendance points by event tag, applied when an event is created
// without an explicit points value. "Volunteer" is deliberately excluded —
// those events are point-valued per signup (slot/food/manual), not a flat
// per-event default.
export const DEFAULT_EVENT_POINTS = {
  Event: 100,
  Meeting: 200,
  'Professional Development': 400,
  Workshop: 300,
  Performance: 50,
};

export async function loadEventDefaults() {
  const existing = await getCollection('eventPointDefaults', null);
  if (existing) return existing;
  await setCollection('eventPointDefaults', DEFAULT_EVENT_POINTS);
  return DEFAULT_EVENT_POINTS;
}

export async function saveEventDefaults(defaults) {
  await setCollection('eventPointDefaults', defaults);
}

export async function defaultPointsForTags(tags) {
  const defaults = await loadEventDefaults();
  const tag = (tags || [])[0];
  return typeof defaults[tag] === 'number' ? defaults[tag] : 1;
}
