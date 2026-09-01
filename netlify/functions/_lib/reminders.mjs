// Daily reminder sweep: task deadlines (due today/tomorrow) and upcoming
// events (today = morning-of, tomorrow = heads-up). Runs once a day via the
// scheduled function, or on demand via the manual trigger.
import { getCollection } from './blobs.mjs';
import { loadMembers } from './loadMembers.mjs';
import { sendEmail, emailLayout, escapeHtml, ctaButton, emailPhoto } from './email.mjs';

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
      <p>Reminder: your task <strong>"${escapeHtml(t.title)}"</strong> is due <strong>${when}</strong> (${escapeHtml(t.dueDate)}).</p>
      ${t.description ? `<p style="color:#444">${escapeHtml(t.description)}</p>` : ''}
      ${ctaButton('https://rowanacda.org/portal.html', 'Open the E-Board Portal')}
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
      <p>${when === 'today' ? 'You have an event today:' : 'You have an event coming up tomorrow:'}</p>
      <h2 style="margin:.5rem 0;color:#7A0A0A">${escapeHtml(e.title)}</h2>
      ${emailPhoto(e.imageUrl, e.title)}
      ${e.description ? `<p>${escapeHtml(e.description)}</p>` : ''}
      <p style="margin-top:1rem"><strong>${escapeHtml(new Date(e.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))}</strong>${e.location ? '<br>' + escapeHtml(e.location) : ''}</p>
      ${ctaButton('https://rowanacda.org/events.html', 'See Event Details')}
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
