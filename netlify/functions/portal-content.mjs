import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { CONTENT_SEED } from './_lib/contentSeed.mjs';

async function loadContent() {
  const content = await getCollection('content', null);
  if (content) return content;
  await setCollection('content', CONTENT_SEED);
  return CONTENT_SEED;
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const content = await loadContent();
    return json({ ok: true, ...content });
  }

  const auth = await requireAuth(req, { perm: 'content' });
  if (auth.deny) return auth.deny;

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { op } = body;
  const content = await loadContent();

  if (op === 'addEboard') {
    const m = body.member || {};
    if (!m.name || !m.role) return json({ ok: false, error: 'Name and role are required.' }, 400);
    content.eboard.push({
      id: randomUUID(), name: m.name, role: m.role, email: m.email || '',
      photo: m.photo || '', desc: m.desc || '', bio: m.bio || '',
    });
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'updateEboard') {
    const target = content.eboard.find(x => x.id === body.id);
    if (!target) return json({ ok: false, error: 'Person not found.' }, 404);
    const m = body.member || {};
    if (!m.name || !m.role) return json({ ok: false, error: 'Name and role are required.' }, 400);
    Object.assign(target, { name: m.name, role: m.role, email: m.email || '', photo: m.photo || '', desc: m.desc || '', bio: m.bio || '' });
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'deleteEboard') {
    if (!content.eboard.some(x => x.id === body.id)) return json({ ok: false, error: 'Person not found.' }, 404);
    content.eboard = content.eboard.filter(x => x.id !== body.id);
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'reorderEboard') {
    const byId = new Map(content.eboard.map(x => [x.id, x]));
    const reordered = (body.ids || []).map(id => byId.get(id)).filter(Boolean);
    for (const x of content.eboard) if (!body.ids.includes(x.id)) reordered.push(x);
    content.eboard = reordered;
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  return json({ ok: false, error: 'Unknown operation.' }, 400);
}
