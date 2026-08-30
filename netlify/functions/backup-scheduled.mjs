// Netlify Scheduled Function — runs automatically on the cron below with no
// direct URL invocation possible (Netlify's scheduler is the only caller in
// production; see docs.netlify.com/build/functions/scheduled-functions).
import { runBackup } from './_lib/backup.mjs';

export default async function handler() {
  await runBackup();
}

export const config = { schedule: '@weekly' };
