import { randomUUID } from 'node:crypto';
import { loadMembers, saveMembers, accountMember } from './_lib/loadMembers.mjs';
import { updateCollection } from './_lib/blobs.mjs';
import { sendEmail, memberEmails, emailLayout, ctaButton, escapeHtml } from './_lib/email.mjs';
import {
  hashPassword, verifyPassword, signSession, signResetToken, readResetToken, resetTokenMatches,
  setSessionCookieHeader, clearSessionCookieHeader, getSessionUser, json,
} from './_lib/auth.mjs';
import { FULL_ACCESS_ROLES, computeCanUse } from './_lib/permissions.mjs';

const RESET_REQUEST_COOLDOWN_MS = 2 * 60 * 1000;
const MIN_RESET_PASSWORD_LENGTH = 8;

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
    return json({ ok: true, user: accountMember(m), canUse: await computeCanUse(m.role) });
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
    return json({ ok: true, user: accountMember(m), canUse: await computeCanUse(m.role) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
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

  // Always answers the same way whether or not the email matches an account,
  // so this can't be used to find out who has one. The cooldown also keeps a
  // stranger from burning the daily email quota by hammering one address.
  if (action === 'requestReset') {
    const generic = json({ ok: true, message: 'If an account exists for that email, a reset link is on its way. It expires in 1 hour.' });
    const m = findByIdentifier(body.email);
    if (!m || m.active === false || !memberEmails(m).length) return generic;
    let allowed = false;
    await updateCollection('reset-throttle', {}, (t) => {
      const last = Number(t[m.id]) || 0;
      allowed = Date.now() - last > RESET_REQUEST_COOLDOWN_MS;
      if (allowed) t[m.id] = Date.now();
      return t;
    });
    if (!allowed) return generic;
    const link = `https://rowanacda.org/account.html#reset=${encodeURIComponent(signResetToken(m))}`;
    await sendEmail({
      to: memberEmails(m),
      subject: 'Reset your Rowan ACDA password',
      html: emailLayout(`
        <p>Hi ${String(m.name || 'there').split(/\s+/)[0].replace(/[<>&"']/g, '')},</p>
        <p>Someone asked to reset the password on your Rowan ACDA account. Use the button below to choose a new one. The link works once and expires in 1 hour.</p>
        ${ctaButton(link, 'Choose a new password')}
        <p style="color:#666;font-size:.85rem;margin-top:1.25rem">If you didn't ask for this, you can ignore this email and your password will stay the same.</p>
      `),
    });
    return generic;
  }

  if (action === 'resetPassword') {
    const { token, password } = body;
    const payload = readResetToken(token);
    const stale = json({ ok: false, error: 'This reset link has expired or was already used. Request a new one.' }, 400);
    if (!payload) return stale;
    if (!password || String(password).length < MIN_RESET_PASSWORD_LENGTH) {
      return json({ ok: false, error: `Choose a password with at least ${MIN_RESET_PASSWORD_LENGTH} characters.` }, 400);
    }
    let updated = null;
    await updateCollection('members', [], (list) => {
      updated = null;
      const m = list.find(x => x.id === payload.id && x.hasAccount && x.active !== false);
      if (!m || !resetTokenMatches(m, payload)) return list;
      const { salt, hash } = hashPassword(password);
      m.salt = salt; m.hash = hash;
      updated = m;
      return list;
    });
    if (!updated) return stale;
    const session = signSession({ id: updated.id });
    return json({ ok: true, user: accountMember(updated), canUse: await computeCanUse(updated.role) }, 200, { 'Set-Cookie': setSessionCookieHeader(session) });
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
    return json({ ok: true, user: accountMember(admin), canUse: await computeCanUse(admin.role) }, 200, { 'Set-Cookie': setSessionCookieHeader(token) });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
}
