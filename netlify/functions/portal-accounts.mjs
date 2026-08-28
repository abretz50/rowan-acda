import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import { hashPassword, requireAuth, json } from './_lib/auth.mjs';
import { isValidRole, FULL_ACCESS_ROLES } from './_lib/permissions.mjs';

function activeFullAccess(members) {
  return members.filter(m => FULL_ACCESS_ROLES.includes(m.role) && m.hasAccount && m.active !== false);
}

export default async function handler(req) {
  const auth = await requireAuth(req, { perm: 'accounts' });
  if (auth.deny) return auth.deny;
  const { members } = auth;

  if (req.method === 'GET') {
    return json({ ok: true, accounts: members.filter(m => m.hasAccount).map(accountMember) });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  // Create a brand-new person + account in one step.
  if (req.method === 'POST') {
    const { name, email, username, password, role } = body;
    if (!name || !username || !password) return json({ ok: false, error: 'Name, username, and password are required.' }, 400);
    if (role && !isValidRole(role)) return json({ ok: false, error: 'Invalid role.' }, 400);
    if (members.some(m => m.hasAccount && m.username?.toLowerCase() === String(username).toLowerCase())) {
      return json({ ok: false, error: 'That username is already taken.' }, 409);
    }
    const { salt, hash } = hashPassword(password);
    const member = {
      id: randomUUID(), name, email: email || '', year: '', mailingAddress: '',
      role: role || 'member', hasAccount: true, username, salt, hash,
      active: true, joinedAt: new Date().toISOString(),
    };
    members.push(member);
    await saveMembers(members);
    return json({ ok: true, account: accountMember(member) });
  }

  // Grant/change access on an existing roster member, change role, reset
  // password, or activate/deactivate.
  if (req.method === 'PATCH') {
    const target = members.find(m => m.id === body.id);
    if (!target) return json({ ok: false, error: 'Member not found.' }, 404);

    if ('role' in body) {
      if (!isValidRole(body.role)) return json({ ok: false, error: 'Invalid role.' }, 400);
      if (FULL_ACCESS_ROLES.includes(target.role) && !FULL_ACCESS_ROLES.includes(body.role) && activeFullAccess(members).length <= 1) {
        return json({ ok: false, error: 'Cannot remove the last full-access (president/admin) account.' }, 400);
      }
      target.role = body.role;
    }

    if (body.username || body.newPassword) {
      // Granting account access to a roster-only member, or resetting credentials.
      if (!target.hasAccount) {
        if (!body.username || !body.newPassword) {
          return json({ ok: false, error: 'A username and password are required to grant account access.' }, 400);
        }
        if (members.some(m => m.hasAccount && m.id !== target.id && m.username?.toLowerCase() === String(body.username).toLowerCase())) {
          return json({ ok: false, error: 'That username is already taken.' }, 409);
        }
        target.username = body.username;
        target.hasAccount = true;
      } else if (body.username) {
        target.username = body.username;
      }
      if (body.newPassword) {
        const { salt, hash } = hashPassword(body.newPassword);
        target.salt = salt; target.hash = hash;
      }
    }

    if ('active' in body) {
      if (FULL_ACCESS_ROLES.includes(target.role) && body.active === false && activeFullAccess(members).length <= 1) {
        return json({ ok: false, error: 'Cannot deactivate the last full-access (president/admin) account.' }, 400);
      }
      target.active = !!body.active;
    }

    await saveMembers(members);
    return json({ ok: true, account: accountMember(target) });
  }

  // Revoke login access (keeps the roster entry — name/email/year stay).
  if (req.method === 'DELETE') {
    const target = members.find(m => m.id === body.id);
    if (!target) return json({ ok: false, error: 'Member not found.' }, 404);
    if (FULL_ACCESS_ROLES.includes(target.role) && activeFullAccess(members).length <= 1) {
      return json({ ok: false, error: 'Cannot remove the last full-access (president/admin) account.' }, 400);
    }
    target.hasAccount = false;
    delete target.username; delete target.salt; delete target.hash;
    await saveMembers(members);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
