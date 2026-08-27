import { randomUUID } from 'node:crypto';
import { setCollection } from './_lib/blobs.mjs';
import { hashPassword, verifyPassword, requireAuth, json } from './_lib/auth.mjs';

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active !== false };
}

export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  const { user: me, users } = auth;

  if (req.method === 'GET') {
    if (me.role !== 'admin') return json({ ok: false, error: 'Admins only.' }, 403);
    return json({ ok: true, users: users.map(publicUser) });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    if (me.role !== 'admin') return json({ ok: false, error: 'Admins only.' }, 403);
    const { name, username, password, role } = body;
    if (!name || !username || !password) return json({ ok: false, error: 'Name, username, and password are required.' }, 400);
    if (users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
      return json({ ok: false, error: 'That username is already taken.' }, 409);
    }
    const { salt, hash } = hashPassword(password);
    const newUser = { id: randomUUID(), name, username, salt, hash, role: role === 'admin' ? 'admin' : 'eboard', active: true };
    users.push(newUser);
    await setCollection('users', users);
    return json({ ok: true, user: publicUser(newUser) });
  }

  if (req.method === 'PATCH') {
    const target = users.find(u => u.id === body.id);
    if (!target) return json({ ok: false, error: 'User not found.' }, 404);

    const isSelf = target.id === me.id;
    const changingPrivileged = 'role' in body || 'active' in body;
    if (!isSelf || changingPrivileged) {
      if (me.role !== 'admin') return json({ ok: false, error: 'Admins only.' }, 403);
    }

    if (body.password) {
      if (isSelf && me.role !== 'admin') {
        if (!body.currentPassword || !verifyPassword(body.currentPassword, target.salt, target.hash)) {
          return json({ ok: false, error: 'Current password is incorrect.' }, 401);
        }
      }
      const { salt, hash } = hashPassword(body.password);
      target.salt = salt; target.hash = hash;
    }
    if (body.name) target.name = body.name;
    if ('role' in body) target.role = body.role === 'admin' ? 'admin' : 'eboard';
    if ('active' in body) {
      if (target.active !== false && body.active === false && target.role === 'admin') {
        const activeAdmins = users.filter(u => u.role === 'admin' && u.active !== false);
        if (activeAdmins.length <= 1) return json({ ok: false, error: 'Cannot deactivate the last admin.' }, 400);
      }
      target.active = !!body.active;
    }

    await setCollection('users', users);
    return json({ ok: true, user: publicUser(target) });
  }

  if (req.method === 'DELETE') {
    if (me.role !== 'admin') return json({ ok: false, error: 'Admins only.' }, 403);
    const target = users.find(u => u.id === body.id);
    if (!target) return json({ ok: false, error: 'User not found.' }, 404);
    if (target.role === 'admin') {
      const activeAdmins = users.filter(u => u.role === 'admin' && u.active !== false);
      if (activeAdmins.length <= 1) return json({ ok: false, error: 'Cannot remove the last admin.' }, 400);
    }
    await setCollection('users', users.filter(u => u.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
