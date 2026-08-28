import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { GALLERY_SEED_URLS } from './_lib/gallerySeed.mjs';

// If nothing's been uploaded/curated yet, seed from the photos already live
// on the homepage slideshow — same auto-migrate pattern as events/library/
// content, so the tab shows real photos instead of starting empty.
async function loadGallery() {
  const gallery = await getCollection('gallery', []);
  if (gallery.length > 0) return gallery;
  const seeded = GALLERY_SEED_URLS.map((url, i) => ({
    id: randomUUID(), url, caption: '', inSlideshow: true, order: i,
  }));
  await setCollection('gallery', seeded);
  return seeded;
}

export default async function handler(req) {
  const gallery = await loadGallery();

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
