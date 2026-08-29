import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, getSessionUser, json } from './_lib/auth.mjs';
import { loadMembers } from './_lib/loadMembers.mjs';
import { hasPermission } from './_lib/permissions.mjs';
import { GALLERY_SEED_URLS } from './_lib/gallerySeed.mjs';

// Google-Drive-style folder tree: { folders: [{id,name,parentId,slideshowSource?,note?}],
// images: [{id,url,caption,folderId,order}] }. `folderId: null` means "top level".
// The one folder flagged slideshowSource feeds the live homepage slideshow —
// everything else here is organizational only (dropping a new photo into any
// other folder doesn't change anything live on the site by itself).
function buildDefaultGalleryTree() {
  const folders = [];
  const images = [];
  let order = 0;
  const addFolder = (name, parentId, extra = {}) => {
    const id = randomUUID();
    folders.push({ id, name, parentId, ...extra });
    return id;
  };
  const addImage = (url, folderId) => {
    images.push({ id: randomUUID(), url, caption: '', folderId, order: order++ });
  };

  const websiteData = addFolder('Website Data', null);

  const homePage = addFolder('Home Page', websiteData);
  const chapterHighlights = addFolder('Chapter Highlights Slideshow', homePage, { slideshowSource: true });
  GALLERY_SEED_URLS.forEach(url => addImage(url, chapterHighlights));
  addImage('/assets/img/index-header.jpg', addFolder('Home Page Banner', homePage));
  addImage('/assets/img/choral-engagement.jpg', addFolder('Choral Engagement Photo', homePage));
  addImage('/assets/img/sightreading.jpg', addFolder('Sight Reading Photo', homePage));
  addImage('/assets/img/development.jpg', addFolder('Development Photo', homePage));

  const events = addFolder('Events', websiteData);
  addImage('/assets/img/events-banner.png', addFolder('Events Banner', events));

  const membersPage = addFolder('Members Page', websiteData);
  addImage('/assets/img/members-banner.jpg', addFolder('Member Banner', membersPage));
  addImage('/assets/img/53630626_10156972764351558_1406328161368539136_n.jpg', addFolder('Join Rowan ACDA Picture', membersPage));
  addImage('/assets/img/ext_gallery4.png', addFolder('Perks Picture', membersPage));
  addImage('/assets/img/88321339_1520072311502572_3698786862781956096_n.jpg', addFolder('Quick Links Picture', membersPage));
  const eboardFolder = addFolder('E-Board', membersPage, { note: 'E-Board profile pictures are updated from the Site Content tab.' });
  addImage('/assets/img/eboard-header.jpg', addFolder('E-Board Banner Photo', eboardFolder));

  const resources = addFolder('Resources', websiteData);
  addImage('/assets/img/resources-banner.png', addFolder('Resource Banner', resources));

  addImage('/assets/icons/logo2.png', addFolder('Logo', websiteData));

  return { folders, images };
}

