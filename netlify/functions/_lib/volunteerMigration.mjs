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
//    order, or whose reason text predates a wording change. Never
//    touches `amount`.
//
// Shared (not just called from portal-volunteer.mjs) because the points
// collection has more than one reader — the secretary's Pending Approval
// list (portal-points.mjs) needs to see consolidated, sorted entries too,
// not just the member-facing signup page. needsVolunteerFix() is a cheap
// non-mutating pre-check both callers use to decide whether it's worth
// entering the retry-safe write path at all — important because an
// already-consolidated, already-sorted entry is the common case once
// things settle, and that case must be free (no guard would mean every
// single read does a wasted extra blob write).
import { randomUUID } from 'node:crypto';

export function slotStartMinutes(label) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

// "10:00 AM–10:30 AM" -> { startLabel: "10:00 AM", endLabel: "10:30 AM",
// start: 600, end: 630 }, or null if the label isn't a plain time range
// (e.g. a hand-typed custom slot name with no dash).
function parseSlotRange(label) {
  const parts = String(label || '').split(/[–-]/).map(s => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { startLabel: parts[0], endLabel: parts[1], start: slotStartMinutes(parts[0]), end: slotStartMinutes(parts[1]) };
}

// Collapses back-to-back slots (one's end === the next's start) into a
// single "9:00 AM–11:00 AM" range instead of listing every half-hour
// chunk separately. Assumes `labels` is already chronologically sorted.
function mergeConsecutiveSlots(labels) {
  const out = [];
  let current = null;
  for (const label of labels) {
    const r = parseSlotRange(label);
    if (!r) { // not a parseable time range (e.g. a custom-named slot) — pass through as-is
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

// `slotLabels` must already be chronologically sorted.
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

function normalizedSlotsAndReason(p) {
  const sorted = [...(p.slotLabels || [])].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
  const reason = buildVolunteerReason(sorted, p.itemCount || 0, p.items || '');
  return { sorted, reason };
}

// Cheap, non-mutating check — call this before deciding whether to enter
// updateCollection at all.
export function needsVolunteerFix(points) {
  for (const p of points) {
    if (p.source === 'volunteer-slot' || p.source === 'volunteer-items') return true;
    if (p.source === 'volunteer') {
      const { sorted, reason } = normalizedSlotsAndReason(p);
      if (reason !== p.reason || JSON.stringify(sorted) !== JSON.stringify(p.slotLabels || [])) return true;
    }
  }
  return false;
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
    const { sorted, reason } = normalizedSlotsAndReason(p);
    if (reason !== p.reason || JSON.stringify(sorted) !== JSON.stringify(p.slotLabels || [])) {
      p.slotLabels = sorted;
      p.reason = reason;
      changed = true;
    }
  }

  return changed;
}
