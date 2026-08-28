import { requireAuth, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import {
  loadTabRoles, saveTabRoles, MANAGEABLE_TABS, BASE_ADJUSTABLE_ROLES, FULL_ACCESS_ROLES,
} from './_lib/permissions.mjs';

// Full-access only (president/admin/vice_president/eboard_legacy) — and
// deliberately NOT itself adjustable from here, so a role can never grant
// itself the ability to change permissions.
export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  if (!FULL_ACCESS_ROLES.includes(auth.user.role)) {
    return json({ ok: false, error: 'Not authorized.' }, 403);
  }

  if (req.method === 'GET') {
    const [tabRoles, members] = await Promise.all([loadTabRoles(), loadMembers()]);
    const rolesInUse = members.map(m => m.role);
    const roles = [...new Set([...BASE_ADJUSTABLE_ROLES, ...rolesInUse])]
      .filter(r => r && r !== 'member' && !FULL_ACCESS_ROLES.includes(r));
    return json({ ok: true, tabs: MANAGEABLE_TABS, roles, tabRoles });
  }

  if (req.method !== 'PATCH') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { role, tabs } = body;
  if (!role || !Array.isArray(tabs)) return json({ ok: false, error: 'role and tabs[] are required.' }, 400);
  if (FULL_ACCESS_ROLES.includes(role)) return json({ ok: false, error: 'That role already has full access.' }, 400);

  const tabRoles = await loadTabRoles();
  for (const tab of MANAGEABLE_TABS) {
    const roleSet = new Set(tabRoles[tab] || []);
    if (tabs.includes(tab)) roleSet.add(role); else roleSet.delete(role);
    tabRoles[tab] = [...roleSet];
  }
  await saveTabRoles(tabRoles);
  return json({ ok: true, tabRoles });
}
