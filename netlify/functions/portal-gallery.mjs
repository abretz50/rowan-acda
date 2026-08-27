import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

export default async function handler(req) {
  const gallery = await getCollection('gallery', []);

  if (req.method === 'GET') {
    return json({ ok: true, gallery: [...gallery].sort((a, b) => a.order - b.order) });
  }

  const auth = await requireAuth(req, { perm: 'gallery' });
  if (auth.deny) return auth.deny;

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    if (body.op === 'reorder') {
      const byId = new Map(gallery.map(g => [g.id, g]));
      (body.ids || []).forEach((id, i) => { const g = byId.get(id); if (g) g.order = i; });
      await setCollection('gallery', gallery);
      return json({ ok: true, gallery });
    }
    const { url, caption } = body;
    if (!url) return json({ ok: false, error: 'Image URL is required.' }, 400);
    const item = {
      id: randomUUID(), url, caption: caption || '',
      inSlideshow: false, order: gallery.length,
    };
    gallery.push(item);
    await setCollection('gallery', gallery);
    return json({ ok: true, item });
  }

  if (req.method === 'PATCH') {
    const target = gallery.find(g => g.id === body.id);
    if (!target) return json({ ok: false, error: 'Image not found.' }, 404);
    if ('caption' in body) target.caption = body.caption;
    if ('inSlideshow' in body) target.inSlideshow = !!body.inSlideshow;
    await setCollection('gallery', gallery);
    return json({ ok: true, item: target });
  }

  if (req.method === 'DELETE') {
    if (!gallery.some(g => g.id === body.id)) return json({ ok: false, error: 'Image not found.' }, 404);
    await setCollection('gallery', gallery.filter(g => g.id !== body.id));
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
