const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Aug 26" — used on chart x-axes (Attendance/Membership Over Time) where a
// full "August 28, 2026" label overlaps once there are more than a few
// points on the chart.
export function shortMonthYear(d) {
  return `${MONTH_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}
