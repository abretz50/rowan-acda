// Self-healing pass over the points collection's volunteer entries.
// Steady-state shape (what every entry should look like once this has
// run): one 'volunteer' entry per person+event for time slots
// (slotLabels[]), and — kept deliberately separate — one 'volunteer-food'
// entry per person+event for a bake-sale item signup (itemCount/items).
// Food stays its own request because its point value is inherently
// negotiable (the secretary may want to award more or less depending on
// what actually shows up), unlike a flat per-slot rate; portal.js always
// flags 'volunteer-food' entries for review regardless of amount.
//
// Three transitional shapes get folded into that steady state:
// 1. 'volunteer-slot' / 'volunteer-items' — the original one-row-per-action
//    format, from before any consolidation existed.
// 2. A 'volunteer' entry that still carries itemCount/items — the
//    slots-and-food-merged-together shape used briefly before food was
//    split back out. Its item portion is recomputed at `perItem` (the
//    current default) and moved into its own 'volunteer-food' entry;
//    the remainder of its stored amount stays with the slots.
// Amounts from already-existing rows are summed/preserved rather than
// recomputed from current defaults wherever the original amount is
// still available, so an already-approved amount never silently changes.
//
// Shared (not just called from portal-volunteer.mjs) because the points
// collection has more than one reader — the secretary's Pending Approval
// list (portal-points.mjs) needs to see the fixed-up entries too, not
// just the member-facing signup page. needsVolunteerFix() is a cheap
// non-mutating pre-check both callers use to decide whether it's worth
// entering the retry-safe write path at all.
import { randomUUID } from 'node:crypto';

export function slotStartMinutes(label) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

