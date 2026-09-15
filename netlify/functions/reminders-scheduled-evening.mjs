// Netlify Scheduled Function — runs daily at 23:00 UTC = 7:00 PM US
// Eastern during EDT (6:00 PM once EST resumes in November, same one-hour
// seasonal drift as reminders-scheduled.mjs — see that file's comment).
// This is the "night before" half of the volunteer signup reminder pair:
// the morning run (reminders-scheduled.mjs -> runDailyReminders) already
// covers the morning-of pass, general task/event reminders, and the
// Sunday digest. Kept as its own lightweight function/schedule rather
// than a second cron expression on the same function, since Netlify
// scheduled functions take one schedule each.
import { runVolunteerReminders } from './_lib/reminders.mjs';

export default async function handler() {
  await runVolunteerReminders('tomorrow');
}

export const config = { schedule: '0 23 * * *' };
