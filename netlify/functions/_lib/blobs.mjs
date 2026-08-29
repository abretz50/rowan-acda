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

// Plain read-modify-write — NOT protected against two overlapping requests
// (see the gallery folder-move "photos randomly revert" issue for what that
// costs). A real fix needs @netlify/blobs' conditional-write support
// (onlyIfMatch/onlyIfNew), which only exists starting in v10; this project
// is pinned to v6 because bumping past it changed how the store resolves
// its backing environment and made every existing collection unreadable
// (surfaced as "all the accounts are gone" — nothing was actually deleted,
// the site was just pointed at a different, empty store). Revisit the
// version bump separately, with a safer migration path, before attempting
// the CAS-based fix again.
export async function updateCollection(name, fallback, mutate) {
  const current = await getCollection(name, fallback);
  const next = await mutate(current);
  await setCollection(name, next);
  return next;
}