// Migrates the old flat inSlideshow/order array (from before folders existed)
// into the new tree so nothing anyone already uploaded gets silently lost.
function migrateOldGallery(oldArray) {
  const tree = buildDefaultGalleryTree();
  const slideshowFolder = tree.folders.find(f => f.slideshowSource);
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

async function loadGallery() {
  const stored = await getCollection('gallery', null);
  if (!stored) {
    const tree = buildDefaultGalleryTree();
    await setCollection('gallery', tree);
    return tree;
  }
  if (Array.isArray(stored)) {
    const migrated = migrateOldGallery(stored);
    await setCollection('gallery', migrated);
    return migrated;
  }
  return stored;
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

export default async function handler(req) {
  const tree = await loadGallery();

  if (req.method === 'GET') {
    const wantsAdmin = new URL(req.url).searchParams.get('admin') === '1';
    const authed = wantsAdmin && await canManageGallery(req);
    if (authed) return json({ ok: true, folders: tree.folders, images: tree.images });
    // Public view: only the images in the folder that feeds the live
    // homepage slideshow — everything else here is E-Board-only.
    const slideshowFolder = tree.folders.find(f => f.slideshowSource);
    const slideshow = slideshowFolder
      ? tree.images.filter(i => i.folderId === slideshowFolder.id).sort((a, b) => a.order - b.order).map(i => ({ url: i.url, caption: i.caption }))
      : [];
    return json({ ok: true, slideshow });
  }

  const auth = await requireAuth(req, { perm: 'gallery' });
  if (auth.deny) return auth.deny;

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    const { op } = body;

    if (op === 'createFolder') {
      const name = String(body.name || '').trim();
      if (!name) return json({ ok: false, error: 'Folder name is required.' }, 400);
      const parentId = body.parentId || null;
      if (parentId && !tree.folders.some(f => f.id === parentId)) return json({ ok: false, error: 'Parent folder not found.' }, 404);
      tree.folders.push({ id: randomUUID(), name, parentId });
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'renameFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return json({ ok: false, error: 'Folder not found.' }, 404);
      const name = String(body.name || '').trim();
      if (!name) return json({ ok: false, error: 'Folder name is required.' }, 400);
      target.name = name;
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'moveFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return json({ ok: false, error: 'Folder not found.' }, 404);
      const newParentId = body.parentId || null;
      if (newParentId) {
        if (!tree.folders.some(f => f.id === newParentId)) return json({ ok: false, error: 'Destination folder not found.' }, 404);
        const descendants = new Set(collectFolderAndDescendantIds(tree.folders, target.id));
        if (descendants.has(newParentId)) return json({ ok: false, error: 'Cannot move a folder into its own subfolder.' }, 400);
      }
      target.parentId = newParentId;
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'deleteFolder') {
      const target = tree.folders.find(f => f.id === body.id);
      if (!target) return json({ ok: false, error: 'Folder not found.' }, 404);
      const idsToDelete = new Set(collectFolderAndDescendantIds(tree.folders, target.id));
      if ([...idsToDelete].some(id => tree.folders.find(f => f.id === id)?.slideshowSource)) {
        return json({ ok: false, error: 'This folder feeds the live homepage slideshow (or contains the one that does) and cannot be deleted.' }, 400);
      }
      tree.folders = tree.folders.filter(f => !idsToDelete.has(f.id));
      tree.images = tree.images.filter(i => !idsToDelete.has(i.folderId));
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'addImage') {
      const url = String(body.url || '').trim();
      if (!url) return json({ ok: false, error: 'Image URL is required.' }, 400);
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return json({ ok: false, error: 'Folder not found.' }, 404);
      const maxOrder = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      tree.images.push({ id: randomUUID(), url, caption: String(body.caption || ''), folderId, order: maxOrder + 1 });
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'copyImage') {
      const source = tree.images.find(i => i.id === body.id);
      if (!source) return json({ ok: false, error: 'Image not found.' }, 404);
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return json({ ok: false, error: 'Folder not found.' }, 404);
      const maxOrder = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      tree.images.push({ id: randomUUID(), url: source.url, caption: source.caption, folderId, order: maxOrder + 1 });
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'moveImage') {
      const target = tree.images.find(i => i.id === body.id);
      if (!target) return json({ ok: false, error: 'Image not found.' }, 404);
      const folderId = body.folderId || null;
      if (folderId && !tree.folders.some(f => f.id === folderId)) return json({ ok: false, error: 'Folder not found.' }, 404);
      const maxOrder = Math.max(-1, ...tree.images.filter(i => i.folderId === folderId).map(i => i.order));
      target.folderId = folderId;
      target.order = maxOrder + 1;
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    if (op === 'reorderImages') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const byId = new Map(tree.images.map(i => [i.id, i]));
      ids.forEach((id, i) => { const img = byId.get(id); if (img) img.order = i; });
      await setCollection('gallery', tree);
      return json({ ok: true, folders: tree.folders, images: tree.images });
    }

    return json({ ok: false, error: 'Unknown operation.' }, 400);
  }

  if (req.method === 'PATCH') {
    const target = tree.images.find(i => i.id === body.id);
    if (!target) return json({ ok: false, error: 'Image not found.' }, 404);
    if ('caption' in body) target.caption = body.caption;
    await setCollection('gallery', tree);
    return json({ ok: true, folders: tree.folders, images: tree.images });
  }

  if (req.method === 'DELETE') {
    if (!tree.images.some(i => i.id === body.id)) return json({ ok: false, error: 'Image not found.' }, 404);
    tree.images = tree.images.filter(i => i.id !== body.id);
    await setCollection('gallery', tree);
    return json({ ok: true, folders: tree.folders, images: tree.images });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
