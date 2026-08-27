import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, publicMember } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

export default async function handler(req) {
  const auth = await requireAuth(req, { perm: 'members' });
  if (auth.deny) return auth.deny;
  const { members } = auth;

  if (req.method === 'GET') {
    return json({ ok: true, members: members.map(publicMember) });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    const { name, email, year, mailingAddress } = body;
    if (!name || !email) return json({ ok: false, error: 'Name and email are required.' }, 400);
    if (members.some(m => normEmail(m.email) === normEmail(email))) {
      return json({ ok: false, error: 'A member with that email already exists.' }, 409);
    }
    const member = {
      id: randomUUID(), name, email, year: year || '', mailingAddress: mailingAddress || '',
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
    if ('year' in body) target.year = body.year;
    if ('mailingAddress' in body) target.mailingAddress = body.mailingAddress;
    if ('active' in body) target.active = !!body.active;
    await saveMembers(members);
    return json({ ok: true, member: publicMember(target) });
  }

  if (req.method === 'DELETE') {
    if (!members.some(m => m.id === body.id)) return json({ ok: false, error: 'Member not found.' }, 404);
    await saveMembers(members.filter(m => m.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
