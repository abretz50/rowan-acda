// Netlify Scheduled Function — runs daily at 08:00 UTC = 4:00 AM US
// Eastern during EDT (roughly mid-March to early November). Netlify's
// scheduler only takes a plain UTC cron string, not an IANA timezone, so
// once EST resumes in November this will run at 3:00 AM Eastern instead —
// that's a one-hour drift twice a year, not a bug, and the portal's "next
// automated send" label (computed from this same UTC hour, see
// _lib/reminders.mjs's nextAutomatedRunAt) will always show the true time
// rather than a hardcoded "4:00 AM" that goes wrong for half the year.
// No direct URL invocation possible in production; see
// docs.netlify.com/build/functions/scheduled-functions.
import { runDailyReminders } from './_lib/reminders.mjs';

export default async function handler() {
  await runDailyReminders();
}

export const config = { schedule: '0 8 * * *' };
