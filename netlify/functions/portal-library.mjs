import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { parseDat } from './_lib/parseDat.mjs';
import { SEED_DAT_TEXT } from './_lib/librarySeed.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { hasPermission } from './_lib/permissions.mjs';

// One-time backfill: sets archived before folders existed all land in
// "25-26" so nothing is left unsorted going forward.
async function loadLibrary() {
  const lib = await getCollection('library', null);
  if (!lib) {
    const seeded = parseDat(SEED_DAT_TEXT);
    await setCollection('library', seeded);
    return seeded;
  }
  if (!lib._archiveFolderMigrated) {
    for (const sess of lib.sessions) {
      if (sess.archived && !sess.archiveFolder) sess.archiveFolder = '25-26';
    }
    lib._archiveFolderMigrated = true;
    await setCollection('library', lib);
  }
  if (!lib.archiveFolders) {
    lib.archiveFolders = [...new Set(lib.sessions.filter(s => s.archiveFolder).map(s => s.archiveFolder))];
    await setCollection('library', lib);
  }
  return lib;
}

async function canManageLibrary(req) {
  const token = getSessionUser(req);
  if (!token) return false;
  const members = await loadMembers();
  const m = members.find(x => x.id === token.id && x.hasAccount && x.active !== false);
  return m ? await hasPermission(m.role, 'library') : false;
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const lib = await loadLibrary();
    // Whether to include archived sets is driven by which VIEW is being
    // requested (?admin=1, sent only by the portal's own management tab),
    // not just whether the requester happens to be signed in — otherwise an
    // E-Board member browsing the public library page in the same browser
    // would see archived sets too, since their session cookie goes along
    // with that request regardless of which page it came from.
    const wantsAdmin = new URL(req.url).searchParams.get('admin') === '1';
    const authed = wantsAdmin && await canManageLibrary(req);
    // Archived sets are an E-Board-only organizational view — the public
    // library only ever offers the current (non-archived) sets.
    const sessions = authed ? lib.sessions : lib.sessions.filter(s => !s.archived);
    return json({ ok: true, scores: lib.scores, sessions, archiveFolders: authed ? lib.archiveFolders : [] });
  }

  const auth = await requireAuth(req, { perm: 'library' });
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
      arranger_first: s.arranger_first || '', arranger_last: s.arranger_last || '',
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
      arranger_first: s.arranger_first || '', arranger_last: s.arranger_last || '',
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
    lib.sessions.unshift({ num, name, scoreUrls: [], archived: false, archivedAt: null, archiveFolder: null });
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'setSessionArchived') {
    const sess = lib.sessions.find(s => s.num === body.num);
    if (!sess) return json({ ok: false, error: 'Set not found.' }, 404);
    sess.archived = !!body.archived;
    sess.archivedAt = sess.archived ? new Date().toISOString() : null;
    if (sess.archived) {
      const folder = String(body.folder || '').trim();
      if (!folder) return json({ ok: false, error: 'Choose or create a folder to archive into.' }, 400);
      sess.archiveFolder = folder;
      if (!lib.archiveFolders.includes(folder)) lib.archiveFolders.push(folder);
    } else {
      sess.archiveFolder = null;
    }
    await setCollection('library', lib);
    return json({ ok: true, ...lib });
  }

  if (op === 'createArchiveFolder') {
    const name = String(body.name || '').trim();
    if (!name) return json({ ok: false, error: 'A folder name is required.' }, 400);
    if (lib.archiveFolders.some(f => f.toLowerCase() === name.toLowerCase())) {
      return json({ ok: false, error: 'A folder with that name already exists.' }, 409);
    }
    lib.archiveFolders.push(name);
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
