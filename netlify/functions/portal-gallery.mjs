import { randomUUID } from 'node:crypto';
import { getCollection, updateCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { hasPermission } from './_lib/permissions.mjs';
import { GALLERY_SEED_URLS } from './_lib/gallerySeed.mjs';

// Google-Drive-style folder tree: { folders: [{id,name,parentId,liveTarget?,note?}],
// images: [{id,url,caption,folderId,order}] }. `folderId: null` means "top level".
// Every folder with a `liveTarget` feeds something live on the public site:
// 'homeSlideshow' uses every image in the folder (in order); every other
// liveTarget uses just the lowest-order image in that folder as "the" live
// photo for that spot, so dropping a new one in front of it swaps it out.
const NAME_TO_LIVE_TARGET = {
  'Home Page Banner': 'homeBanner',
  'Choral Engagement Photo': 'choralEngagement',
  'Sight Reading Photo': 'sightReading',
  'Development Photo': 'development',
  'Events Banner': 'eventsBanner',
  'Member Banner': 'membersBanner',
  'Join Rowan ACDA Picture': 'joinPicture',
  'Perks Picture': 'perksPicture',
  'Quick Links Picture': 'quickLinksPicture',
  'E-Board Banner Photo': 'eboardBanner',
  'Resource Banner': 'resourcesBanner',
  'Logo': 'logo',
};

function buildDefaultGalleryTree() {
  const folders = [];
  const images = [];
  let order = 0;
  const addFolder = (name, parentId, liveTarget) => {
    const id = randomUUID();
    const f = { id, name, parentId };
    if (liveTarget) f.liveTarget = liveTarget;
    folders.push(f);
    return id;
  };
  const addImage = (url, folderId) => {
    images.push({ id: randomUUID(), url, caption: '', folderId, order: order++ });
  };

  const websiteData = addFolder('Website Data', null);

  const homePage = addFolder('Home Page', websiteData);
  const chapterHighlights = addFolder('Chapter Highlights Slideshow', homePage, 'homeSlideshow');
  GALLERY_SEED_URLS.forEach(url => addImage(url, chapterHighlights));
  addImage('/assets/img/index-header.jpg', addFolder('Home Page Banner', homePage, 'homeBanner'));
  addImage('/assets/img/choral-engagement.jpg', addFolder('Choral Engagement Photo', homePage, 'choralEngagement'));
  addImage('/assets/img/sightreading.jpg', addFolder('Sight Reading Photo', homePage, 'sightReading'));
  addImage('/assets/img/development.jpg', addFolder('Development Photo', homePage, 'development'));

  const events = addFolder('Events', websiteData);
  addImage('/assets/img/events-banner.png', addFolder('Events Banner', events, 'eventsBanner'));

  const membersPage = addFolder('Members Page', websiteData);
  addImage('/assets/img/members-banner.jpg', addFolder('Member Banner', membersPage, 'membersBanner'));
  addImage('/assets/img/53630626_10156972764351558_1406328161368539136_n.jpg', addFolder('Join Rowan ACDA Picture', membersPage, 'joinPicture'));
  addImage('/assets/img/ext_gallery4.png', addFolder('Perks Picture', membersPage, 'perksPicture'));
  addImage('/assets/img/88321339_1520072311502572_3698786862781956096_n.jpg', addFolder('Quick Links Picture', membersPage, 'quickLinksPicture'));
  const eboardFolderId = addFolder('E-Board', membersPage);
  folders.find(f => f.id === eboardFolderId).note = 'E-Board profile pictures are updated from the Site Content tab.';
  addImage('/assets/img/eboard-header.jpg', addFolder('E-Board Banner Photo', eboardFolderId, 'eboardBanner'));

  const resources = addFolder('Resources', websiteData);
  addImage('/assets/img/resources-banner.png', addFolder('Resource Banner', resources, 'resourcesBanner'));

  addImage('/assets/icons/logo2.png', addFolder('Logo', websiteData, 'logo'));

  return { folders, images };
}

// One-time backfill for a tree that was already seeded before liveTarget
// existed (it used a boolean `slideshowSource` and left every other special
// folder unmarked) — upgrades in place by matching on the folder names the
// seed always uses, without touching anything a person already renamed.
function upgradeLegacyLiveTargets(tree) {
  const alreadyUsed = new Set(tree.folders.filter(f => f.liveTarget).map(f => f.liveTarget));
  for (const f of tree.folders) {
    if (f.slideshowSource && !f.liveTarget) {
      f.liveTarget = 'homeSlideshow';
      delete f.slideshowSource;
      alreadyUsed.add('homeSlideshow');
    } else if (!f.liveTarget && NAME_TO_LIVE_TARGET[f.name] && !alreadyUsed.has(NAME_TO_LIVE_TARGET[f.name])) {
      f.liveTarget = NAME_TO_LIVE_TARGET[f.name];
      alreadyUsed.add(f.liveTarget);
    }
  }
}

// Migrates the old flat inSlideshow/order array (from before folders existed)
// into the new tree so nothing anyone already uploaded gets silently lost.
function migrateOldGallery(oldArray) {
  const tree = buildDefaultGalleryTree();
  const slideshowFolder = tree.folders.find(f => f.liveTarget === 'homeSlideshow');
  const seededUrls = new Set(tree.images.filter(i => i.folderId === slideshowFolder.id).map(i => i.url));
  let importedFolderId = null;
  const importedFolder = () => {
    if (!importedFolderId) {
      importedFolderId = randomUUID();
      tree.folders.push({ id: importedFolderId, name: 'Imported Photos', parentId: null });
    }
    return importedFolderId;
  };
  let order = tree.images.length;
  for (const old of oldArray.slice().sort((a, b) => a.order - b.order)) {
    if (old.inSlideshow && !seededUrls.has(old.url)) {
      tree.images.push({ id: randomUUID(), url: old.url, caption: old.caption || '', folderId: slideshowFolder.id, order: order++ });
      seededUrls.add(old.url);
    } else if (!old.inSlideshow) {
      tree.images.push({ id: randomUUID(), url: old.url, caption: old.caption || '', folderId: importedFolder(), order: order++ });
    }
  }
  return tree;
}

// Backfill a top-level "Gallery" folder holding a copy of every photo
// currently in the tree — one flat place to browse everything without
// digging through the Website Data structure. Marked `isMasterGallery` so
// this only ever gets created once, even if someone renames or empties it.
function ensureGalleryFolder(tree) {
  if (tree.folders.some(f => f.isMasterGallery)) return;
  const id = randomUUID();
  tree.folders.push({ id, name: 'Gallery', parentId: null, isMasterGallery: true });
  const snapshot = tree.images.slice();
  let order = Math.max(-1, ...tree.images.map(i => i.order), -1) + 1;
  for (const img of snapshot) {
    tree.images.push({ id: randomUUID(), url: img.url, caption: img.caption, folderId: id, order: order++ });
  }
}

// Pure: derives the fully-seeded/migrated tree from whatever's currently
// stored (or nothing), without writing anything. Safe to call repeatedly —
// used both for plain reads and inside updateCollection's retry loop.
function deriveTree(stored) {
  let tree;
  if (!stored) tree = buildDefaultGalleryTree();
  else if (Array.isArray(stored)) tree = migrateOldGallery(stored);
  else { tree = stored; upgradeLegacyLiveTargets(tree); }
  ensureGalleryFolder(tree);
  return tree;
}

// Reads don't need to go through the CAS-protected write path unless
// something actually needs seeding/migrating (the very first load, or an
// old shape) — that's rare, so the common case is a plain read with no
// write at all instead of an unconditional write on every single GET.
async function loadGalleryForRead() {
  const stored = await getCollection('gallery', null);
  if (stored && !Array.isArray(stored)) {
    const probe = deriveTree(JSON.parse(JSON.stringify(stored)));
    if (JSON.stringify(probe) === JSON.stringify(stored)) return probe;
  }
  return updateCollection('gallery', null, async (fresh) => deriveTree(fresh));
}

async function canManageGallery(req) {
  const token = getSessionUser(req);
  if (!token) return false;
  const members = await loadMembers();
  const m = members.find(x => x.id === token.id && x.hasAccount && x.active !== false);
  return m ? await hasPermission(m.role, 'gallery') : false;
}

function collectFolderAndDescendantIds(folders, rootId) {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const next = folders.filter(f => frontier.includes(f.parentId)).map(f => f.id);
    ids.push(...next);
    frontier = next;
  }
  return ids;
}

