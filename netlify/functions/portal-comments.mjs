import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

// Comments on public events — anyone can read them (they're public content,
// same as the event itself), but posting requires a signed-in account so
// they're tied to a real name, not anonymous. With no eventId, this becomes
// a "recent comments across every event" feed for E-Board review, which is
// itself restricted to E-Board accounts.
export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const eventId = url.searchParams.get('eventId');
    const comments = await getCollection('eventComments', []);
    if (eventId) {
      return json({ ok: true, comments: comments.filter(c => c.eventId === eventId) });
    }
    const auth = await requireAuth(req);
    if (auth.deny) return auth.deny;
    if (auth.user.role === 'member') return json({ ok: false, error: 'Not authorized.' }, 403);
    const events = await getCollection('events', []);
    const titleById = new Map(events.map(e => [e.id, e.title]));
    const recent = comments.slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
      .map(c => ({ ...c, eventTitle: titleById.get(c.eventId) || 'Unknown event' }));
    return json({ ok: true, comments: recent });
  }

  if (req.method === 'POST') {
    const auth = await requireAuth(req);
    if (auth.deny) return auth.deny;
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
    const { eventId, text } = body;
    if (!eventId || !text || !text.trim()) return json({ ok: false, error: 'eventId and text are required.' }, 400);
    const comments = await getCollection('eventComments', []);
    const comment = {
      id: randomUUID(), eventId, memberId: auth.user.id, memberName: auth.user.name,
      text: text.trim().slice(0, 1000), createdAt: new Date().toISOString(),
    };
    comments.push(comment);
    await setCollection('eventComments', comments);
    return json({ ok: true, comment });
  }

  if (req.method === 'DELETE') {
    const auth = await requireAuth(req);
    if (auth.deny) return auth.deny;
    const body = Object.fromEntries(url.searchParams);
    const comments = await getCollection('eventComments', []);
    const target = comments.find(c => c.id === body.id);
    if (!target) return json({ ok: false, error: 'Comment not found.' }, 404);
    // The author can remove their own comment; any E-Board account can
    // moderate anyone else's.
    if (target.memberId !== auth.user.id && auth.user.role === 'member') {
      return json({ ok: false, error: 'Not authorized.' }, 403);
    }
    await setCollection('eventComments', comments.filter(c => c.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
