const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Aug 26" — used on chart x-axes (Attendance/Membership Over Time) where a
// full "August 28, 2026" label overlaps once there are more than a few
// points on the chart.
export function shortMonthYear(d) {
  return `${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

// School-year boundary (Aug 1) — shared by every chart/stat scoped to "this
// academic year" (Membership Over Time, Attendance Over Time, recurring
// members) so they all agree on which year they're showing.
export function academicYearStart(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? new Date(y, 7, 1) : new Date(y - 1, 7, 1);
}

// The chapter's calendar date in Eastern time — not the server's raw UTC
// date, which rolls over up to 5 hours before Eastern midnight and would
// misclassify a late-evening Eastern event as happening "tomorrow" instead
// of "today" (or vice versa) in any UTC-vs-Eastern date comparison.
export function easternDateOnly(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// "2026-09-19" -> "09/19/2026" — email content reads MM/DD/YYYY per
// explicit request (the rest of the site uses fmtDashDate's non-padded
// M-D-YYYY, but that convention wasn't meant to extend to emails).
export function mdySlash(isoDateOnly) {
  const [y, m, d] = String(isoDateOnly).split('-');
  return `${m}/${d}/${y}`;
}
