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
    if (!ev) continue;
    if (!mostAttendedEvent || memberSet.size > mostAttendedEvent.count) {
      mostAttendedEvent = { title: ev.title, count: memberSet.size };
    }
  }

  const totalAttendanceRecords = [...attendeesByEvent.values()].reduce((s, set) => s + set.size, 0);
  const avgMemberAttendance = activeMembers.length ? totalAttendanceRecords / activeMembers.length : 0;

  // Chart data: past events only (nothing to show for events that haven't
  // happened yet), oldest to newest, capped to the most recent 20 so the
  // chart stays readable.
  const pastEvents = events
    .filter(e => new Date(e.end || e.start) <= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const attendanceByEvent = pastEvents.slice(-20).map(e => ({
    title: e.title,
    date: e.start,
    count: (attendeesByEvent.get(e.id) || new Set()).size,
  }));

  return json({
    ok: true,
    stats: {
      memberCount: activeMembers.length,
      accountCount: activeMembers.filter(m => m.hasAccount).length,
      upcomingEventCount,
      totalApprovedPoints: approved.reduce((s, p) => s + p.amount, 0),
      pendingPointsCount: points.filter(p => p.status === 'pending').length,
      topEarners,
      mostAttendedEvent,
      avgMemberAttendance: Math.round(avgMemberAttendance * 10) / 10,
      attendanceByEvent,
    },
  });
}
