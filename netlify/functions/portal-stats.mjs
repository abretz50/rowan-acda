import { getCollection } from './_lib/blobs.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

// Any signed-in E-Board/admin account can see these — they're aggregate
// club numbers (counts, totals, a name+total leaderboard), not raw member
// PII, so there's no need to gate this behind a specific tab permission the
// way the full members/points lists are.
export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;

  const [members, events, points] = await Promise.all([
    loadMembers(),
    getCollection('events', []),
    getCollection('points', []),
  ]);

  const now = new Date();
  const activeMembers = members.filter(m => m.active !== false);
  const upcomingEventCount = events.filter(e => new Date(e.end || e.start) >= now).length;
  const approved = points.filter(p => p.status === 'approved');

  const totalsByMember = new Map();
  for (const p of approved) {
    totalsByMember.set(p.memberId, (totalsByMember.get(p.memberId) || 0) + p.amount);
  }
  const nameById = new Map(members.map(m => [m.id, m.name]));
  const topEarners = [...totalsByMember.entries()]
    .map(([id, total]) => ({ name: nameById.get(id) || 'Unknown', total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Attendance = one distinct member per event with any non-denied points
  // entry tied to that event (a regular check-in, or any volunteer signup) —
  // pending counts as "attended, awaiting approval" so the numbers don't lag
  // behind reality while the secretary is still reviewing.
  const attendeesByEvent = new Map(); // eventId -> Set(memberId)
  for (const p of points) {
    if (p.status === 'denied' || !p.eventId) continue;
    if (!attendeesByEvent.has(p.eventId)) attendeesByEvent.set(p.eventId, new Set());
    attendeesByEvent.get(p.eventId).add(p.memberId);
  }

  let mostAttendedEvent = null;
  for (const [eventId, memberSet] of attendeesByEvent.entries()) {
    const ev = events.find(e => e.id === eventId);
    if (!ev) continue;
    if (!mostAttendedEvent || memberSet.size > mostAttendedEvent.count) {
      mostAttendedEvent = { title: ev.title, count: memberSet.size };
    }
  }

  const totalAttendanceRecords = [...attendeesByEvent.values()].reduce((s, set) => s + set.size, 0);
  const avgMemberAttendance = activeMembers.length ? totalAttendanceRecords / activeMembers.length : 0;

  // Chart data: total attendance per calendar month (not one bar per
  // event) — an actual trend over time rather than a long list of
  // individual meetings.
  const pastEvents = events.filter(e => new Date(e.end || e.start) <= now);
  const attendanceByMonth = new Map(); // "YYYY-MM" -> count
  for (const ev of pastEvents) {
    const count = (attendeesByEvent.get(ev.id) || new Set()).size;
    if (!count) continue;
    const d = new Date(ev.start);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    attendanceByMonth.set(key, (attendanceByMonth.get(key) || 0) + count);
  }
  const monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };
  const attendanceOverTime = [...attendanceByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ label: monthLabel(key), count }));

  return json({
    ok: true,
    stats: {
      memberCount: activeMembers.length,
      upcomingEventCount,
      totalApprovedPoints: approved.reduce((s, p) => s + p.amount, 0),
      pendingPointsCount: points.filter(p => p.status === 'pending').length,
      topEarners,
      mostAttendedEvent,
      avgMemberAttendance: Math.round(avgMemberAttendance * 10) / 10,
      attendanceOverTime,
    },
  });
}
