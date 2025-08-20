// netlify/functions/upload-image.js
import { getStore } from '@netlify/blobs';
import { requireRole } from './_auth.js';

export async function handler(event, context) {
  try {
    requireRole(context, ['admin', 'eboard']);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Expect multipart/form-data
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.toLowerCase().includes('multipart/form-data')) {
      return { statusCode: 400, body: 'Expected multipart/form-data' };
    }

    const bodyInit = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : (event.body || '');

    const req = new Request('http://local', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bodyInit,
    });

    let form;
    try {
      form = await req.formData();
    } catch {
      return { statusCode: 400, body: 'Failed to parse body as FormData.' };
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return { statusCode: 400, body: 'No file field in form-data.' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { statusCode: 413, body: 'File too large (max 5MB)' };
    }

    // --- Netlify Blobs configuration ---
    // If Blobs isn't auto-configured in your environment, pass siteID & token explicitly.
    const siteID = process.env.NETLIFY_SITE_ID || process.env.BLOBS_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.BLOBS_TOKEN;

    const store = getStore('event-images', (siteID && token) ? { siteID, token } : undefined);
    // -----------------------------------

    const key = crypto.randomUUID();

    await store.set(key, file, {
      metadata: { contentType: file.type || 'application/octet-stream' }
    });

    const url = `/.netlify/functions/image-get?key=${encodeURIComponent(key)}`;
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, url })
    };
  } catch (e) {
    return { statusCode: e.statusCode || 500, body: String(e.message || e) };
  }
}
