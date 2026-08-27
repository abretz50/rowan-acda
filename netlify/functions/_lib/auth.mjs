import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { getCollection } from './blobs.mjs';

const COOKIE_NAME = 'acda_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

// ── Passwords ─────────────────────────────────────────────
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// ── Sessions (HMAC-signed cookie, no server-side session store needed) ──
export function signSession(payload) {
  const body = { ...payload, exp: Date.now() + SESSION_TTL_SECONDS * 1000 };
  const payloadB64 = b64url(JSON.stringify(body));
  const sig = b64url(createHmac('sha256', secret()).update(payloadB64).digest());
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  const expectedSig = b64url(createHmac('sha256', secret()).update(payloadB64).digest());
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Cookie plumbing ───────────────────────────────────────
export function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function setSessionCookieHeader(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function getSessionUser(req) {
  const token = getCookie(req, COOKIE_NAME);
  return verifySessionToken(token);
}

// ── Guard for protected functions ────────────────────────
// Re-checks the *live* users collection on every call (not just the signed
// cookie's snapshot) so a deactivation, role change, or removal takes effect
// immediately instead of waiting out the old session's 30-day expiry.
// Returns { user, users } on success ('user' is the live record, minus
// salt/hash), or { deny: Response } to return immediately.
export async function requireAuth(req, { role } = {}) {
  const token = getSessionUser(req);
  if (!token) return { deny: json({ ok: false, error: 'Not authenticated.' }, 401) };

  const users = await getCollection('users', []);
  const live = users.find(u => u.id === token.userId && u.active !== false);
  if (!live) return { deny: json({ ok: false, error: 'Session no longer valid.' }, 401) };

  if (role && live.role !== role && live.role !== 'admin') {
    return { deny: json({ ok: false, error: 'Not authorized.' }, 403) };
  }
  const { salt, hash, ...safeUser } = live;
  return { user: safeUser, users };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
