// Server-side equivalent of events.html's gcalLink() — used in emails,
// where the link has to be a plain URL baked into the HTML rather than
// computed client-side. Same UTC-getters-plus-Z approach: an absolute
// instant, correct regardless of the recipient's own timezone.
export function gcalLink({ title, description, location, startISO, endISO }) {
  const s = new Date(startISO);
  const e = new Date(endISO || startISO);
  const fmt = (d) => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + 'T' +
    String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + '00Z';
  const dates = `${fmt(s)}/${fmt(e)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Rowan ACDA',
    dates,
    details: description || '',
    location: location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
