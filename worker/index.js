/**
 * Rowan ACDA — PDF Upload Worker
 * Deploy to Cloudflare Workers (free tier).
 * Set GITHUB_TOKEN as a Worker secret (Contents: Read & Write on abretz50/rowan-acda).
 */

const GH_REPO   = 'abretz50/rowan-acda';
const GH_BRANCH = 'main';
const ALLOWED_ORIGIN = 'https://rowanacda.org';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/upload') {
      return handleUpload(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return json({ error: 'No file provided.' }, 400);
    if (!file.name.toLowerCase().endsWith('.pdf')) return json({ error: 'Only PDF files are allowed.' }, 400);

    // Sanitise filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `assets/pdfs/uploads/${safeName}`;

    // Base64-encode the file
    const bytes = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(bytes);

    // Check if file already exists (need SHA to overwrite)
    let sha = null;
    const checkRes = await ghFetch(env, `contents/${path}`, 'GET');
    if (checkRes.ok) {
      const data = await checkRes.json();
      sha = data.sha;
    }

    // Commit file to GitHub
    const body = {
      message: `Upload ${safeName} via E-Board`,
      content: base64,
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    };

    const putRes = await ghFetch(env, `contents/${path}`, 'PUT', body);
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return json({ error: err.message || `GitHub error ${putRes.status}` }, 500);
    }

    return json({ url: `/assets/pdfs/uploads/${safeName}` });
  } catch (err) {
    return json({ error: err.message || 'Unknown error' }, 500);
  }
}

function ghFetch(env, endpoint, method, body) {
  return fetch(`https://api.github.com/repos/${GH_REPO}/${endpoint}`, {
    method,
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'rowan-acda-worker',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
