import { getCollection, setCollection } from './blobs.mjs';

// Members and login accounts used to be two separate collections
// ('members.json': roster name/email/year/voicePart, 'users.json': login
// credentials). They're merged into one 'members' collection so every
// roster entry can optionally *be* a login account. This runs the
// one-time migration the first time it's needed, then is a no-op forever
// after (detected by every record already having a 'hasAccount' field).
function mapOldRole(r) {
  return r === 'admin' ? 'president' : 'eboard_legacy';
}

export async function loadMembers() {
  const existing = await getCollection('members', null);
  const alreadyMigrated = existing && existing.length > 0 && existing.every(m => 'hasAccount' in m);
  if (alreadyMigrated) return existing;

  const merged = (existing || []).map(m => ({
    id: m.id, name: m.name, email: m.email || '',
    role: 'member', hasAccount: false,
    active: m.active !== false, joinedAt: m.joinedAt || new Date().toISOString(),
  }));

  // Old login accounts only ever had a username, often no email — kept as
  // `username` so login can still fall back to matching it (see
  // portal-auth.mjs's findByIdentifier).
  const oldUsers = await getCollection('users', []);
  for (const u of oldUsers) {
    merged.push({
      id: u.id, name: u.name, email: '',
      role: mapOldRole(u.role), hasAccount: true,
      username: u.username, salt: u.salt, hash: u.hash,
      active: u.active !== false, joinedAt: new Date().toISOString(),
    });
  }

  await setCollection('members', merged);
  return merged;
}

export async function saveMembers(members) {
  await setCollection('members', members);
}

export function publicMember(m) {
  const { salt, hash, username, ...safe } = m;
  return safe;
}

export function accountMember(m) {
  const { salt, hash, ...safe } = m;
  return safe;
}
