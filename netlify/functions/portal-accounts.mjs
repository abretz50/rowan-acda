import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import { hashPassword, requireAuth, json } from './_lib/auth.mjs';
import { isValidRole, FULL_ACCESS_ROLES, isPermanentAdmin } from './_lib/permissions.mjs';

function activeFullAccess(members) {
  return members.filter(m => FULL_ACCESS_ROLES.includes(m.role) && m.hasAccount && m.active !== false);
}
function normEmail(e) { return String(e || '').trim().toLowerCase(); }

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
    const { name, email, password, role } = body;
    if (!name || !email || !password) return json({ ok: false, error: 'Name, email, and password are required.' }, 400);
    if (role && !isValidRole(role)) return json({ ok: false, error: 'Invalid role.' }, 400);
    if (members.some(m => m.hasAccount && normEmail(m.email) === normEmail(email))) {
      return json({ ok: false, error: 'An account with that email already exists.' }, 409);
    }
    const { salt, hash } = hashPassword(password);
    const member = {
      id: randomUUID(), name, email,
      role: role || 'member', hasAccount: true, salt, hash,
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
      if (isPermanentAdmin(target) && body.role !== 'admin') {
        return json({ ok: false, error: 'This is the permanent admin account — its role cannot be changed.' }, 400);
      }
      if (FULL_ACCESS_ROLES.includes(target.role) && !FULL_ACCESS_ROLES.includes(body.role) && activeFullAccess(members).length <= 1) {
        return json({ ok: false, error: 'Cannot remove the last full-access (president/admin) account.' }, 400);
      }
      target.role = body.role;
    }

    if (body.newPassword) {
      // Granting account access to a roster-only member, or resetting credentials.
      // The identifier is always the member's email, so it must already be on file.
      if (!target.hasAccount) {
        if (!target.email) {
          return json({ ok: false, error: 'This member needs an email on file before granting account access.' }, 400);
        }
        target.hasAccount = true;
      }
      const { salt, hash } = hashPassword(body.newPassword);
      target.salt = salt; target.hash = hash;
    }

    if ('active' in body) {
      if (body.active === false && isPermanentAdmin(target)) {
        return json({ ok: false, error: 'The permanent admin account cannot be deactivated.' }, 400);
      }
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
    if (isPermanentAdmin(target)) {
      return json({ ok: false, error: 'The permanent admin account cannot have its access revoked.' }, 400);
    }
    if (FULL_ACCESS_ROLES.includes(target.role) && activeFullAccess(members).length <= 1) {
      return json({ ok: false, error: 'Cannot remove the last full-access (president/admin) account.' }, 400);
    }
    target.hasAccount = false;
    delete target.username; delete target.salt; delete target.hash; // username: cleanup for any legacy accounts that still had one
    await saveMembers(members);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
