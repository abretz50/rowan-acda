import { getStore } from '@netlify/blobs';

const STORE_NAME = 'acda-portal';

function store() {
  return getStore(STORE_NAME);
}

export async function getCollection(name, fallback) {
  const data = await store().get(name, { type: 'json' });
  return data ?? fallback;
}

export async function setCollection(name, data) {
  await store().setJSON(name, data);
}

// Read-modify-write with optimistic concurrency. Plain getCollection +
// setCollection has no protection against two overlapping requests both
// reading the same "before" state and then writing — whichever writes
// second silently wins and erases the first one's change (this is exactly
// what caused moved gallery photos to randomly "come back" to their old
// folder: move A, then move B, and B's write — built from a stale read
// that predates A's save — clobbers A's move on the way out).
//
// `mutate(current)` receives the current stored value (or `fallback` if
// nothing is stored yet) and returns the new value to save. It's re-run on
// every retry, so it must be a pure function of its input — no side effects
// beyond deriving the return value — since a conflicting concurrent write
// can force it to run more than once against a fresher read.
export async function updateCollection(name, fallback, mutate) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await store().getWithMetadata(name, { type: 'json' });
    const value = current ? current.data : fallback;
    const next = await mutate(value);
    const writeOptions = current ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    const { modified } = await store().setJSON(name, next, writeOptions);
    if (modified) return next;
  }
  throw new Error(`Could not save ${name} — too much concurrent activity, please try again.`);
}
