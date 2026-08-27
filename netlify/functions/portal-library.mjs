import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';
import { parseDat } from './_lib/parseDat.mjs';
import { SEED_DAT_TEXT } from './_lib/librarySeed.mjs';

async function loadLibrary() {
  const lib = await getCollection('library', null);
  if (lib) return lib;
  const seeded = parseDat(SEED_DAT_TEXT);
  await setCollection('library', seeded);
  return seeded;
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const lib = await loadLibrary();
    return json({ ok: true, ...lib });
  }

  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const { op } = body;
  const lib = await loadLibrary();

  // ── Scores ────────────────────────────────────────────
  if (op === 'addScore') {
    const s = body.score || {};
    if (!s.title || !s.url) return json({ ok: false, error: 'Title and PDF URL are required.' }, 400);
    if (lib.scores.some(x => x.url === s.url)) return json({ ok: false, error: 'A score with that URL already exists.' }, 409);
    lib.scores.push({
      title: s.title, url: s.url,
      composer_first: s.composer_first || '', composer_last: s.composer_last || '',
      year: s.year || '', voicing: s.voicing || '', instrumentation: s.instrumentation || '',
      tags: Array.isArray(s.tags) ? s.tags : [],
    });
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'updateScore') {
    const target = lib.scores.find(x => x.url === body.oldUrl);
    if (!target) return json({ ok: false, error: 'Score not found.' }, 404);
    const s = body.score || {};
    if (!s.title || !s.url) return json({ ok: false, error: 'Title and PDF URL are required.' }, 400);
    Object.assign(target, {
      title: s.title, url: s.url,
      composer_first: s.composer_first || '', composer_last: s.composer_last || '',
      year: s.year || '', voicing: s.voicing || '', instrumentation: s.instrumentation || '',
      tags: Array.isArray(s.tags) ? s.tags : [],
    });
    if (body.oldUrl !== s.url) {
      lib.sessions.forEach(sess => {
        const i = sess.scoreUrls.indexOf(body.oldUrl);
        if (i > -1) sess.scoreUrls[i] = s.url;
      });
    }
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'deleteScore') {
    if (!lib.scores.some(x => x.url === body.url)) return json({ ok: false, error: 'Score not found.' }, 404);
    lib.scores = lib.scores.filter(x => x.url !== body.url);
    lib.sessions.forEach(sess => { sess.scoreUrls = sess.scoreUrls.filter(u => u !== body.url); });
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  // ── Sessions / sets ───────────────────────────────────
  if (op === 'addSession') {
    const { num, name } = body;
    if (!num || !name) return json({ ok: false, error: 'ID and name are required.' }, 400);
    if (lib.sessions.some(s => s.num === num)) return json({ ok: false, error: `${num} already exists.` }, 409);
    lib.sessions.unshift({ num, name, scoreUrls: [] });
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'updateSession') {
    const sess = lib.sessions.find(s => s.num === body.oldNum);
    if (!sess) return json({ ok: false, error: 'Set not found.' }, 404);
    if (!body.num || !body.name) return json({ ok: false, error: 'ID and name are required.' }, 400);
    sess.num = body.num; sess.name = body.name;
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'deleteSession') {
    if (!lib.sessions.some(s => s.num === body.num)) return json({ ok: false, error: 'Set not found.' }, 404);
    lib.sessions = lib.sessions.filter(s => s.num !== body.num);
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'setSessionScores') {
    const sess = lib.sessions.find(s => s.num === body.num);
    if (!sess) return json({ ok: false, error: 'Set not found.' }, 404);
    const valid = new Set(lib.scores.map(s => s.url));
    sess.scoreUrls = Array.isArray(body.urls) ? body.urls.filter(u => valid.has(u)) : [];
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'addToSet') {
    const sess = lib.sessions.find(s => s.num === body.num);
    if (!sess) return json({ ok: false, error: 'Set not found.' }, 404);
    if (!sess.scoreUrls.includes(body.url)) sess.scoreUrls.push(body.url);
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'removeFromSet') {
    const sess = lib.sessions.find(s => s.num === body.num);
    if (!sess) return json({ ok: false, error: 'Set not found.' }, 404);
    sess.scoreUrls = sess.scoreUrls.filter(u => u !== body.url);
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  return json({ ok: false, error: 'Unknown operation.' }, 400);
}
