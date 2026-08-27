import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import { requireAuth, hashPassword, verifyPassword, json } from './_lib/auth.mjs';

export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  const { user: me, members } = auth;

  if (req.method === 'GET') {
    return json({ ok: true, user: me });
  }

  if (req.method !== 'PATCH') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  const target = members.find(m => m.id === me.id);
  if (body.name) target.name = body.name;
  if (body.email) target.email = body.email;
  if ('mailingAddress' in body) target.mailingAddress = body.mailingAddress;
  if ('year' in body) target.year = body.year;

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