// Deep-clones a folder and everything inside it (subfolders + images) into
// a new destination. `liveTarget` is stripped from every clone — only the
// original should ever feed a live spot on the site, otherwise two folders
// could each claim the same target.
function deepCloneFolder(tree, sourceId, destParentId) {
  const orderedIds = collectFolderAndDescendantIds(tree.folders, sourceId); // root-first
  const idMap = new Map();
  for (const oldId of orderedIds) {
    const orig = tree.folders.find(f => f.id === oldId);
    const newId = randomUUID();
    idMap.set(oldId, newId);
    const clone = { ...orig, id: newId, parentId: oldId === sourceId ? destParentId : idMap.get(orig.parentId) };
    delete clone.liveTarget;
    delete clone.isMasterGallery;
    tree.folders.push(clone);
  }
  for (const oldId of orderedIds) {
    const newFolderId = idMap.get(oldId);
    tree.images.filter(i => i.folderId === oldId).forEach(img => {
      tree.images.push({ id: randomUUID(), url: img.url, caption: img.caption, folderId: newFolderId, order: img.order });
    });
  }
}

// Applies one mutating request to `tree` in place. Returns an error object
// ({ message, status }) if the op is invalid/not found; returns null on
// success. Must stay a pure function of (tree, method, body) — no requests,
// no randomness beyond randomUUID — since updateCollection may re-run it
// against a freshly re-read tree if a concurrent write is detected.
function applyGalleryOp(tree, method, body) {
  if (method === 'POST') {
    const { op } = body;

    if (op === 'createFolder') {
      const name = String(body.name || '').trim();
      if (!name) return { message: 'Folder name is required.', status: 400 };
      const parentId = body.parentId || null;
      if (parentId && !tree.folders.some(f => f.id === parentId)) return { message: 'Parent folder not found.', status: 404 };
      tree.folders.push({ id: randomUUID(), name, parentId });
      return null;
    }

    if (op === 'renameFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return { message: 'Folder not found.', status: 404 };
      const name = String(body.name || '').trim();
      if (!name) return { message: 'Folder name is required.', status: 400 };
      target.name = name;
      return null;
    }

    if (op === 'moveFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return { message: 'Folder not found.', status: 404 };
      const newParentId = body.parentId || null;
      if (newParentId) {
        if (!tree.folders.some(f => f.id === newParentId)) return { message: 'Destination folder not found.', status: 404 };
        const descendants = new Set(collectFolderAndDescendantIds(tree.folders, target.id));
        if (descendants.has(newParentId)) return { message: 'Cannot move a folder into its own subfolder.', status: 400 };
      }
      target.parentId = newParentId;
      return null;
    }

    if (op === 'copyFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return { message: 'Folder not found.', status: 404 };
      const destParentId = body.parentId || null;
      if (destParentId) {
        if (!tree.folders.some(f => f.id === destParentId)) return { message: 'Destination folder not found.', status: 404 };
        const descendants = new Set(collectFolderAndDescendantIds(tree.folders, target.id));
        if (descendants.has(destParentId)) return { message: 'Cannot copy a folder into its own subfolder.', status: 400 };
      }
      deepCloneFolder(tree, target.id, destParentId);
      return null;
    }

    if (op === 'deleteFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return { message: 'Folder not found.', status: 404 };
      const idsToDelete = new Set(collectFolderAndDescendantIds(tree.folders, target.id));
      if ([...idsToDelete].some(id => tree.folders.find(f => f.id === id)?.liveTarget)) {
        return { message: 'This folder feeds a live part of the site (or contains one that does) and cannot be deleted.', status: 400 };
      }
      tree.folders = tree.folders.filter(f => !idsToDelete.has(f.id));
      tree.images = tree.images.filter(i => !idsToDelete.has(i.folderId));
      return null;
    }

    if (op === 'addImage') {
      const url = String(body.url || '').trim();
      if (!url) return { message: 'Image URL is required.', status: 400 };
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return { message: 'Folder not found.', status: 404 };
      const maxOrder = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      tree.images.push({ id: randomUUID(), url, caption: String(body.caption || ''), folderId, order: maxOrder + 1 });
      return null;
    }

    if (op === 'copyImage') {
      const source = tree.images.find(i => i.id === body.id);
      if (!source) return { message: 'Image not found.', status: 404 };
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return { message: 'Folder not found.', status: 404 };
      const maxOrder = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      tree.images.push({ id: randomUUID(), url: source.url, caption: source.caption, folderId, order: maxOrder + 1 });
      return null;
    }

    if (op === 'moveImage') {
      const target = tree.images.find(i => i.id === body.id);
      if (!target) return { message: 'Image not found.', status: 404 };
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return { message: 'Folder not found.', status: 404 };
      const maxOrder = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      target.folderId = folderId;
      target.order = maxOrder + 1;
      return null;
    }

    if (op === 'bulkMoveImages' || op === 'bulkCopyImages') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return { message: 'Folder not found.', status: 404 };
      let order = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      for (const id of ids) {
        const source = tree.images.find(i => i.id === id);
        if (!source) continue;
        if (op === 'bulkCopyImages') {
          tree.images.push({ id: randomUUID(), url: source.url, caption: source.caption, folderId, order: ++order });
        } else {
          source.folderId = folderId;
          source.order = ++order;
        }
      }
      return null;
    }

    if (op === 'bulkDeleteImages') {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      tree.images = tree.images.filter(i => !ids.has(i.id));
      return null;
    }

    if (op === 'reorderImages') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const byId = new Map(tree.images.map(i => [i.id, i]));
      ids.forEach((id, i) => { const img = byId.get(id); if (img) img.order = i; });
      return null;
    }

    return { message: 'Unknown operation.', status: 400 };
  }

  if (method === 'PATCH') {
    const target = tree.images.find(i => i.id === body.id);
    if (!target) return { message: 'Image not found.', status: 404 };
    if ('caption' in body) target.caption = body.caption;
    return null;
  }

  if (method === 'DELETE') {
    if (!tree.images.some(i => i.id === body.id)) return { message: 'Image not found.', status: 404 };
    tree.images = tree.images.filter(i => i.id !== body.id);
    return null;
  }

  return { message: 'Method not allowed', status: 405 };
}

