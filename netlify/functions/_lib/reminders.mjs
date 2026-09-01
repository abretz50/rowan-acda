// Daily reminder sweep: task deadlines (due today/tomorrow) and upcoming
// events (today = morning-of, tomorrow = heads-up). Runs once a day via the
// scheduled function, or on demand via the manual trigger.
import { getCollection } from './blobs.mjs';
import { loadMembers } from './loadMembers.mjs';
import { sendEmail, emailLayout, escapeHtml } from './email.mjs';

function isoDateOnly(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(base, n) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d; }

export async function runDailyReminders() {
  const now = new Date();
  const today = isoDateOnly(now);
  const tomorrow = isoDateOnly(addDays(now, 1));

  const [tasks, events, members] = await Promise.all([
    getCollection('tasks', []), getCollection('events', []), loadMembers(),
  ]);
  const emailById = new Map(members.map(m => [m.id, m.email]));
  const activeEmails = [...new Set(members.filter(m => m.active !== false && m.email).map(m => m.email))];

  const jobs = [];
  let taskReminders = 0, eventReminders = 0;

  // Task deadlines — the assignee and anyone tagged on it, due today or tomorrow.
  for (const t of tasks) {
    if (t.status !== 'open' || !t.dueDate) continue;
    if (t.dueDate !== today && t.dueDate !== tomorrow) continue;
    const when = t.dueDate === today ? 'today' : 'tomorrow';
    const recipientIds = new Set([t.assignedToId, ...(t.tags || []).map(x => x.id)]);
    const html = emailLayout(`
      <p>Reminder: your task is due <strong>${when}</strong> (${escapeHtml(t.dueDate)}).</p>
      <h3 style="margin:.5rem 0">${escapeHtml(t.title)}</h3>
      ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
      <p><a href="https://rowanacda.org/portal.html" style="color:#7A0A0A">Open the E-Board Portal</a></p>
    `);
    for (const id of recipientIds) {
      const email = emailById.get(id);
      if (!email) continue;
      taskReminders++;
      jobs.push(sendEmail({ to: email, subject: `Task due ${when}: ${t.title}`, html }));
    }
  }

  // Upcoming events — every active member, sent one-at-a-time so no
  // recipient sees anyone else's email address in the To: header.
  for (const e of events) {
    const evDate = isoDateOnly(e.start);
    if (evDate !== today && evDate !== tomorrow) continue;
    const when = evDate === today ? 'today' : 'tomorrow';
    eventReminders++;
    const html = emailLayout(`
      <p>Reminder: this event is happening <strong>${when}</strong>.</p>
      <h3 style="margin:.5rem 0">${escapeHtml(e.title)}</h3>
      <p>${escapeHtml(new Date(e.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))}${e.location ? ' · ' + escapeHtml(e.location) : ''}</p>
      <p><a href="https://rowanacda.org/events.html" style="color:#7A0A0A">See event details</a></p>
    `);
    for (const email of activeEmails) {
      jobs.push(sendEmail({ to: email, subject: `${when === 'today' ? 'Today' : 'Tomorrow'}: ${e.title}`, html }));
    }
  }

  const results = await Promise.allSettled(jobs);
  const errors = results
    .map(r => r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : (r.value?.ok === false ? r.value.error : null))
    .filter(Boolean);
  return {
    taskReminders, eventReminders, emailsSent: jobs.length, emailsFailed: errors.length,
    sampleErrors: [...new Set(errors)].slice(0, 3),
  };
}
