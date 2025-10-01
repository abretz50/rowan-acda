// Serverless backend for Tenor–Bass Festival volunteer signups
// Works with the front-end at /.netlify/functions/slots-tb
// Storage: Netlify Blobs (no DB needed)

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'tb-volunteers';
const ROSTER_KEY = 'roster.json';

// Utility: create a humble CSV string from the roster object
function rosterToCSV(roster) {
  const rows = [['Role (Time)', 'Slot #', 'First', 'Last', 'Email']];
  for (const [key, arr] of Object.entries(roster)) {
    (arr || []).forEach((entry, i) => {
      if (!entry) return rows.push([key, i + 1, '', '', '']);
      const { first = '', last = '', email = '' } = entry;
      rows.push([key, i + 1, first, last, email]);
    });
  }
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Initialize empty slots if needed based on posted key/slot
function ensureShape(roster, key, slotIndex) {
  if (!roster[key]) roster[key] = [];
  if (roster[key].length <= slotIndex) {
    const need = slotIndex + 1 - roster[key].length;
    roster[key].push(...Array.from({ length: need }, () => null));
  }
}

export default async function handler(req) {
  const store = getStore(STORE_NAME);
  const url = new URL(req.url);

  // ---- GET: read roster / export CSV ----
  if (req.method === 'GET') {
    const roster = (await store.get(ROSTER_KEY, { type: 'json' })) || {};

    // Admin peek: GET ?admin=json
    if (url.searchParams.get('admin') === 'json') {
      return new Response(JSON.stringify({ ok: true, roster }, null, 2), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Frontend: GET ?roster=1
    if (url.searchParams.get('roster')) {
      // Reduce to display-only data (names) for privacy
      const display = {};
      for (const [key, arr] of Object.entries(roster)) {
        display[key] = (arr || []).map(e => (e ? `${e.first} ${e.last}`.trim() : null));
      }
      return new Response(JSON.stringify({ ok: true, roster: display }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Export: GET ?csv=1
    if (url.searchParams.get('csv')) {
      const csv = rosterToCSV(roster);
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="tenor-bass-volunteers.csv"',
        },
      });
    }

    // Fallback
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ---- POST: claim a slot ----
  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Bad JSON' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const { key, slot, first, last, email } = body || {};
    if (!key || typeof slot !== 'number' || !first || !last || !email) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing fields' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Load current roster
    const roster = (await getStore(STORE_NAME).get(ROSTER_KEY, { type: 'json' })) || {};
    ensureShape(roster, key, slot);

    // Prevent double-claim
    if (roster[key][slot]) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Slot already taken.' }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      );
    }

    // Save claim
    roster[key][slot] = { first, last, email, ts: Date.now() };
    await store.setJSON(ROSTER_KEY, roster);

    // Return display-safe data
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ---- OPTIONS/CORS (optional; mostly for local dev) ----
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
