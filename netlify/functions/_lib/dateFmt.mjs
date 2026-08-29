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
