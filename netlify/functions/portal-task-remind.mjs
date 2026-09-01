// Manual "Send Reminder" for a single task, from the Task Board — emails
// the assignee and anyone tagged on it, right now, regardless of due date.
// Gated the same way portal-tasks.mjs itself is (any signed-in non-member).
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { sendEmail, memberEmails } from './_lib/email.mjs';
import { taskReminderEmailHtml } from './_lib/reminders.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  if (auth.user.role === 'member') return json({ ok: false, error: 'Not authorized.' }, 403);
  if (!process.env.RESEND_API_KEY) return json({ ok: false, error: 'Email is not configured (missing RESEND_API_KEY).' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  const tasks = await getCollection('tasks', []);
  const task = tasks.find(t => t.id === body.id);
  if (!task) return json({ ok: false, error: 'Task not found.' }, 404);

  const members = await loadMembers();
  const membersById = new Map(members.map(m => [m.id, m]));
  const recipientIds = new Set([task.assignedToId, ...(task.tags || []).map(x => x.id)]);
  const html = taskReminderEmailHtml(task, null);

  const jobs = [];
  for (const id of recipientIds) {
    const emails = memberEmails(membersById.get(id));
    if (emails.length) jobs.push(sendEmail({ to: emails, subject: `Reminder: ${task.title}`, html }));
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.filter(r => r.status === 'rejected' || r.value?.ok === false).length;

  if (!task.history) task.history = [];
  task.history.push({ event: 'reminded', byId: auth.user.id, byName: auth.user.name, at: new Date().toISOString() });
  await setCollection('tasks', tasks);

  return json({ ok: true, sent: jobs.length, failed });
}
