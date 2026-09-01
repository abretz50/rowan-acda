import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, publicMember } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { getCollection } from './_lib/blobs.mjs';
import { isPermanentAdmin } from './_lib/permissions.mjs';
import { shortMonthYear, academicYearStart } from './_lib/dateFmt.mjs';

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

// "Meeting" attendance stats and a membership-growth chart, computed
// specifically for the Members tab — deliberately scoped to the 'Meeting'
// tag rather than every event type, since that's what "attendance" means
// for these particular numbers (recurring members, attendance %, etc).
async function computeMemberStats(members) {
  const now = new Date();
  const [events, allPoints] = await Promise.all([getCollection('events', []), getCollection('points', [])]);
  // Scoped to whoever the caller passed in (e.g. admin already excluded),
  // so a non-roster account's check-ins never skew these numbers.
  const memberIds = new Set(members.map(m => m.id));
  const points = allPoints.filter(p => memberIds.has(p.memberId));
  const activeMembers = members.filter(m => m.active !== false);

  const meetings = events.filter(e => (e.tags || []).includes('Meeting') && new Date(e.end || e.start) <= now);
  const meetingIds = new Set(meetings.map(e => e.id));
  const totalMeetings = meetings.length;

  const attendedByMember = new Map(); // memberId -> Set(eventId)
  const attendeesByMeeting = new Map(); // eventId -> Set(memberId)
  for (const p of points) {
    if (p.status === 'denied' || !meetingIds.has(p.eventId)) continue;
    if (!attendedByMember.has(p.memberId)) attendedByMember.set(p.memberId, new Set());
    attendedByMember.get(p.memberId).add(p.eventId);
    if (!attendeesByMeeting.has(p.eventId)) attendeesByMeeting.set(p.eventId, new Set());
    attendeesByMeeting.get(p.eventId).add(p.memberId);
  }

  const counts = activeMembers.map(m => (attendedByMember.get(m.id) || new Set()).size);
  const avgMeetingAttendance = activeMembers.length ? counts.reduce((a, b) => a + b, 0) / activeMembers.length : 0;

  // Highest/lowest attendance are per-MEETING (which meeting had the
  // biggest/smallest share of active members show up), not per-member.
  let highestAttendance = null, lowestAttendance = null;
  if (activeMembers.length > 0) {
    for (const meeting of meetings) {
      const pct = ((attendeesByMeeting.get(meeting.id) || new Set()).size / activeMembers.length) * 100;
      if (!highestAttendance || pct > highestAttendance.pct) highestAttendance = { name: meeting.title, pct };
      if (!lowestAttendance || pct < lowestAttendance.pct) lowestAttendance = { name: meeting.title, pct };
    }
  }

  const ayStart = academicYearStart();
  const meetingsThisYear = new Set(meetings.filter(e => new Date(e.start) >= ayStart).map(e => e.id));
  const recurringMemberCount = activeMembers.filter(m => {
    const attended = attendedByMember.get(m.id) || new Set();
    let c = 0;
    for (const id of attended) if (meetingsThisYear.has(id)) c++;
    return c > 3;
  }).length;

  // Membership growth: cumulative active-member count for each month of the
  // current academic year so far (Aug through the current month) — no
  // projecting into months that haven't happened yet.
  const monthsSoFar = (now.getFullYear() - ayStart.getFullYear()) * 12 + (now.getMonth() - ayStart.getMonth()) + 1;
  const membershipOverTime = Array.from({ length: Math.min(12, Math.max(1, monthsSoFar)) }, (_, i) => {
    const monthStart = new Date(ayStart.getFullYear(), ayStart.getMonth() + i, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const count = activeMembers.filter(m => new Date(m.joinedAt) <= monthEnd).length;
    const label = shortMonthYear(monthStart);
    return { label, count };
  });

  return {
    totalMeetings,
    avgMeetingAttendance: Math.round(avgMeetingAttendance * 10) / 10,
    highestAttendance: highestAttendance ? { name: highestAttendance.name, pct: Math.round(highestAttendance.pct) } : null,
    lowestAttendance: lowestAttendance ? { name: lowestAttendance.name, pct: Math.round(lowestAttendance.pct) } : null,
    recurringMemberCount,
    membershipOverTime,
  };
}

export default async function handler(req) {
  const auth = await requireAuth(req, { perm: 'members' });
  if (auth.deny) return auth.deny;
  const { members } = auth;

  if (req.method === 'GET') {
    // Admin is a technical/site-owner account, not a club member — kept out
    // of the roster and its stats (it still functions fully for tasks).
    const rosterMembers = members.filter(m => m.role !== 'admin');
    const stats = await computeMemberStats(rosterMembers);
    // ProfLink verification isn't its own field — it's just whether a member
    // has an approved "ProfLink verified" manual award — so the roster can
    // show Verify vs. Unverify without a separate flag to keep in sync.
    const points = await getCollection('points', []);
    const proflinkPointsIdByMember = new Map();
    for (const p of points) {
      if (p.status === 'approved' && p.reason === 'ProfLink verified') proflinkPointsIdByMember.set(p.memberId, p.id);
    }
    const membersOut = rosterMembers.map(m => ({ ...publicMember(m), proflinkPointsId: proflinkPointsIdByMember.get(m.id) || null }));
    return json({ ok: true, members: membersOut, stats });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    const { name, email } = body;
    if (!name || !email) return json({ ok: false, error: 'Name and email are required.' }, 400);
    if (members.some(m => normEmail(m.email) === normEmail(email))) {
      return json({ ok: false, error: 'A member with that email already exists.' }, 409);
    }
    const member = {
      id: randomUUID(), name, email,
      role: 'member', hasAccount: false, active: true, joinedAt: new Date().toISOString(),
    };
    members.push(member);
    await saveMembers(members);
    return json({ ok: true, member: publicMember(member) });
  }

  if (req.method === 'PATCH') {
    const target = members.find(m => m.id === body.id);
    if (!target) return json({ ok: false, error: 'Member not found.' }, 404);
    if (body.name) target.name = body.name;
    if (body.email) target.email = body.email;
    if ('active' in body) {
      if (body.active === false && isPermanentAdmin(target)) {
        return json({ ok: false, error: 'The permanent admin account cannot be deactivated.' }, 400);
      }
      target.active = !!body.active;
    }
    await saveMembers(members);
    return json({ ok: true, member: publicMember(target) });
  }

  if (req.method === 'DELETE') {
    const target = members.find(m => m.id === body.id);
    if (!target) return json({ ok: false, error: 'Member not found.' }, 404);
    if (isPermanentAdmin(target)) {
      return json({ ok: false, error: 'The permanent admin account cannot be removed.' }, 400);
    }
    await saveMembers(members.filter(m => m.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
