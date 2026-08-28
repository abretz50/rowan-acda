// Commits an uploaded file to the repo via the GitHub Contents API — the
// same technique the retired Cloudflare Worker (worker/index.js) used for
// PDF uploads, just moved here so it shares the portal's session auth
// instead of needing its own separate secret/CORS setup.
import { requireAuth, json } from './_lib/auth.mjs';
import { hasPermission } from './_lib/permissions.mjs';

const GH_REPO = 'abretz50/rowan-acda';
const GH_BRANCH = 'main';

const CATEGORY_DIRS = {
  gallery: 'assets/img/gallery',
  eboard: 'assets/img/eboard',
  library: 'assets/pdfs/uploads',
  events: 'assets/img/events',
};
const CATEGORY_ALLOWED_EXT = {
  gallery: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  eboard: ['.jpg', '.jpeg', '.png', '.webp'],
  library: ['.pdf'],
  events: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};
const CATEGORY_PERM = { gallery: 'gallery', eboard: 'content', library: 'library', events: 'events' };

function extOf(name) {
  const m = /\.[a-z0-9]+$/i.exec(name || '');
  return m ? m[0].toLowerCase() : '';
}

async function ghFetch(endpoint, method, body) {
  return fetch(`https://api.github.com/repos/${GH_REPO}/${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'rowan-acda-portal',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireAuth(req);
  if (auth.deny) return auth.deny;
  if (!process.env.GITHUB_TOKEN) return json({ ok: false, error: 'Uploads are not configured (missing GITHUB_TOKEN).' }, 500);

  let formData;
  try { formData = await req.formData(); } catch { return json({ ok: false, error: 'Expected multipart/form-data.' }, 400); }

  const file = formData.get('file');
  const category = formData.get('category');
  const dir = CATEGORY_DIRS[category];
  if (!file || !dir) return json({ ok: false, error: 'A file and a valid category are required.' }, 400);
  if (!(await hasPermission(auth.user.role, CATEGORY_PERM[category]))) {
    return json({ ok: false, error: 'Not authorized for that upload category.' }, 403);
  }

  const ext = extOf(file.name);
  if (!CATEGORY_ALLOWED_EXT[category].includes(ext)) {
    return json({ ok: false, error: `That file type isn't allowed for ${category} uploads.` }, 400);
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `${dir}/${safeName}`;
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');

  const putRes = await ghFetch(`contents/${path}`, 'PUT', {
    message: `Upload ${safeName} via E-Board Portal`,
    content: base64,
    branch: GH_BRANCH,
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    return json({ ok: false, error: err.message || `GitHub error ${putRes.status}` }, 500);
  }

  return json({ ok: true, url: `/${path}` });
}
