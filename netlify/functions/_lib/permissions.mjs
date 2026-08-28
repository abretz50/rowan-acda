// Role -> tab permission mapping. Roles mirror the chapter's actual E-Board
// titles (see _lib/contentSeed.mjs) so "who can edit what" matches who
// actually holds that job in real life.
export const ROLES = [
  'member', 'president', 'admin', 'vice_president', 'secretary',
  'treasurer', 'event_coordinator', 'media', 'senator', 'eboard_legacy',
];

// Roles with unconditional full access — a real club title (president,
// vice president) or a site-maintainer account that shouldn't have to pose
// as the president.
export const FULL_ACCESS_ROLES = ['president', 'admin', 'eboard_legacy', 'vice_president'];

// tab -> roles allowed (besides the FULL_ACCESS_ROLES above, who can always
// do everything). 'eboard_legacy' is a migration fallback for accounts
// created under the old flat admin/eboard system, treated as full access
// until reassigned.
const TAB_ROLES = {
  events: ['event_coordinator', 'secretary', 'media', 'treasurer'],
  members: ['secretary', 'treasurer'],
  points: ['secretary'],
  library: [],
  gallery: ['media'],
  content: [],
  accounts: [],
  budget: ['treasurer'],
};

export function hasPermission(role, tab) {
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (!tab) return true; // just needs to be a signed-in account
  return (TAB_ROLES[tab] || []).includes(role);
}

export function isValidRole(role) {
  return ROLES.includes(role);
}
