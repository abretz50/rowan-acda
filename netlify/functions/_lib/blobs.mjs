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

// One blob per record under a prefix, instead of one JSON document holding
// every record. Writes to different keys can never overwrite each other,
// which the document-style collections here can't promise on v6 (see
// updateCollection below). Reach for these for data that's written
// independently of — and concurrently with — the main collection it hangs
// off of, e.g. reviewer comments on points entries.
export async function getKeyed(prefix, id) {
  return store().get(`${prefix}/${id}`, { type: 'json' });
}

export async function setKeyed(prefix, id, data) {
  await store().setJSON(`${prefix}/${id}`, data);
}

export async function deleteKeyed(prefix, id) {
  await store().delete(`${prefix}/${id}`);
}

// Every record under the prefix as { id: data }. One list call plus a get
// per record that actually exists, so cost scales with how many records
// there are, not with the size of whatever collection they annotate.
export async function listKeyed(prefix) {
  const { blobs } = await store().list({ prefix: `${prefix}/` });
  const pairs = await Promise.all(blobs.map(async ({ key }) =>
    [key.slice(prefix.length + 1), await store().get(key, { type: 'json' })]));
  return Object.fromEntries(pairs.filter(([, data]) => data != null));
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