export default async function handler(req) {
  if (req.method === 'GET') {
    const tree = await loadGalleryForRead();
    const wantsAdmin = new URL(req.url).searchParams.get('admin') === '1';
    const authed = wantsAdmin && await canManageGallery(req);
    if (authed) return json({ ok: true, folders: tree.folders, images: tree.images });
    // Public view: the slideshow images (in order) plus one resolved URL per
    // other live target — everything else in the tree is E-Board-only.
    const slideshowFolder = tree.folders.find(f => f.liveTarget === 'homeSlideshow');
    const slideshow = slideshowFolder
      ? tree.images.filter(i => i.folderId === slideshowFolder.id).sort((a, b) => a.order - b.order).map(i => ({ url: i.url, caption: i.caption }))
      : [];
    const liveImages = {};
    for (const f of tree.folders) {
      if (!f.liveTarget || f.liveTarget === 'homeSlideshow') continue;
      const first = tree.images.filter(i => i.folderId === f.id).sort((a, b) => a.order - b.order)[0];
      if (first) liveImages[f.liveTarget] = first.url;
    }
    return json({ ok: true, slideshow, liveImages });
  }

  const auth = await requireAuth(req, { perm: 'gallery' });
  if (auth.deny) return auth.deny;

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  // Every mutation is applied inside updateCollection's retry loop, which
  // re-reads the freshest stored tree right before each write attempt and
  // retries applyGalleryOp against it if a concurrent request wrote first —
  // this is what actually fixes the "moving one photo un-moves another"
  // bug, not just a client-side workaround.
  let opError = null;
  const method = req.method;
  const finalTree = await updateCollection('gallery', null, async (stored) => {
    const tree = deriveTree(stored);
    opError = applyGalleryOp(tree, method, body);
    return tree;
  });

  if (opError) return json({ ok: false, error: opError.message }, opError.status);
  return json({ ok: true, folders: finalTree.folders, images: finalTree.images });
}
