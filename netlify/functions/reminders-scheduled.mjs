// Netlify Scheduled Function — runs daily at 11:00 UTC (~6-7am US Eastern,
// depending on DST), no direct URL invocation possible in production; see
// docs.netlify.com/build/functions/scheduled-functions.
import { runDailyReminders } from './_lib/reminders.mjs';

export default async function handler() {
  await runDailyReminders();
}

export const config = { schedule: '0 11 * * *' };