function parseSlotRange(label) {
  const parts = String(label || '').split(/[–-]/).map(s => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { startLabel: parts[0], endLabel: parts[1], start: slotStartMinutes(parts[0]), end: slotStartMinutes(parts[1]) };
}

// Collapses back-to-back slots (one's end === the next's start) into a
// single "9:00 AM–11:00 AM" range. Assumes `labels` is already sorted.
function mergeConsecutiveSlots(labels) {
  const out = [];
  let current = null;
  for (const label of labels) {
    const r = parseSlotRange(label);
    if (!r) {
      if (current) { out.push(`${current.startLabel}–${current.endLabel}`); current = null; }
      out.push(label);
      continue;
    }
    if (current && current.end === r.start) {
      current.endLabel = r.endLabel;
      current.end = r.end;
    } else {
      if (current) out.push(`${current.startLabel}–${current.endLabel}`);
      current = r;
    }
  }
  if (current) out.push(`${current.startLabel}–${current.endLabel}`);
  return out;
}

// `slotLabels` must already be chronologically sorted. Slots and items are
// still accepted together here purely as a formatting utility (used while
// splitting a merged legacy entry apart) — steady-state entries only ever
// pass one side non-empty.
export function buildVolunteerReason(slotLabels, itemCount, items) {
  const parts = [];
  if (slotLabels.length) {
    parts.push(`Volunteer slots (${slotLabels.length}): ${mergeConsecutiveSlots(slotLabels).join(', ')}`);
  }
  if (itemCount > 0) {
    parts.push(`Bringing ${itemCount} item${itemCount !== 1 ? 's' : ''}: ${items}`);
  }
  return parts.join('. ');
}

function newBase(p, source) {
  return {
    id: randomUUID(), memberId: p.memberId, memberName: p.memberName, memberEmail: p.memberEmail,
    source, eventId: p.eventId, eventTitle: p.eventTitle,
    status: p.status, requestedAt: p.requestedAt, decidedAt: p.decidedAt, decidedBy: p.decidedBy,
  };
}

function mergeDecidedStatus(g, p) {
  if (p.status === 'approved' || p.status === 'denied') { g.status = p.status; g.decidedAt = p.decidedAt; g.decidedBy = p.decidedBy; }
  if (p.requestedAt && p.requestedAt < g.requestedAt) g.requestedAt = p.requestedAt;
}

export function needsVolunteerFix(points) {
  if (points.some(p => p.source === 'volunteer-slot' || p.source === 'volunteer-items')) return true;
  for (const p of points) {
    if (p.source === 'volunteer') {
      if (p.itemCount > 0) return true; // still merged with food — needs splitting
      const sorted = [...(p.slotLabels || [])].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
      if (JSON.stringify(sorted) !== JSON.stringify(p.slotLabels || [])) return true;
      if (buildVolunteerReason(sorted, 0, '') !== p.reason) return true;
    } else if (p.source === 'volunteer-food') {
      if (buildVolunteerReason([], p.itemCount || 0, p.items || '') !== p.reason) return true;
    }
  }
  return false;
}

// `perItem` is the current per-item point default (bakeSaleItemPointsDefault())
// — only needed to split an already-merged legacy entry's food portion out;
// pass 25 (the original built-in default) if the caller has no better value.
export function migrateOldVolunteerEntries(points, perItem = 25) {
  let changed = false;

  // 1. Fold the oldest one-row-per-action format into per-person groups.
  const oldSlotRows = points.filter(p => p.source === 'volunteer-slot');
  const oldItemRows = points.filter(p => p.source === 'volunteer-items');
  if (oldSlotRows.length || oldItemRows.length) {
    changed = true;
    const slotGroups = new Map();
    for (const p of oldSlotRows) {
      const key = `${p.eventId}|${p.memberId}`;
      let g = slotGroups.get(key);
      if (!g) { g = { ...newBase(p, 'volunteer'), slotLabels: [], amount: 0 }; slotGroups.set(key, g); }
      if (p.slotLabel && !g.slotLabels.includes(p.slotLabel)) g.slotLabels.push(p.slotLabel);
      g.amount += p.amount || 0;
      mergeDecidedStatus(g, p);
    }
    const itemGroups = new Map();
    for (const p of oldItemRows) {
      const key = `${p.eventId}|${p.memberId}`;
      let g = itemGroups.get(key);
      if (!g) { g = { ...newBase(p, 'volunteer-food'), itemCount: 0, items: '', amount: 0 }; itemGroups.set(key, g); }
      g.itemCount = p.itemCount || g.itemCount;
      g.items = p.items || g.items;
      g.amount += p.amount || 0;
      mergeDecidedStatus(g, p);
    }
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].source === 'volunteer-slot' || points[i].source === 'volunteer-items') points.splice(i, 1);
    }
    for (const g of slotGroups.values()) {
      const existing = points.find(p => p.source === 'volunteer' && p.eventId === g.eventId && p.memberId === g.memberId);
      if (existing) {
        for (const l of g.slotLabels) if (!existing.slotLabels.includes(l)) existing.slotLabels.push(l);
        existing.amount = (existing.amount || 0) + g.amount;
      } else {
        points.push(g);
      }
    }
    for (const g of itemGroups.values()) {
      const existing = points.find(p => p.source === 'volunteer-food' && p.eventId === g.eventId && p.memberId === g.memberId);
      if (existing) {
        existing.itemCount = g.itemCount; existing.items = g.items; existing.amount = (existing.amount || 0) + g.amount;
      } else {
        points.push(g);
      }
    }
  }

  // 2. Split any merged 'volunteer' entry that still carries food fields.
  for (const p of points) {
    if (p.source !== 'volunteer' || !(p.itemCount > 0)) continue;
    changed = true;
    const itemAmount = p.itemCount * perItem;
    const existingFood = points.find(fp => fp.source === 'volunteer-food' && fp.eventId === p.eventId && fp.memberId === p.memberId);
    if (existingFood) {
      existingFood.itemCount = p.itemCount; existingFood.items = p.items; existingFood.amount = itemAmount;
    } else {
      points.push({
        ...newBase(p, 'volunteer-food'), itemCount: p.itemCount, items: p.items, amount: itemAmount,
        status: 'pending', decidedAt: null, decidedBy: null,
      });
    }
    p.amount = Math.max(0, (p.amount || 0) - itemAmount);
    p.itemCount = 0;
    p.items = '';
  }

  // 3. Normalize chronological order + reason text on every steady-state entry.
  for (const p of points) {
    if (p.source === 'volunteer') {
      const sorted = [...(p.slotLabels || [])].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
      const reason = buildVolunteerReason(sorted, 0, '');
      if (reason !== p.reason || JSON.stringify(sorted) !== JSON.stringify(p.slotLabels || [])) {
        p.slotLabels = sorted; p.reason = reason; changed = true;
      }
    } else if (p.source === 'volunteer-food') {
      const reason = buildVolunteerReason([], p.itemCount || 0, p.items || '');
      if (reason !== p.reason) { p.reason = reason; changed = true; }
    }
  }

  return changed;
}
