import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { CONTENT_SEED } from './_lib/contentSeed.mjs';

function migrateContent(content) {
  let changed = false;
  if (!content.siteText) { content.siteText = { ...CONTENT_SEED.siteText }; changed = true; }
  if (!content.resources) { content.resources = { pd: [], showAndTell: [] }; changed = true; }
  if (!content.merch) { content.merch = CONTENT_SEED.merch.map(m => ({ ...m })); changed = true; }
  return changed;
}

async function loadContent() {
  const content = await getCollection('content', null);
  if (!content) {
    await setCollection('content', CONTENT_SEED);
    return CONTENT_SEED;
  }
  if (migrateContent(content)) await setCollection('content', content);
  return content;
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

  if (op === 'updateSiteText') {
    const key = String(body.key || '');
    if (!key) return json({ ok: false, error: 'A text key is required.' }, 400);
    content.siteText[key] = String(body.value ?? '');
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'addResource') {
    const category = body.category === 'showAndTell' ? 'showAndTell' : body.category === 'pd' ? 'pd' : null;
    if (!category) return json({ ok: false, error: 'Unknown resource category.' }, 400);
    const title = String(body.title || '').trim();
    if (!title) return json({ ok: false, error: 'A title is required.' }, 400);
    content.resources[category].push({
      id: randomUUID(), title, url: String(body.url || '').trim(), note: String(body.note || '').trim(),
    });
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'updateResource') {
    const category = body.category === 'showAndTell' ? 'showAndTell' : body.category === 'pd' ? 'pd' : null;
    if (!category) return json({ ok: false, error: 'Unknown resource category.' }, 400);
    const target = content.resources[category].find(x => x.id === body.id);
    if (!target) return json({ ok: false, error: 'Resource not found.' }, 404);
    const title = String(body.title || '').trim();
    if (!title) return json({ ok: false, error: 'A title is required.' }, 400);
    Object.assign(target, { title, url: String(body.url || '').trim(), note: String(body.note || '').trim() });
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'deleteResource') {
    const category = body.category === 'showAndTell' ? 'showAndTell' : body.category === 'pd' ? 'pd' : null;
    if (!category) return json({ ok: false, error: 'Unknown resource category.' }, 400);
    if (!content.resources[category].some(x => x.id === body.id)) return json({ ok: false, error: 'Resource not found.' }, 404);
    content.resources[category] = content.resources[category].filter(x => x.id !== body.id);
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'addMerchItem') {
    const m = body.item || {};
    const name = String(m.name || '').trim();
    if (!name) return json({ ok: false, error: 'A name is required.' }, 400);
    const price = Number(m.price);
    if (!(price >= 0)) return json({ ok: false, error: 'A valid price is required.' }, 400);
    content.merch.push({
      id: randomUUID(), name, price,
      sizes: Array.isArray(m.sizes) ? m.sizes.filter(Boolean) : [],
      photos: Array.isArray(m.photos) ? m.photos.filter(Boolean).slice(0, 3) : [],
      active: m.active !== false,
    });
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'updateMerchItem') {
    const target = content.merch.find(x => x.id === body.id);
    if (!target) return json({ ok: false, error: 'Item not found.' }, 404);
    const m = body.item || {};
    const name = String(m.name || '').trim();
    if (!name) return json({ ok: false, error: 'A name is required.' }, 400);
    const price = Number(m.price);
    if (!(price >= 0)) return json({ ok: false, error: 'A valid price is required.' }, 400);
    Object.assign(target, {
      name, price,
      sizes: Array.isArray(m.sizes) ? m.sizes.filter(Boolean) : [],
      photos: Array.isArray(m.photos) ? m.photos.filter(Boolean).slice(0, 3) : [],
      active: m.active !== false,
    });
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  if (op === 'deleteMerchItem') {
    if (!content.merch.some(x => x.id === body.id)) return json({ ok: false, error: 'Item not found.' }, 404);
    content.merch = content.merch.filter(x => x.id !== body.id);
    await setCollection('content', content);
    return json({ ok: true, ...content });
  }

  return json({ ok: false, error: 'Unknown operation.' }, 400);
}
