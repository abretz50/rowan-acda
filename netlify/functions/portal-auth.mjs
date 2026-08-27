import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import {
  hashPassword, verifyPassword, signSession,
  setSessionCookieHeader, clearSessionCookieHeader, getSessionUser, json,
} from './_lib/auth.mjs';

export default async function handler(req) {
  if (req.method === 'GET') {
    const members = await loadMembers();
    const sessionToken = getSessionUser(req);
    const hasPresident = members.some(m => m.role === 'president' && m.hasAccount && m.active !== false);
    if (!sessionToken) return json({ ok: false, needsBootstrap: !hasPresident });
    const m = members.find(x => x.id === sessionToken.id && x.hasAccount && x.active !== false);
    if (!m) return json({ ok: false, needsBootstrap: !hasPresident });
    return json({ ok: true, user: accountMember(m) });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const action = body?.action;
  const members = await loadMembers();

  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password) return json({ ok: false, error: 'Username and password required.' }, 400);
    const m = members.find(x => x.hasAccount && x.username?.toLowerCase() === String(username).toLowerCase());
    if (!m || m.active === false || !verifyPassword(password, m.salt, m.hash)) {
      return json({ ok: false, error: 'Incorrect username or password.' }, 401);
    }
    const token = signSession({ id: m.id });
    return json({ ok: true, user: accountMember(m) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  if (action === 'register') {
    const { name, email, username, password } = body;
    if (!name || !email || !username || !password) {
      return json({ ok: false, error: 'Name, email, username, and password are required.' }, 400);
    }
    if (members.some(x => x.hasAccount && x.username?.toLowerCase() === String(username).toLowerCase())) {
      return json({ ok: false, error: 'That username is already taken.' }, 409);
    }
    const { salt, hash } = hashPassword(password);
    const member = {
      id: randomUUID(), name, email, year: '', mailingAddress: '',
      role: 'member', hasAccount: true, username, salt, hash,
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
    const { secret, username, password, name } = body;
    if (!process.env.BOOTSTRAP_SECRET || secret !== process.env.BOOTSTRAP_SECRET) {
      return json({ ok: false, error: 'Invalid setup secret.' }, 403);
    }
    const hasPresident = members.some(m => m.role === 'president' && m.hasAccount && m.active !== false);
    if (hasPresident) {
      return json({ ok: false, error: 'Setup already completed — a president account already exists.' }, 409);
    }
    if (!username || !password || !name) {
      return json({ ok: false, error: 'Name, username, and password are required.' }, 400);
    }
    const { salt, hash } = hashPassword(password);
    const admin = {
      id: randomUUID(), name, email: '', year: '', mailingAddress: '',
      role: 'president', hasAccount: true, username, salt, hash,
      active: true, joinedAt: new Date().toISOString(),
    };
    members.push(admin);
    await saveMembers(members);
    const token = signSession({ id: admin.id });
    return json({ ok: true, user: accountMember(admin) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
}
