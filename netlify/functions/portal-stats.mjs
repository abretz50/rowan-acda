import { getCollection } from './_lib/blobs.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { shortMonthYear, academicYearStart } from './_lib/dateFmt.mjs';

// Any signed-in E-Board/admin account can see these — they're aggregate
// club numbers (counts, totals, a name+total leaderboard), not raw member
// PII, so there's no need to gate this behind a specific tab permission the
// way the full members/points lists are.
export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;

  const [members, events, points, tasks] = await Promise.all([
    loadMembers(),
    getCollection('events', []),
    getCollection('points', []),
    getCollection('tasks', []),
  ]);

  const now = new Date();
  const activeMembers = members.filter(m => m.active !== false);
  const upcomingEventCount = events.filter(e => new Date(e.end || e.start) >= now).length;
  const approved = points.filter(p => p.status === 'approved');

  // Current week = the previous Sunday through the following Saturday.
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const eventsThisWeekCount = events.filter(e => {
    const s = new Date(e.start);
    return s >= weekStart && s < weekEnd;
  }).length;

  const openTasksCount = tasks.filter(t => t.status === 'open').length;

  const totalsByMember = new Map();
  for (const p of approved) {
    totalsByMember.set(p.memberId, (totalsByMember.get(p.memberId) || 0) + p.amount);
  }
  const nameById = new Map(members.map(m => [m.id, m.name]));
  const photoById = new Map(members.map(m => [m.id, m.photoUrl || null]));
  const topEarners = [...totalsByMember.entries()]
    .map(([id, total]) => ({ name: nameById.get(id) || 'Unknown', photoUrl: photoById.get(id) || null, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

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
    if (!ev || !memberSet.size) continue;
    if (!mostAttendedEvent || memberSet.size > mostAttendedEvent.count) {
      mostAttendedEvent = { title: ev.title, count: memberSet.size };
    }
  }
  // No attendance data yet — show something rather than nothing, per
  // feedback (this'll naturally get replaced once real check-ins exist).
  if (!mostAttendedEvent && events.length) {
    mostAttendedEvent = { title: events[0].title, count: 0 };
  }

  // Chart data: one bar per past Meeting this academic year, in date order —
  // an actual attendance trend over the current year, not all-time history.
  const ayStart = academicYearStart(now);
  const pastMeetings = events
    .filter(e => Array.isArray(e.tags) && e.tags.includes('Meeting') && new Date(e.start) >= ayStart && new Date(e.end || e.start) <= now)
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const attendanceOverTime = pastMeetings.map(ev => ({
    label: shortMonthYear(new Date(ev.start)),
    count: (attendeesByEvent.get(ev.id) || new Set()).size,
  }));

  return json({
    ok: true,
    stats: {
      memberCount: activeMembers.length,
      upcomingEventCount,
      eventsThisWeekCount,
      totalApprovedPoints: approved.reduce((s, p) => s + p.amount, 0),
      pendingPointsCount: points.filter(p => p.status === 'pending').length,
      openTasksCount,
      topEarners,
      mostAttendedEvent,
      attendanceOverTime,
    },
  });
}
