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

  return json({
    ok: true,
    stats: {
      memberCount: activeMembers.length,
      accountCount: activeMembers.filter(m => m.hasAccount).length,
      upcomingEventCount,
      totalApprovedPoints: approved.reduce((s, p) => s + p.amount, 0),
      pendingPointsCount: points.filter(p => p.status === 'pending').length,
      topEarners,
    },
  });
}
