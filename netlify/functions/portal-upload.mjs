// Commits an uploaded file to the repo via the GitHub Contents API — the
// same technique the retired Cloudflare Worker (worker/index.js) used for
// PDF uploads, just moved here so it shares the portal's session auth
// instead of needing its own separate secret/CORS setup.
import { requireAuth, json } from './_lib/auth.mjs';
import { hasPermission } from './_lib/permissions.mjs';
import { ghFetch, GH_BRANCH } from './_lib/github.mjs';

const CATEGORY_DIRS = {
  gallery: 'assets/img/gallery',
  eboard: 'assets/img/eboard',
  library: 'assets/pdfs/uploads',
  events: 'assets/img/events',
  profile: 'assets/img/profiles',
  merch: 'assets/img/merch',
};
const CATEGORY_ALLOWED_EXT = {
  gallery: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  eboard: ['.jpg', '.jpeg', '.png', '.webp'],
  library: ['.pdf'],
  events: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  profile: ['.jpg', '.jpeg', '.png', '.webp'],
  merch: ['.jpg', '.jpeg', '.png', '.webp'],
};
// `profile` has no entry here — hasPermission(role, undefined) just requires
// being signed in, which is right for uploading your own profile picture.
const CATEGORY_PERM = { gallery: 'gallery', eboard: 'content', library: 'library', events: 'events', merch: 'content' };

// Netlify Functions reject any request body over ~6MB before our code even
// runs (a bare, bodyless platform error — not something we can catch or put
// a nice message on). Stopping just under that, with a size-specific
// message, is the only way to turn "upload failed" into something a user
// can actually act on.
const MAX_FILE_BYTES = 6 * 1024 * 1024;

function extOf(name) {
  const m = /\.[a-z0-9]+$/i.exec(name || '');
  return m ? m[0].toLowerCase() : '';
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  if (!process.env.GITHUB_TOKEN) return json({ ok: false, error: 'Uploads are not configured (missing GITHUB_TOKEN).' }, 500);

  let formData;
  try { formData = await req.formData(); } catch (e) {
    return json({ ok: false, error: `Could not read the upload (${e.message || 'malformed request'}). Try again — if it keeps happening, the file may be too large or corrupted.` }, 400);
  }

  const file = formData.get('file');
  const category = formData.get('category');
  const dir = CATEGORY_DIRS[category];
  if (!file || !dir) return json({ ok: false, error: 'A file and a valid category are required.' }, 400);
  if (!(await hasPermission(auth.user.role, CATEGORY_PERM[category]))) {
    return json({ ok: false, error: 'Not authorized for that upload category.' }, 403);
  }

  if (!file.size) return json({ ok: false, error: 'That file appears to be empty (0 bytes) — try re-exporting or re-scanning it.' }, 400);
  if (file.size > MAX_FILE_BYTES) {
    return json({ ok: false, error: `That file is ${mb(file.size)}MB — uploads are limited to ${mb(MAX_FILE_BYTES)}MB. Try compressing the PDF (e.g. lowering scan resolution) or splitting it into smaller files.` }, 413);
  }

  const ext = extOf(file.name);
  if (!CATEGORY_ALLOWED_EXT[category].includes(ext)) {
    return json({ ok: false, error: `"${ext || '(no extension)'}" isn't allowed for ${category} uploads — allowed types: ${CATEGORY_ALLOWED_EXT[category].join(', ')}.` }, 400);
  }

  // Spaces, punctuation, and numbers in the original filename are all fine —
  // everything outside [a-zA-Z0-9._-] is swapped for an underscore below, so
  // "Summer Nights (Grease) #2.pdf" becomes a safe, unique GitHub path
  // rather than failing.
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `${dir}/${safeName}`;

  let base64;
  try {
    const bytes = await file.arrayBuffer();
    base64 = Buffer.from(bytes).toString('base64');
  } catch (e) {
    return json({ ok: false, error: `Could not read the file's contents (${e.message || 'unknown error'}). It may be corrupted — try re-exporting it and uploading again.` }, 400);
  }

  let putRes;
  try {
    putRes = await ghFetch(`contents/${path}`, 'PUT', {
      message: `Upload ${safeName} via E-Board Portal`,
      content: base64,
      branch: GH_BRANCH,
    });
  } catch (e) {
    return json({ ok: false, error: `Could not reach GitHub to save the file (${e.message || 'network error'}). Check your connection and try again.` }, 502);
  }
  if (!putRes.ok) {
    const bodyText = await putRes.text().catch(() => '');
    let parsed = null;
    try { parsed = JSON.parse(bodyText); } catch {}
    const detail = parsed?.message || bodyText || `GitHub error ${putRes.status}`;
    return json({ ok: false, error: `Upload failed: ${detail}` }, putRes.status >= 400 ? putRes.status : 500);
  }

  return json({ ok: true, url: `/${path}` });
}
