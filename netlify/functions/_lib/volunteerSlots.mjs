// Signup slots for a volunteer event's time-slot view.
//
// - "bake_sale" always uses fixed 30-minute slots (per the E-Board's own
//   point schedule: a half-hour slot is worth a flat amount either way).
// - "time_slot" (the full-day, organizer-defined kind) lets the event
//   coordinator choose between two ways of laying out the day:
//     - equal-length slots of their own chosen duration, auto-generated
//       across the event's start/end window (the historical behavior here,
//       just with a configurable length instead of a hardcoded 30 minutes)
//     - a hand-typed list of named slots with their own start/end times,
//       for a day that isn't evenly divisible ("9-10", "10-2", "2-4")
function fmtTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

function equalLengthSlots(start, end, minutes) {
  const ms = Math.max(5, Number(minutes) || 30) * 60 * 1000;
  const slots = [];
  for (let cur = new Date(start); cur < end; cur = new Date(cur.getTime() + ms)) {
    const slotEnd = new Date(Math.min(cur.getTime() + ms, end.getTime()));
    slots.push({ label: `${fmtTime(cur)}–${fmtTime(slotEnd)}`, start: cur.toISOString(), end: slotEnd.toISOString() });
  }
  return slots;
}

export function generateSlots(event) {
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : start;
  if (!start || !end || end <= start) return [];

  if (event.volunteerType === 'time_slot' && event.slotMode === 'custom') {
    return (Array.isArray(event.customSlots) ? event.customSlots : [])
      .filter(s => s && s.label && s.start && s.end)
      .map(s => ({ label: s.label, start: s.start, end: s.end }));
  }

  const minutes = event.volunteerType === 'time_slot' ? (event.slotDurationMinutes || 30) : 30;
  return equalLengthSlots(start, end, minutes);
}
