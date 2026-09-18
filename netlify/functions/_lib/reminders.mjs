// Daily reminder sweep: task deadlines (due today/tomorrow), upcoming
// events (today = morning-of, tomorrow = heads-up), volunteer signups
// (morning-of only — the night-before pass lives in
// reminders-scheduled-evening.mjs, run separately in the evening), and —
// Sundays only — a weekly task overview to every E-Board account. Runs
// once a day via the scheduled function, or on demand via the manual
// "Send Reminders Now" trigger. The per-task/per-event manual "Send
// Reminder" buttons reuse the same email templates
// (taskReminderEmailHtml/eventReminderEmailHtml) with generic wording
// since they can fire on any day, not just today/tomorrow.
//
// Resend's plan caps this account at 100 emails/day, so sends are split
// into two priority tiers and the first is fully awaited before the
// second starts: "today" reminders (task/event/volunteer — someone needs
// this information right now) go out first, then "tomorrow" heads-ups and
// the weekly digest (both easy to live without if the day's quota runs
// out). Non-volunteer events already blast every active member, which is
// by far the biggest quota cost — Volunteer-tagged events are excluded
// from that blast entirely and instead only email the people who actually
// signed up (see runVolunteerReminders), since "you have an event today"
// isn't useful to someone with no stake in a bake sale.
import { getCollection, setCollection } from './blobs.mjs';
import { loadMembers } from './loadMembers.mjs';
import { sendEmailBatch, emailLayout, escapeHtml, ctaButton, emailPhoto, priorityBadge, memberEmails } from './email.mjs';
import { easternDateOnly, mdySlash } from './dateFmt.mjs';

function addDays(base, n) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d; }

// `specs` is an array of { to, subject, html } — not yet-invoked sendEmail
// calls — so sendEmailBatch can throttle them to stay under Resend's
// 10-requests/second cap instead of firing them all at once.
async function settleAndSummarize(specs) {
  const results = await sendEmailBatch(specs);
  const errors = results
    .map(r => r.status === 'rejected' ? (r.reason?.message || String(r.reason)) : (r.value?.ok === false ? r.value.error : null))
    .filter(Boolean);
  return { sent: specs.length, failed: errors.length, errors };
}

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
  let dueBit = '';
  if (task.dueDate) {
    const dueStr = mdySlash(task.dueDate);
    if (when === 'today') dueBit = ` due <strong>TODAY ${escapeHtml(dueStr)}</strong>`;
    else if (when === 'tomorrow') dueBit = ` due <strong>TOMORROW ${escapeHtml(dueStr)}</strong>`;
    else dueBit = ` (due ${escapeHtml(dueStr)})`;
  }
  return emailLayout(`
    <p>Reminder: <strong>"${escapeHtml(task.title)}"</strong>${dueBit}. ${priorityBadge(task.priority)}</p>
    ${task.description ? `<p style="color:#444">${escapeHtml(task.description)}</p>` : ''}
    ${ctaButton('https://rowanacda.org/portal.html', 'Open the E-Board Portal')}
  `);
}

export function weeklyDigestEmailHtml(tasks) {
  const rows = tasks.map(t => `
    <li style="margin-bottom:.5rem">
      <strong>${escapeHtml(t.title)}</strong> — ${escapeHtml(t.assignedToName)} · due ${escapeHtml(mdySlash(t.dueDate))} ${priorityBadge(t.priority)}
    </li>`).join('');
  return emailLayout(`
    <p>Here's what's due this week:</p>
    <ul style="padding-left:1.1rem;margin:.5rem 0 0">${rows || '<li>Nothing due this week — nice and clear!</li>'}</ul>
    ${ctaButton('https://rowanacda.org/portal.html', 'Open the E-Board Portal')}
  `);
}

export function eventReminderEmailHtml(event, when) {
  const introLine = when === 'today' ? 'You have an event today:' : when === 'tomorrow' ? 'You have an event coming up tomorrow:' : 'Reminder about an upcoming event:';
  const whenStr = event.allDay
    ? new Date(event.start).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }) + ' • All Day'
    : new Date(event.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET';
  return emailLayout(`
    <p>${introLine}</p>
    <h2 style="margin:.5rem 0;color:#7A0A0A">${escapeHtml(event.title)}</h2>
    ${emailPhoto(event.imageUrl, event.title)}
    ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
    <p style="margin-top:1rem"><strong>${escapeHtml(whenStr)}</strong>${event.location ? '<br>' + escapeHtml(event.location) : ''}</p>
    ${ctaButton('https://rowanacda.org/events.html', 'See Event Details')}
  `);
}

