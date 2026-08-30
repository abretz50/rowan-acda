// Manual "Back Up Now" trigger for the portal's Permissions tab — runs the
// same snapshot as the weekly scheduled backup (backup-scheduled.mjs), since
// scheduled functions can't be invoked directly from the browser.
import { requireAuth, json } from './_lib/auth.mjs';
import { runBackup } from './_lib/backup.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req, { perm: 'permissions' });
  if (auth.deny) return auth.deny;
  if (!process.env.GITHUB_TOKEN) return json({ ok: false, error: 'Backups are not configured (missing GITHUB_TOKEN).' }, 500);

  try {
    const result = await runBackup();
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e.message || 'Backup failed.' }, 500);
  }
}
