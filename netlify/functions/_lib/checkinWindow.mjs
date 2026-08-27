// Default check-in window when an event doesn't set explicit open/close
// times: opens 30 min before start, closes 60 min after end. This is a soft
// anti-abuse measure (you need the code AND to be checking in near the
// actual meeting time) — not meant to be bulletproof for a student club.
const DEFAULT_OPEN_BEFORE_MS = 30 * 60 * 1000;
const DEFAULT_CLOSE_AFTER_MS = 60 * 60 * 1000;

export function checkinWindow(event) {
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : start;
  const opensAt = event.checkinOpensAt
    ? new Date(event.checkinOpensAt)
    : (start ? new Date(start.getTime() - DEFAULT_OPEN_BEFORE_MS) : null);
  const closesAt = event.checkinClosesAt
    ? new Date(event.checkinClosesAt)
    : (end ? new Date(end.getTime() + DEFAULT_CLOSE_AFTER_MS) : null);
  return { opensAt, closesAt };
}

export function isCheckinOpen(event, now = new Date()) {
  const { opensAt, closesAt } = checkinWindow(event);
  if (!opensAt || !closesAt) return false;
  return now >= opensAt && now <= closesAt;
}
