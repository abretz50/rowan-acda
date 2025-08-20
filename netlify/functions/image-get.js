// netlify/functions/image-get.js
import { getStore } from '@netlify/blobs';

export async function handler(event) {
  try {
    const key = (event.queryStringParameters && event.queryStringParameters.key) || '';
    if (!key) return { statusCode: 400, body: 'Missing key' };

    const store = getStore('event-images');
    const blob = await store.get(key, { type: 'blob' });
    if (!blob) return { statusCode: 404, body: 'Not found' };

    const buf = Buffer.from(await blob.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400'
      },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, body: String(e.message || e) };
  }
}
