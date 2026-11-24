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

// Optimistic-retry read-modify-write. True atomicity needs @netlify/blobs'
// conditional-write support (onlyIfMatch/onlyIfNew), which only exists
// starting in v10; this project is pinned to v6 because bumping past it
// once changed how the store resolves its backing environment and made
// every existing collection unreadable (surfaced as "all the accounts are
// gone" — nothing was actually deleted, the site was just pointed at a
// different, empty store). Revisit the version bump separately, with a
// safer migration path, before attempting a real CAS-based fix.
//
// Until then: re-read right before writing, and if anything else wrote in
// the gap since our read, re-run `mutate` against the newer data instead of
// blindly overwriting it — this is what actually fixes "adding one thing
// makes another one vanish" (a classic lost update), not just a
// client-side workaround. `mutate` must be a pure function of the value
// it's given (no capturing stale outer state) since it may run more than
// once per call.
export async function updateCollection(name, fallback, mutate, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const current = await getCollection(name, fallback);
    const beforeSnapshot = JSON.stringify(current);
    const next = await mutate(current);
    const recheck = await getCollection(name, fallback);
    if (JSON.stringify(recheck) !== beforeSnapshot) {
      if (attempt < retries) continue;
      throw new Error('Could not save — someone else was editing this at the same time. Please try again.');
    }
    await setCollection(name, next);
    return next;
  }
}
