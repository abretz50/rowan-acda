// netlify/functions/slots-tb.mjs
import { getStore } from '@netlify/blobs';

const STORE = 'tb-2025';
const ROSTER_KEY = 'volunteer-grid.json';

// Initialize all roles with 4 empty slots
function initRoster(roles) {
  const roster = {};
  for (const key of roles) {
    roster[key] = [null, null, null, null];
  }
  return roster;
}

function json(body, status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export default async (request, context) => {
  const store = getStore(STORE);

  // Build role keys from a bundled JSON artifact
  const resp = await fetch(new URL('/tenor-bass-festival/roles.json', request.url));
  const roles = await resp.json().catch(() => []);

  let roster = {};
  try {
    const existing = await store.get(ROSTER_KEY, { type:'json' });
    roster = existing || initRoster(roles);
    if (!existing) {
      await store.set(ROSTER_KEY, JSON.stringify(roster, null, 2), { contentType: 'application/json' });
    }
  } catch {
    roster = initRoster(roles);
    await store.set(ROSTER_KEY, JSON.stringify(roster, null, 2), { contentType: 'application/json' });
  }

  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('roster')) {
      return json({ roster });
    }
    return json({ ok:true });
  }

  if (request.method === 'POST') {
    const payload = await request.json().catch(() => null);
    if (!payload || !payload.key || typeof payload.slot !== 'number' || !payload.first || !payload.last || !payload.email) {
      return json({ error:'Missing fields' }, 400);
    }
    const key = payload.key;
    const slot = payload.slot;
    if (!roster[key] || slot < 0 || slot > 3) {
      return json({ error:'Invalid slot' }, 400);
    }
    if (roster[key][slot]) {
      return json({ ok:false, message:'Slot already taken' }, 409);
    }
    const displayName = `${payload.first.trim()} ${payload.last.trim()}`;
    roster[key][slot] = displayName;

    await store.set(ROSTER_KEY, JSON.stringify(roster, null, 2), { contentType: 'application/json' });

    // Also store a record per signup (optional)
    const recKey = `volunteers/${Date.now()}_${payload.email.replace(/[^a-zA-Z0-9._-]/g,'_')}.json`;
    await store.set(recKey, JSON.stringify({ ...payload, name: displayName, ts: new Date().toISOString() }, null, 2), { contentType: 'application/json' });

    return json({ ok:true, roster });
  }

  return json({ error:'Method not allowed' }, 405);
};
