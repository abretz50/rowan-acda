// Daily reminder sweep: task deadlines (due today/tomorrow) and upcoming
// events (today = morning-of, tomorrow = heads-up). Runs once a day via the
// scheduled function, or on demand via the manual "Send Reminders Now"
// trigger. The per-task/per-event manual "Send Reminder" buttons reuse the
// same email templates (taskReminderEmailHtml/eventReminderEmailHtml) with
// generic wording since they can fire on any day, not just today/tomorrow.
import { getCollection, setCollection } from './blobs.mjs';
import { loadMembers } from './loadMembers.mjs';
import { sendEmail, emailLayout, escapeHtml, ctaButton, emailPhoto, priorityBadge, memberEmails } from './email.mjs';
import { easternDateOnly } from './dateFmt.mjs';

function addDays(base, n) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d; }

// Must match reminders-scheduled.mjs's `schedule` cron hour exactly, so the
// portal's "next automated send" label always reflects the real run time.
const CRON_UTC_HOUR = 8;

export function nextAutomatedRunAt() {
  const now = new Date();
  let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CRON_UTC_HOUR, 0, 0, 0));
  if (next <= now) next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export function taskReminderEmailHtml(task, when) {
  const dueBit = task.dueDate
    ? (when ? ` is due <strong>${when}</strong> (${escapeHtml(task.dueDate)})` : ` (due ${escapeHtml(task.dueDate)})`)
    : '';
  return emailLayout(`
    <p>Reminder: your task <strong>"${escapeHtml(task.title)}"</strong>${dueBit}. ${priorityBadge(task.priority)}</p>
    ${task.description ? `<p style="color:#444">${escapeHtml(task.description)}</p>` : ''}
    ${ctaButton('https://rowanacda.org/portal.html', 'Open the E-Board Portal')}
  `);
}

export function eventReminderEmailHtml(event, when) {
  const introLine = when === 'today' ? 'You have an event today:' : when === 'tomorrow' ? 'You have an event coming up tomorrow:' : 'Reminder about an upcoming event:';
  const whenStr = new Date(event.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  return emailLayout(`
    <p>${introLine}</p>
    <h2 style="margin:.5rem 0;color:#7A0A0A">${escapeHtml(event.title)}</h2>
    ${emailPhoto(event.imageUrl, event.title)}
    ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
    <p style="margin-top:1rem"><strong>${escapeHtml(whenStr)} ET</strong>${event.location ? '<br>' + escapeHtml(event.location) : ''}</p>
    ${ctaButton('https://rowanacda.org/events.html', 'See Event Details')}
  `);
}

export async function runDailyReminders() {
  const now = new Date();
  // Eastern calendar date — a task's dueDate is already a plain YYYY-MM-DD
  // (no timezone ambiguity), but an event's start is a UTC instant that can
  // fall on the "wrong" UTC day for a late-evening Eastern event.
  const today = easternDateOnly(now);
  const tomorrow = easternDateOnly(addDays(now, 1));

  const [tasks, events, members] = await Promise.all([
    getCollection('tasks', []), getCollection('events', []), loadMembers(),
  ]);
  const membersById = new Map(members.map(m => [m.id, m]));
  const activeEmails = [...new Set(members.filter(m => m.active !== false).flatMap(memberEmails))];

  const jobs = [];
  let taskReminders = 0, eventReminders = 0;
  let tasksChanged = false;

  // Task deadlines — the assignee and anyone tagged on it, due today or tomorrow.
  for (const t of tasks) {
    if (t.status !== 'open' || !t.dueDate) continue;
    if (t.dueDate !== today && t.dueDate !== tomorrow) continue;
    const when = t.dueDate === today ? 'today' : 'tomorrow';
    const html = taskReminderEmailHtml(t, when);
    const recipientIds = new Set([t.assignedToId, ...(t.tags || []).map(x => x.id)]);
    let sentAny = false;
    for (const id of recipientIds) {
      const emails = memberEmails(membersById.get(id));
      if (!emails.length) continue;
      taskReminders++;
      sentAny = true;
      jobs.push(sendEmail({ to: emails, subject: `Task due ${when}: ${t.title}`, html }));
    }
    if (sentAny) {
      if (!t.history) t.history = [];
      t.history.push({ event: 'reminded', byId: null, byName: 'Automated', at: now.toISOString() });
      tasksChanged = true;
    }
  }
  if (tasksChanged) await setCollection('tasks', tasks);

  // Upcoming events — every active member, sent one-at-a-time so no
  // recipient sees anyone else's email address in the To: header.
  for (const e of events) {
    const evDate = easternDateOnly(e.start);
    if (evDate !== today && evDate !== tomorrow) continue;
    const when = evDate === today ? 'today' : 'tomorrow';
    eventReminders++;
    const html = eventReminderEmailHtml(e, when);
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
