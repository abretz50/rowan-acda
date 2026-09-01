import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { sendEmail, emailLayout, escapeHtml, ctaButton, priorityBadge } from './_lib/email.mjs';

const PRIORITIES = ['low', 'medium', 'high'];

function taskEmailHtml(task, actorName, verb) {
  const dueBit = task.dueDate ? `<p style="margin-top:1rem"><strong>Due:</strong> ${escapeHtml(task.dueDate)}</p>` : '';
  return emailLayout(`
    <p>${escapeHtml(actorName)} ${verb} <strong>"${escapeHtml(task.title)}"</strong>. ${priorityBadge(task.priority)}</p>
    ${task.description ? `<p style="color:#444">${escapeHtml(task.description)}</p>` : ''}
    ${dueBit}
    ${ctaButton('https://rowanacda.org/portal.html', 'Open the E-Board Portal')}
  `);
}

// Backfills a `history` log (created/completed/reopened entries) onto any
// task saved before this feature existed, so the Task History view has
// something to show for old tasks too. Who actually completed an
// already-done task was never recorded, so that entry's byName is left
// null — the UI shows it as "Unknown" rather than guessing.
function migrateTaskHistory(tasks) {
  let changed = false;
  for (const t of tasks) {
    if (t.history) continue;
    t.history = [{ event: 'created', byId: t.assignedById || null, byName: t.assignedByName || null, at: t.createdAt }];
    if (t.status === 'done') {
      t.history.push({ event: 'completed', byId: null, byName: null, at: t.updatedAt || t.createdAt, comment: '' });
    }
    changed = true;
  }
  return changed;
}

// Builds the denormalized `tags` array (id/name/role) for the optional
// "responsible but not the primary assignee" people on a task, the same way
// assignedTo is denormalized — so the client never has to look members up.
function buildTags(taggedIds, members) {
  if (!Array.isArray(taggedIds)) return [];
  return taggedIds
    .map(id => members.find(m => m.id === id))
    .filter(Boolean)
    .map(m => ({ id: m.id, name: m.name, role: m.role }));
}

