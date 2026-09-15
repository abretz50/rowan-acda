// Self-healing pass over the points collection's volunteer entries:
//
// 1. Consolidates any leftover pre-consolidation entries (source:
//    'volunteer-slot' / 'volunteer-items', one row per action) into the
//    single-entry-per-person shape (source: 'volunteer', slotLabels[] +
//    itemCount/items) used everywhere else. Amounts are summed from the
//    old entries rather than recomputed from current point defaults, so
//    an already-approved amount never silently changes.
// 2. Normalizes every consolidated 'volunteer' entry's slotLabels into
//    chronological order and regenerates its reason text to match —
//    covers entries just consolidated above and any earlier-consolidated
//    ones whose slots ended up listed in signup order instead of time
//    order. Never touches `amount`.
//
// Shared (not just called from portal-volunteer.mjs) because the points
// collection has more than one reader — the secretary's Pending Approval
// list (portal-points.mjs) needs to see consolidated, sorted entries too,
// not just the member-facing signup page.
//
// Returns true if it changed anything (caller persists only then).
import { randomUUID } from 'node:crypto';

export function slotStartMinutes(label) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

export function buildVolunteerReason(slotLabels, itemCount, items) {
  const parts = [];
  if (slotLabels.length) {
    parts.push(`Volunteer Slots: ${slotLabels.join(', ')}`);
  }
  if (itemCount > 0) {
    parts.push(`Bringing ${itemCount} item${itemCount !== 1 ? 's' : ''}: ${items}`);
  }
  return parts.join('. ');
}

export function migrateOldVolunteerEntries(points) {
  let changed = false;

  const oldEntries = points.filter(p => p.source === 'volunteer-slot' || p.source === 'volunteer-items');
  if (oldEntries.length) {
    changed = true;
    const groups = new Map();
    for (const p of oldEntries) {
      const key = `${p.eventId}|${p.memberId}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          id: randomUUID(), memberId: p.memberId, memberName: p.memberName, memberEmail: p.memberEmail,
          source: 'volunteer', eventId: p.eventId, eventTitle: p.eventTitle,
          slotLabels: [], itemCount: 0, items: '', amount: 0,
          status: p.status, requestedAt: p.requestedAt, decidedAt: p.decidedAt, decidedBy: p.decidedBy,
        };
        groups.set(key, g);
      }
      if (p.source === 'volunteer-slot' && p.slotLabel && !g.slotLabels.includes(p.slotLabel)) g.slotLabels.push(p.slotLabel);
      if (p.source === 'volunteer-items') { g.itemCount = p.itemCount || 0; g.items = p.items || ''; }
      g.amount += p.amount || 0;
      if (p.status === 'approved' || p.status === 'denied') { g.status = p.status; g.decidedAt = p.decidedAt; g.decidedBy = p.decidedBy; }
      if (p.requestedAt && p.requestedAt < g.requestedAt) g.requestedAt = p.requestedAt;
    }
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].source === 'volunteer-slot' || points[i].source === 'volunteer-items') points.splice(i, 1);
    }
    for (const g of groups.values()) points.push(g);
  }

  for (const p of points) {
    if (p.source !== 'volunteer') continue;
    const sorted = [...(p.slotLabels || [])].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
    const reason = buildVolunteerReason(sorted, p.itemCount || 0, p.items || '');
    const sameOrder = JSON.stringify(sorted) === JSON.stringify(p.slotLabels || []);
    if (!sameOrder || reason !== p.reason) {
      p.slotLabels = sorted;
      p.reason = reason;
      changed = true;
    }
  }

  return changed;
}
