// Half-hour signup slots for a "bake sale" / "time slot" volunteer event,
// generated from the event's own start/end window rather than entered by
// hand — an event that runs 9am-11am automatically gets four slots.
const SLOT_MS = 30 * 60 * 1000;
export const POINTS_PER_SLOT = 25;

function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

export function generateSlots(event) {
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : start;
  if (!start || !end || end <= start) return [];
  const slots = [];
  for (let cur = new Date(start); cur < end; cur = new Date(cur.getTime() + SLOT_MS)) {
    const slotEnd = new Date(Math.min(cur.getTime() + SLOT_MS, end.getTime()));
    slots.push({
      label: `${fmtTime(cur)}–${fmtTime(slotEnd)}`,
      start: cur.toISOString(),
      end: slotEnd.toISOString(),
    });
  }
  return slots;
}