// Tasks is a shared E-Board coordination tool, not gated by the adjustable
// permissions system — any signed-in account that isn't a plain club
// 'member' can see the board, assign a task to anyone else with portal
// access, and edit/close/delete any task. It's meant to be a low-friction
// shared list, not something that needs its own fine-grained ownership
// rules the way Points or Accounts do.
export default async function handler(req) {
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  if (auth.user.role === 'member') return json({ ok: false, error: 'Not authorized.' }, 403);

  const tasks = await getCollection('tasks', []);
  if (migrateTaskHistory(tasks)) await setCollection('tasks', tasks);

  if (req.method === 'GET') {
    const members = await loadMembers();
    // Joined live (not stored on the task) so an updated profile picture
    // shows up on old tasks too, instead of freezing whatever photo existed
    // when the task was created.
    const photoById = new Map(members.map(m => [m.id, m.photoUrl || null]));
    const tasksWithPhotos = tasks.map(t => ({
      ...t,
      assignedToPhotoUrl: photoById.get(t.assignedToId) || null,
      tags: (t.tags || []).map(x => ({ ...x, photoUrl: photoById.get(x.id) || null })),
    }));
    const assignableMembers = members
      .filter(m => m.hasAccount && m.active !== false && m.role !== 'member')
      .map(m => ({ id: m.id, name: m.name, role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json({ ok: true, tasks: tasksWithPhotos, assignableMembers });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    const { title, description, assignedToId, dueDate, priority, taggedIds } = body;
    if (!title || !assignedToId) return json({ ok: false, error: 'Title and an assignee are required.' }, 400);
    const members = await loadMembers();
    const assignee = members.find(m => m.id === assignedToId);
    if (!assignee) return json({ ok: false, error: 'Assignee not found.' }, 404);
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(), title, description: description || '',
      assignedToId: assignee.id, assignedToName: assignee.name, assignedToRole: assignee.role,
      assignedById: auth.user.id, assignedByName: auth.user.name,
      tags: buildTags(taggedIds, members).filter(t => t.id !== assignee.id),
      dueDate: dueDate || '', priority: PRIORITIES.includes(priority) ? priority : 'medium',
      status: 'open', createdAt: now, updatedAt: now,
      history: [{ event: 'created', byId: auth.user.id, byName: auth.user.name, at: now }],
    };
    tasks.push(task);
    await setCollection('tasks', tasks);

    const notifyJobs = [];
    if (assignee.email) {
      notifyJobs.push(sendEmail({ to: assignee.email, subject: `New task assigned: ${task.title}`, html: taskEmailHtml(task, auth.user.name, 'assigned you') }));
    }
    for (const tag of task.tags) {
      const m = members.find(x => x.id === tag.id);
      if (m?.email) {
        notifyJobs.push(sendEmail({ to: m.email, subject: `Tagged on a task: ${task.title}`, html: taskEmailHtml(task, auth.user.name, `tagged you on a task assigned to ${task.assignedToName}`) }));
      }
    }
    try { await Promise.allSettled(notifyJobs); } catch {}

    return json({ ok: true, task });
  }

  if (req.method === 'PATCH') {
    const target = tasks.find(t => t.id === body.id);
    if (!target) return json({ ok: false, error: 'Task not found.' }, 404);
    for (const f of ['title', 'description', 'dueDate']) {
      if (f in body) target[f] = body[f];
    }
    if (body.priority && PRIORITIES.includes(body.priority)) target.priority = body.priority;
    if (body.status && ['open', 'done'].includes(body.status) && body.status !== target.status) {
      const now = new Date().toISOString();
      if (body.status === 'done') {
        target.history.push({ event: 'completed', byId: auth.user.id, byName: auth.user.name, at: now, comment: String(body.completionComment || '').trim() });
      } else {
        target.history.push({ event: 'reopened', byId: auth.user.id, byName: auth.user.name, at: now });
      }
      target.status = body.status;
    }
    if (body.assignedToId || 'taggedIds' in body) {
      const members = await loadMembers();
      const oldAssigneeId = target.assignedToId;
      const oldTagIds = new Set((target.tags || []).map(x => x.id));
      if (body.assignedToId) {
        const assignee = members.find(m => m.id === body.assignedToId);
        if (!assignee) return json({ ok: false, error: 'Assignee not found.' }, 404);
        target.assignedToId = assignee.id;
        target.assignedToName = assignee.name;
        target.assignedToRole = assignee.role;
      }
      if ('taggedIds' in body) {
        target.tags = buildTags(body.taggedIds, members).filter(t => t.id !== target.assignedToId);
      }

      const notifyJobs = [];
      if (body.assignedToId && body.assignedToId !== oldAssigneeId) {
        const assignee = members.find(m => m.id === target.assignedToId);
        if (assignee?.email) {
          notifyJobs.push(sendEmail({ to: assignee.email, subject: `Task assigned: ${target.title}`, html: taskEmailHtml(target, auth.user.name, 'assigned you') }));
        }
      }
      for (const tag of target.tags.filter(t => !oldTagIds.has(t.id))) {
        const m = members.find(x => x.id === tag.id);
        if (m?.email) {
          notifyJobs.push(sendEmail({ to: m.email, subject: `Tagged on a task: ${target.title}`, html: taskEmailHtml(target, auth.user.name, `tagged you on a task assigned to ${target.assignedToName}`) }));
        }
      }
      try { await Promise.allSettled(notifyJobs); } catch {}
    }
    target.updatedAt = new Date().toISOString();
    await setCollection('tasks', tasks);
    return json({ ok: true, task: target });
  }

  if (req.method === 'DELETE') {
    if (!tasks.some(t => t.id === body.id)) return json({ ok: false, error: 'Task not found.' }, 404);
    await setCollection('tasks', tasks.filter(t => t.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
