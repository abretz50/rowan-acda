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
