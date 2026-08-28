import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import {
  hashPassword, verifyPassword, signSession,
  setSessionCookieHeader, clearSessionCookieHeader, getSessionUser, json,
} from './_lib/auth.mjs';
import { FULL_ACCESS_ROLES } from './_lib/permissions.mjs';

function hasFullAccessAccount(members) {
  return members.some(m => FULL_ACCESS_ROLES.includes(m.role) && m.hasAccount && m.active !== false);
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const members = await loadMembers();
    const sessionToken = getSessionUser(req);
    const needsBootstrap = !hasFullAccessAccount(members);
    if (!sessionToken) return json({ ok: false, needsBootstrap });
    const m = members.find(x => x.id === sessionToken.id && x.hasAccount && x.active !== false);
    if (!m) return json({ ok: false, needsBootstrap });
    return json({ ok: true, user: accountMember(m) });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const action = body?.action;
  const members = await loadMembers();

  // Accounts are identified by email, not a separate username — except
  // legacy accounts created before this change, which may only have a
  // `username` on file (and possibly no email at all), so login still
  // falls back to matching that for backward compatibility.
  function findByIdentifier(identifier) {
    const norm = String(identifier || '').trim().toLowerCase();
    return members.find(x => x.hasAccount && (
      (x.email && x.email.trim().toLowerCase() === norm) ||
      (x.username && x.username.toLowerCase() === norm)
    ));
  }

  if (action === 'login') {
    const { email, password } = body;
    if (!email || !password) return json({ ok: false, error: 'Email and password required.' }, 400);
    const m = findByIdentifier(email);
    if (!m || m.active === false || !verifyPassword(password, m.salt, m.hash)) {
      return json({ ok: false, error: 'Incorrect email or password.' }, 401);
    }
    const token = signSession({ id: m.id });
    return json({ ok: true, user: accountMember(m) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  if (action === 'register') {
    const { name, email, password } = body;
    if (!name || !email || !password) {
      return json({ ok: false, error: 'Name, email, and password are required.' }, 400);
    }
    if (findByIdentifier(email)) {
      return json({ ok: false, error: 'An account with that email already exists.' }, 409);
    }
    const { salt, hash } = hashPassword(password);
    const member = {
      id: randomUUID(), name, email,
      role: 'member', hasAccount: true, salt, hash,
      active: true, joinedAt: new Date().toISOString(),
    };
    members.push(member);
    await saveMembers(members);
    const token = signSession({ id: member.id });
    return json({ ok: true, user: accountMember(member) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  if (action === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
  }

  if (action === 'bootstrap') {
    const { secret, email, password, name } = body;
    if (!process.env.BOOTSTRAP_SECRET || secret !== process.env.BOOTSTRAP_SECRET) {
      return json({ ok: false, error: 'Invalid setup secret.' }, 403);
    }
    if (hasFullAccessAccount(members)) {
      return json({ ok: false, error: 'Setup already completed — a full-access account already exists.' }, 409);
    }
    if (!email || !password || !name) {
      return json({ ok: false, error: 'Name, email, and password are required.' }, 400);
    }
    const { salt, hash } = hashPassword(password);
    const admin = {
      id: randomUUID(), name, email,
      role: 'president', hasAccount: true, salt, hash,
      active: true, joinedAt: new Date().toISOString(),
    };
    members.push(admin);
    await saveMembers(members);
    const token = signSession({ id: admin.id });
    return json({ ok: true, user: accountMember(admin) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
}
