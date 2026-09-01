// Manual "Send Reminders Now" trigger — runs the same sweep as the daily
// scheduled function (reminders-scheduled.mjs), since scheduled functions
// can't be invoked directly from the browser. Useful for confirming the
// email setup (RESEND_API_KEY, sending domain) actually works.
import { requireAuth, json } from './_lib/auth.mjs';
import { runDailyReminders, nextAutomatedRunAt } from './_lib/reminders.mjs';

export default async function handler(req) {
  if (req.method === 'GET') {
    // Open to any signed-in E-Board account (not just president/admin) —
    // it's just an informational label shown next to the per-task/per-event
    // "Send Reminder" buttons, not a sensitive action.
    const auth = await requireAuth(req);
    if (auth.deny) return auth.deny;
    return json({ ok: true, nextRunAt: nextAutomatedRunAt() });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req, { perm: 'permissions' });
  if (auth.deny) return auth.deny;
  if (!process.env.RESEND_API_KEY) return json({ ok: false, error: 'Email is not configured (missing RESEND_API_KEY).' }, 500);

  try {
    const result = await runDailyReminders();
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e.message || 'Reminder sweep failed.' }, 500);
  }
}