// `entries` is every active points entry a person has for this one event —
// a slots entry (source: 'volunteer') and a food entry (source:
// 'volunteer-food') are kept as separate points requests, but still
// described together in a single reminder email since it's the same
// person's one signup for the same event.
function describeVolunteerSignupHtml(entries) {
  const parts = [];
  for (const entry of entries) {
    if (entry.source === 'volunteer-full') { parts.push('<li>Signed up for the full day</li>'); continue; }
    if (entry.source === 'volunteer' && (entry.slotLabels || []).length) {
      parts.push(`<li>Time slot${entry.slotLabels.length !== 1 ? 's' : ''}: ${entry.slotLabels.map(escapeHtml).join(', ')}</li>`);
    }
    if (entry.source === 'volunteer-food' && entry.itemCount > 0) {
      parts.push(`<li>Bringing ${entry.itemCount} item${entry.itemCount !== 1 ? 's' : ''}: ${escapeHtml(entry.items || '')}</li>`);
    }
  }
  return parts.join('') || '<li>Signed up</li>';
}

// `entries` is every active points entry this person has for this event
// (a slots entry and/or a food entry and/or a full-day entry) — described
// together in one email since it's all one signup from the recipient's
// point of view, even though they're separate points requests internally.
export function volunteerReminderEmailHtml(event, entries, when) {
  const introLine = when === 'today' ? "You're volunteering today:" : "You're volunteering tomorrow:";
  const whenStr = new Date(event.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  const hasFood = entries.some(e => e.source === 'volunteer-food' && e.itemCount > 0);
  const itemNote = event.volunteerType === 'bake_sale' && hasFood
    ? '<p style="color:#444">Remember: items need to be there before the sale starts.</p>' : '';
  return emailLayout(`
    <p>${introLine}</p>
    <h2 style="margin:.5rem 0;color:#7A0A0A">${escapeHtml(event.title)}</h2>
    ${emailPhoto(event.imageUrl, event.title)}
    <p style="margin-top:.5rem"><strong>${escapeHtml(whenStr)} ET</strong>${event.location ? '<br>' + escapeHtml(event.location) : ''}</p>
    <p style="margin-top:1rem">Here's what you signed up for:</p>
    <ul style="padding-left:1.1rem;margin:.3rem 0 0">${describeVolunteerSignupHtml(entries)}</ul>
    ${itemNote}
    ${ctaButton('https://rowanacda.org/events.html', 'See Event Details')}
  `);
}

// Immediate confirmation on signing up for a time slot (not sent for a
// food/item-only signup — there's no specific time to confirm or add to a
// calendar in that case).
export function volunteerConfirmationEmailHtml(event, slotLabel, calendarUrl) {
  return emailLayout(`
    <p>You're signed up to volunteer!</p>
    <h2 style="margin:.5rem 0;color:#7A0A0A">${escapeHtml(event.title)}</h2>
    ${emailPhoto(event.imageUrl, event.title)}
    <p style="margin-top:.5rem"><strong>Your slot: ${escapeHtml(slotLabel)}</strong>${event.location ? '<br>' + escapeHtml(event.location) : ''}</p>
    ${ctaButton(calendarUrl, 'Add to Calendar')}
    <p style="margin-top:1rem;color:#444">You'll get a reminder the night before and the morning of.</p>
  `);
}

// Emails everyone with an active (non-denied) volunteer signup — slot(s),
// items, or full-day — for a Volunteer-tagged event happening "today" or
// "tomorrow" (Eastern calendar date), one consolidated email per person
// describing everything on that signup. Used for the morning-of pass
// (folded into runDailyReminders) and the night-before pass (its own
// scheduled function, reminders-scheduled-evening.mjs).
export async function runVolunteerReminders(when) {
  const now = new Date();
  const targetDate = when === 'today' ? easternDateOnly(now) : easternDateOnly(addDays(now, 1));
  const [events, points, members] = await Promise.all([
    getCollection('events', []), getCollection('points', []), loadMembers(),
  ]);
  const membersById = new Map(members.map(m => [m.id, m]));
  const volunteerEvents = events.filter(e => (e.tags || []).includes('Volunteer') && easternDateOnly(e.start) === targetDate);

  const jobs = [];
  let volunteerReminders = 0;
  for (const event of volunteerEvents) {
    const entries = points.filter(p => p.eventId === event.id && p.status !== 'denied' &&
      (p.source === 'volunteer' || p.source === 'volunteer-food' || p.source === 'volunteer-full'));
    const byMember = new Map();
    for (const entry of entries) {
      if (!byMember.has(entry.memberId)) byMember.set(entry.memberId, []);
      byMember.get(entry.memberId).push(entry);
    }
    for (const [memberId, memberEntries] of byMember) {
      const emails = memberEmails(membersById.get(memberId));
      const to = emails.length ? emails : (memberEntries[0].memberEmail ? [memberEntries[0].memberEmail] : []);
      if (!to.length) continue;
      volunteerReminders++;
      const html = volunteerReminderEmailHtml(event, memberEntries, when);
      jobs.push({ to, subject: `${when === 'today' ? 'Today' : 'Tomorrow'}: volunteering at ${event.title}`, html });
    }
  }
  const { failed } = await settleAndSummarize(jobs);
  return { volunteerReminders, emailsSent: jobs.length, emailsFailed: failed };
}

// `types`, if given, scopes a manual resend to just one category (e.g. only
// re-firing "events" after task reminders already went out fine) instead of
// re-running the whole sweep and duplicating emails that already succeeded.
// Omitted (or empty) runs everything, same as the automated scheduled run.
export async function runDailyReminders({ types } = {}) {
  const only = types && types.length ? new Set(types) : null;
  const includeTasks = !only || only.has('tasks');
  const includeEvents = !only || only.has('events');
  const includeVolunteer = !only || only.has('volunteer');
  const includeDigest = !only || only.has('digest');

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

  // Split into two priority tiers so a quota cutoff hits the least
  // time-sensitive emails first: "today" reminders are fully sent before
  // any "tomorrow" heads-up or the weekly digest is even attempted.
  const todayJobs = [];
  const laterJobs = [];
  let taskReminders = 0, eventReminders = 0;
  let tasksChanged = false;

  // Task deadlines — the assignee and anyone tagged on it, due today or tomorrow.
  for (const t of includeTasks ? tasks : []) {
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
      (when === 'today' ? todayJobs : laterJobs).push({ to: emails, subject: `Task due ${when}: ${t.title}`, html });
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
  // Volunteer-tagged events are skipped here entirely: they get their own
  // targeted reminder (runVolunteerReminders) to just the people who
  // signed up, not a blast to everyone regardless of relevance.
  for (const e of includeEvents ? events : []) {
    if ((e.tags || []).includes('Volunteer')) continue;
    const evDate = easternDateOnly(e.start);
    if (evDate !== today && evDate !== tomorrow) continue;
    const when = evDate === today ? 'today' : 'tomorrow';
    eventReminders++;
    const html = eventReminderEmailHtml(e, when);
    for (const email of activeEmails) {
      (when === 'today' ? todayJobs : laterJobs).push({ to: email, subject: `${when === 'today' ? 'Today' : 'Tomorrow'}: ${e.title}`, html });
    }
  }

  // Weekly task overview — every Sunday, one email per E-Board account
  // listing everything due Sun-Sat that week (not just today/tomorrow).
  // Lowest priority of everything sent here — a week's notice tolerates
  // being a day late far better than a same-day reminder does.
  let weeklyDigestSent = 0;
  const isSunday = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) === 'Sun';
  if (isSunday && includeDigest) {
    const weekEnd = easternDateOnly(addDays(now, 6));
    const dueThisWeek = tasks
      .filter(t => t.status === 'open' && t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const digestHtml = weeklyDigestEmailHtml(dueThisWeek);
    const eboardAccounts = members.filter(m => m.hasAccount && m.active !== false && m.role !== 'member');
    for (const m of eboardAccounts) {
      const emails = memberEmails(m);
      if (!emails.length) continue;
      weeklyDigestSent++;
      laterJobs.push({ to: emails, subject: `Weekly Task Overview — week of ${today}`, html: digestHtml });
    }
  }

  // Today's volunteer signups (morning-of) are the single highest
  // priority — sent before touching todayJobs even, since "you're
  // volunteering today" is more time-critical than a task due today.
  const volunteerResult = includeVolunteer
    ? await runVolunteerReminders('today')
    : { volunteerReminders: 0, emailsSent: 0, emailsFailed: 0 };
  const todaySummary = await settleAndSummarize(todayJobs);
  const laterSummary = await settleAndSummarize(laterJobs);

  const errors = [...todaySummary.errors, ...laterSummary.errors];
  return {
    taskReminders, eventReminders, volunteerReminders: volunteerResult.volunteerReminders,
    weeklyDigestSent,
    emailsSent: volunteerResult.emailsSent + todaySummary.sent + laterSummary.sent,
    emailsFailed: volunteerResult.emailsFailed + todaySummary.failed + laterSummary.failed,
    sampleErrors: [...new Set(errors)].slice(0, 3),
  };
}
