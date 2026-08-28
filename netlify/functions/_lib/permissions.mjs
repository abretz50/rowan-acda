import { getCollection, setCollection } from './blobs.mjs';

// Role -> tab permission mapping. Roles mirror the chapter's actual E-Board
// titles (see _lib/contentSeed.mjs) so "who can edit what" matches who
// actually holds that job in real life.
export const ROLES = [
  'member', 'president', 'admin', 'vice_president', 'secretary',
  'treasurer', 'event_coordinator', 'media', 'senator', 'eboard_legacy',
];

// Roles with unconditional full access — a real club title (president, vice
// president) or a site-maintainer account that shouldn't have to pose as
// the president. President and admin are deliberately identical: either can
// manage accounts, create new presidents/E-Board members, and do anything
// else in the portal.
export const FULL_ACCESS_ROLES = ['president', 'admin', 'eboard_legacy', 'vice_president'];

// Tabs whose access can be granted per-role from the portal's Permissions
// tab. 'content' and 'accounts' are deliberately left out of this list —
// managing the roster's public bios and managing who has portal accounts
// stay full-access-only no matter what's configured here.
export const MANAGEABLE_TABS = ['events', 'members', 'points', 'library', 'gallery', 'budget'];

// Every tab the portal dashboard can show, manageable or not — used to
// compute a signed-in user's full tab list in one place.
export const ALL_TABS = [...MANAGEABLE_TABS, 'content', 'accounts', 'permissions'];

// Non-full-access roles shown on the Permissions tab by default. A custom
// role (created via the Accounts tab's "Other" option) is added to the
// stored map the first time someone grants it anything, and then shows up
// here too.
export const BASE_ADJUSTABLE_ROLES = ['secretary', 'treasurer', 'event_coordinator', 'media', 'senator'];

const DEFAULT_TAB_ROLES = {
  events: ['event_coordinator', 'secretary', 'media', 'treasurer', 'senator'],
  members: ['secretary', 'treasurer', 'event_coordinator'],
  points: ['secretary', 'event_coordinator'],
  library: [],
  gallery: ['media'],
  budget: ['treasurer'],
};

// Auto-seeds from DEFAULT_TAB_ROLES the first time this is read — same
// pattern as the other Blobs collections in this app (library/content/
// events/gallery), so the permissions system works out of the box and only
// needs the Permissions tab once someone wants to change something.
export async function loadTabRoles() {
  const existing = await getCollection('permissions', null);
  if (existing) return existing;
  await setCollection('permissions', DEFAULT_TAB_ROLES);
  return DEFAULT_TAB_ROLES;
}

export async function saveTabRoles(tabRoles) {
  await setCollection('permissions', tabRoles);
}

export async function hasPermission(role, tab) {
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (!tab) return true; // just needs to be a signed-in account
  if (!MANAGEABLE_TABS.includes(tab)) return false; // content/accounts/permissions: full-access only
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
// nothing else) until granted more from the Permissions tab.
export function isValidRole(role) {
  if (ROLES.includes(role)) return true;
  const trimmed = String(role || '').trim();
  return trimmed.length > 0 && trimmed.length <= 40;
}
