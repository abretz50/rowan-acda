// One-time self-healing migration: consolidates any leftover pre-
// consolidation volunteer points entries (source: 'volunteer-slot' /
// 'volunteer-items', one row per action) into the single-entry-per-person
// shape (source: 'volunteer', slotLabels[] + itemCount/items) used
// everywhere else. Existing amounts are summed and reasons concatenated
// rather than recomputed from current point defaults, so an
// already-approved entry's awarded amount never silently changes.
//
// Shared (not just called from portal-volunteer.mjs) because the points
// collection has more than one reader — the secretary's Pending Approval
// list (portal-points.mjs) needs to see consolidated entries too, not
// just the member-facing signup page, or old data stays visibly split
// until someone happens to load that other page first.
//
// Returns true if it changed anything (caller persists only then).
import { randomUUID } from 'node:crypto';

export function migrateOldVolunteerEntries(points) {
  const oldEntries = points.filter(p => p.source === 'volunteer-slot' || p.source === 'volunteer-items');
  if (!oldEntries.length) return false;

  const groups = new Map();
  for (const p of oldEntries) {
    const key = `${p.eventId}|${p.memberId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: randomUUID(), memberId: p.memberId, memberName: p.memberName, memberEmail: p.memberEmail,
        source: 'volunteer', eventId: p.eventId, eventTitle: p.eventTitle,
        slotLabels: [], itemCount: 0, items: '', amount: 0, reasonParts: [],
        status: p.status, requestedAt: p.requestedAt, decidedAt: p.decidedAt, decidedBy: p.decidedBy,
      };
      groups.set(key, g);
    }
    if (p.source === 'volunteer-slot' && p.slotLabel && !g.slotLabels.includes(p.slotLabel)) g.slotLabels.push(p.slotLabel);
    if (p.source === 'volunteer-items') { g.itemCount = p.itemCount || 0; g.items = p.items || ''; }
    g.amount += p.amount || 0;
    if (p.reason) g.reasonParts.push(p.reason);
    if (p.status === 'approved' || p.status === 'denied') { g.status = p.status; g.decidedAt = p.decidedAt; g.decidedBy = p.decidedBy; }
    if (p.requestedAt && p.requestedAt < g.requestedAt) g.requestedAt = p.requestedAt;
  }

  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].source === 'volunteer-slot' || points[i].source === 'volunteer-items') points.splice(i, 1);
  }
  for (const g of groups.values()) {
    g.reason = g.reasonParts.join('. ');
    delete g.reasonParts;
    points.push(g);
  }
  return true;
}
