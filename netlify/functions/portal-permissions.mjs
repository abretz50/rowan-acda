import { requireAuth, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import {
  loadTabRoles, saveTabRoles, MANAGEABLE_TABS, LOCKED_DISPLAY_TABS, BASE_ADJUSTABLE_ROLES,
  LOCKED_FULL_ACCESS_ROLES, PERMISSIONS_MANAGERS,
} from './_lib/permissions.mjs';

// President/admin only — deliberately not even Vice President, so a role
// can never grant itself (or have granted) the ability to change
// permissions. This is folded into the portal's Accounts tab UI, not a
// standalone tab.
export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  if (!PERMISSIONS_MANAGERS.includes(auth.user.role)) {
    return json({ ok: false, error: 'Not authorized.' }, 403);
  }

  if (req.method === 'GET') {
    const [tabRoles, members] = await Promise.all([loadTabRoles(), loadMembers()]);
    const rolesInUse = members.map(m => m.role);
    const roles = [...new Set([...BASE_ADJUSTABLE_ROLES, ...rolesInUse])]
      .filter(r => r && r !== 'member' && !LOCKED_FULL_ACCESS_ROLES.includes(r));
    // eboard_legacy is also locked full-access, but it's an internal
    // migration fallback, not a role anyone should see or think about —
    // only show president/admin as the "always full access" display rows.
    return json({ ok: true, tabs: MANAGEABLE_TABS, lockedTabs: LOCKED_DISPLAY_TABS, roles, lockedRoles: ['president', 'admin'], tabRoles });
  }

  if (req.method !== 'PATCH') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { role, tabs } = body;
  if (!role || !Array.isArray(tabs)) return json({ ok: false, error: 'role and tabs[] are required.' }, 400);
  if (LOCKED_FULL_ACCESS_ROLES.includes(role)) return json({ ok: false, error: 'That role always has full access.' }, 400);

  const tabRoles = await loadTabRoles();
  for (const tab of MANAGEABLE_TABS) {
    const roleSet = new Set(tabRoles[tab] || []);
    if (tabs.includes(tab)) roleSet.add(role); else roleSet.delete(role);
    tabRoles[tab] = [...roleSet];
  }
  await saveTabRoles(tabRoles);
  return json({ ok: true, tabRoles });
}
