// Role -> tab permission mapping. Roles mirror the chapter's actual E-Board
// titles (see _lib/contentSeed.mjs) so "who can edit what" matches who
// actually holds that job in real life.
export const ROLES = [
  'member', 'president', 'admin', 'vice_president', 'secretary',
  'treasurer', 'event_coordinator', 'media', 'senator', 'eboard_legacy',
];

// Roles with unconditional full access — a real club title (president) or a
// site-maintainer account that shouldn't have to pose as the president.
export const FULL_ACCESS_ROLES = ['president', 'admin', 'eboard_legacy'];

// tab -> roles allowed (besides 'president', who can always do everything,
// and 'eboard_legacy' — a migration fallback for accounts created under the
// old flat admin/eboard system, treated as full access until reassigned).
const TAB_ROLES = {
  events: ['event_coordinator'],
  members: ['secretary'],
  points: ['secretary'],
  library: ['vice_president'],
  gallery: ['media'],
  content: [],
  accounts: [],
};

export function hasPermission(role, tab) {
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (!tab) return true; // just needs to be a signed-in account
  return (TAB_ROLES[tab] || []).includes(role);
}

export function isValidRole(role) {
  return ROLES.includes(role);
}
