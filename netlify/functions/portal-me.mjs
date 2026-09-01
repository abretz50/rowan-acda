import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import { getCollection } from './_lib/blobs.mjs';
import { requireAuth, hashPassword, verifyPassword, json } from './_lib/auth.mjs';

// Ranks every active member by total approved points. Used for the "My
// Account" leaderboard, which only ever shows rank + name/photo — never the
// point totals themselves — so ties are just broken alphabetically rather
// than needing a tiebreaker anyone could reverse-engineer a score from.
function computeLeaderboard(members, points, myId) {
  const totalByMember = new Map();
  for (const p of points) {
    if (p.status !== 'approved') continue;
    totalByMember.set(p.memberId, (totalByMember.get(p.memberId) || 0) + p.amount);
  }
  const ranked = members.filter(m => m.active !== false && m.role !== 'admin')
    .map(m => ({ id: m.id, name: m.name, photoUrl: m.photoUrl || null, total: totalByMember.get(m.id) || 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const myIndex = ranked.findIndex(r => r.id === myId);
  if (myIndex === -1) return { myRank: null, totalMembers: ranked.length, entries: [] };
  const start = Math.max(0, myIndex - 2);
  const end = Math.min(ranked.length, myIndex + 3);
  const entries = ranked.slice(start, end).map((r, i) => ({
    rank: start + i + 1, id: r.id, name: r.name, photoUrl: r.photoUrl, isMe: r.id === myId,
  }));
  return { myRank: myIndex + 1, totalMembers: ranked.length, entries };
}

export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  const { user: me, members } = auth;

  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.get('leaderboard')) {
      const points = await getCollection('points', []);
      return json({ ok: true, ...computeLeaderboard(members, points, me.id) });
    }
    return json({ ok: true, user: me });
  }

  if (req.method !== 'PATCH') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  const target = members.find(m => m.id === me.id);
  if (body.name) target.name = body.name;
  if (body.email) target.email = body.email;
  if ('photoUrl' in body) target.photoUrl = body.photoUrl;

  if (body.password) {
    if (!body.currentPassword || !verifyPassword(body.currentPassword, target.salt, target.hash)) {
      return json({ ok: false, error: 'Current password is incorrect.' }, 401);
    }
    const { salt, hash } = hashPassword(body.password);
    target.salt = salt; target.hash = hash;
  }

  await saveMembers(members);
  return json({ ok: true, user: accountMember(target) });
}
