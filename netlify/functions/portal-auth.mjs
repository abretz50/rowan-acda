import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import {
  hashPassword, verifyPassword, signSession,
  setSessionCookieHeader, clearSessionCookieHeader, getSessionUser, json,
} from './_lib/auth.mjs';

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const users = await getCollection('users', []);
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return json({ ok: false, needsBootstrap: users.length === 0 });
    const u = users.find(x => x.id === sessionUser.userId && x.active !== false);
    if (!u) return json({ ok: false, needsBootstrap: users.length === 0 });
    return json({ ok: true, user: publicUser(u) });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const action = body?.action;

  if (action === 'login') {
    const { username, password } = body;
    if (!username || !password) return json({ ok: false, error: 'Username and password required.' }, 400);
    const users = await getCollection('users', []);
    const u = users.find(x => x.username.toLowerCase() === String(username).toLowerCase());
    if (!u || u.active === false || !verifyPassword(password, u.salt, u.hash)) {
      return json({ ok: false, error: 'Incorrect username or password.' }, 401);
    }
    const token = signSession({ userId: u.id, role: u.role });
    return json({ ok: true, user: publicUser(u) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  if (action === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
  }

  if (action === 'bootstrap') {
    const { secret, username, password, name } = body;
    if (!process.env.BOOTSTRAP_SECRET || secret !== process.env.BOOTSTRAP_SECRET) {
      return json({ ok: false, error: 'Invalid setup secret.' }, 403);
    }
    const users = await getCollection('users', []);
    if (users.length > 0) {
      return json({ ok: false, error: 'Setup already completed — an account already exists.' }, 409);
    }
    if (!username || !password || !name) {
      return json({ ok: false, error: 'Name, username, and password are required.' }, 400);
    }
    const { salt, hash } = hashPassword(password);
    const admin = { id: randomUUID(), username, name, salt, hash, role: 'admin', active: true };
    await setCollection('users', [admin]);
    const token = signSession({ userId: admin.id, role: admin.role });
    return json({ ok: true, user: publicUser(admin) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
}
