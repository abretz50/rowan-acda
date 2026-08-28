import { getCollection, setCollection } from './blobs.mjs';

// Role -> tab permission mapping. Roles mirror the chapter's actual E-Board
// titles (see _lib/contentSeed.mjs) so "who can edit what" matches who
// actually holds that job in real life.
export const ROLES = [
  'member', 'president', 'admin', 'vice_president', 'secretary',
  'treasurer', 'event_coordinator', 'media', 'senator', 'eboard_legacy',
];

// Roles that always have every tab, no exceptions — not adjustable from the
// Permissions section even for content/accounts. President and admin are
// deliberately identical (either can manage accounts, create new
// presidents/E-Board members, and do anything else); eboard_legacy is a
// migration fallback for accounts created under the old flat admin/eboard
// system, treated as full access until reassigned.
export const LOCKED_FULL_ACCESS_ROLES = ['president', 'admin', 'eboard_legacy'];

// Roles that automatically get 'content' and 'accounts' (never exposed as
// checkboxes, and not adjustable here) in addition to whatever's configured
// for the manageable tabs below. Vice President keeps this "everything by
// default" baseline for those two tabs, but — unlike the locked roles above
// — their manageable-tab access can be individually unchecked.
export const FULL_ACCESS_ROLES = [...LOCKED_FULL_ACCESS_ROLES, 'vice_president'];

// Only these two can view or edit the Permissions section — not even Vice
// President, despite otherwise having full access everywhere else.
export const PERMISSIONS_MANAGERS = ['president', 'admin'];

// Tabs whose access can be granted per-role from the Permissions section
// (folded into the Accounts tab). 'content' and 'accounts' are deliberately
// left out — managing the roster's public bios and managing who has portal
// accounts stay full-access-only no matter what's configured here.
export const MANAGEABLE_TABS = ['events', 'members', 'points', 'library', 'gallery', 'budget'];

// Every tab the portal dashboard can show, manageable or not — used to
// compute a signed-in user's full tab list in one place.
export const ALL_TABS = [...MANAGEABLE_TABS, 'content', 'accounts', 'permissions'];

// Non-locked roles shown on the Permissions section by default (Vice
// President is included since its manageable-tab access is now adjustable,
// even though it keeps automatic content/accounts access above). A custom
// role (created via the Accounts tab's "Other" option) is added to the
// stored map the first time someone grants it anything, and then shows up
// here too.
export const BASE_ADJUSTABLE_ROLES = ['vice_president', 'secretary', 'treasurer', 'event_coordinator', 'media', 'senator'];

const DEFAULT_TAB_ROLES = {
  events: ['vice_president', 'event_coordinator', 'secretary', 'media', 'treasurer', 'senator'],
  members: ['vice_president', 'secretary', 'treasurer', 'event_coordinator'],
  points: ['vice_president', 'secretary', 'event_coordinator'],
  library: ['vice_president'],
  gallery: ['vice_president', 'media'],
  budget: ['vice_president', 'treasurer'],
};

// Auto-seeds from DEFAULT_TAB_ROLES the first time this is read — same
// pattern as the other Blobs collections in this app (library/content/
// events/gallery). Vice President used to bypass this store entirely (real
// full access); now that its manageable-tab access is adjustable, any
// already-seeded store gets a one-time backfill so existing deployments
// don't suddenly lose VP's access to everything on this deploy.
export async function loadTabRoles() {
  const existing = await getCollection('permissions', null);
  if (!existing) {
    const seeded = { ...DEFAULT_TAB_ROLES, _vpMigrated: true };
    await setCollection('permissions', seeded);
    return seeded;
  }
  if (!existing._vpMigrated) {
    for (const tab of MANAGEABLE_TABS) {
      const roleSet = new Set(existing[tab] || []);
      roleSet.add('vice_president');
      existing[tab] = [...roleSet];
    }
    existing._vpMigrated = true;
    await setCollection('permissions', existing);
  }
  return existing;
}

export async function saveTabRoles(tabRoles) {
  await setCollection('permissions', tabRoles);
}

export async function hasPermission(role, tab) {
  if (!tab) return true; // just needs to be a signed-in account
  if (tab === 'permissions') return PERMISSIONS_MANAGERS.includes(role);
  if (LOCKED_FULL_ACCESS_ROLES.includes(role)) return true;
  if (!MANAGEABLE_TABS.includes(tab)) return FULL_ACCESS_ROLES.includes(role); // content/accounts
  const tabRoles = await loadTabRoles();
  return (tabRoles[tab] || []).includes(role);
}

// The full list of tabs a signed-in user can use — computed once here so
// portal.html's dashboard doesn't need its own copy of the permission rules
// to decide what to show.
export async function computeCanUse(role) {
  const out = [];
  for (const tab of ALL_TABS) {
    if (await hasPermission(role, tab)) out.push(tab);
  }
  return out;
}

// Fixed roles are always valid. Anything else is treated as a custom
// E-Board title (the Accounts tab's "Other" option) — it just starts with
// baseline access (able to sign into the portal and see the Overview tab,
// nothing else) until granted more from the Permissions section.
export function isValidRole(role) {
  if (ROLES.includes(role)) return true;
  const trimmed = String(role || '').trim();
  return trimmed.length > 0 && trimmed.length <= 40;
}
