import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';

const PRIORITIES = ['low', 'medium', 'high'];

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

  if (req.method === 'GET') {
    const members = await loadMembers();
    const assignableMembers = members
      .filter(m => m.hasAccount && m.active !== false && m.role !== 'member')
      .map(m => ({ id: m.id, name: m.name, role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json({ ok: true, tasks, assignableMembers });
  }

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    const { title, description, assignedToId, dueDate, priority } = body;
    if (!title || !assignedToId) return json({ ok: false, error: 'Title and an assignee are required.' }, 400);
    const members = await loadMembers();
    const assignee = members.find(m => m.id === assignedToId);
    if (!assignee) return json({ ok: false, error: 'Assignee not found.' }, 404);
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(), title, description: description || '',
      assignedToId: assignee.id, assignedToName: assignee.name, assignedToRole: assignee.role,
      assignedById: auth.user.id, assignedByName: auth.user.name,
      dueDate: dueDate || '', priority: PRIORITIES.includes(priority) ? priority : 'medium',
      status: 'open', createdAt: now, updatedAt: now,
    };
    tasks.push(task);
    await setCollection('tasks', tasks);
    return json({ ok: true, task });
  }

  if (req.method === 'PATCH') {
    const target = tasks.find(t => t.id === body.id);
    if (!target) return json({ ok: false, error: 'Task not found.' }, 404);
    for (const f of ['title', 'description', 'dueDate']) {
      if (f in body) target[f] = body[f];
    }
    if (body.priority && PRIORITIES.includes(body.priority)) target.priority = body.priority;
    if (body.status && ['open', 'done'].includes(body.status)) target.status = body.status;
    if (body.assignedToId) {
      const members = await loadMembers();
      const assignee = members.find(m => m.id === body.assignedToId);
      if (!assignee) return json({ ok: false, error: 'Assignee not found.' }, 404);
      target.assignedToId = assignee.id;
      target.assignedToName = assignee.name;
      target.assignedToRole = assignee.role;
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
