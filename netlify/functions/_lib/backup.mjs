// Snapshots every Blobs collection into one JSON file committed to the
// GitHub repo — a second, independent storage system from Netlify Blobs, so
// a Blobs-side incident (see the @netlify/blobs v11 store-resolution outage)
// can't take out both the live data and its backup at once. The file lives
// at a fixed path, so each run's commit is just an update — the full history
// of past backups is still recoverable from that one file's git log.
import { getCollection } from './blobs.mjs';
import { ghFetch, GH_BRANCH } from './github.mjs';

const COLLECTIONS = [
  'budget', 'events', 'content', 'eventComments', 'library', 'gallery',
  'members', 'users', 'points', 'tasks', 'permissions', 'eventPointDefaults',
];
const BACKUP_PATH = 'backups/portal-data-backup.json';

export async function runBackup() {
  const collections = {};
  for (const name of COLLECTIONS) {
    collections[name] = await getCollection(name, null);
  }
  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), collections }, null, 2);
  const base64 = Buffer.from(payload, 'utf-8').toString('base64');

  let sha;
  const getRes = await ghFetch(`contents/${BACKUP_PATH}`, 'GET');
  if (getRes.ok) sha = (await getRes.json()).sha;

  const putRes = await ghFetch(`contents/${BACKUP_PATH}`, 'PUT', {
    message: `Portal data backup — ${new Date().toISOString().slice(0, 10)}`,
    content: base64,
    branch: GH_BRANCH,
    ...(sha ? { sha } : {}),
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.message || `GitHub error ${putRes.status}`);
  }
  return { path: BACKUP_PATH, generatedAt: new Date().toISOString() };
}
