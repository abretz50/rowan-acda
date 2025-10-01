// netlify/functions/slots-tb.mjs
import { getStore } from '@netlify/blobs';
const STORE = 'tb-2025';
const ROSTER_KEY = 'volunteer-grid.json';
const DEFAULT_ROLES = [
  "Bus Crew (7:30–9:30)","Lobby Ushers (7:30–9:30)","Registration (7:30–9:30)",
  "Set-Up Crew (9:30–10:00)","T|B Merchandise (11:00–12:30)","ACDA Merchandise (11:00–12:30)",
  "NAfME Snack Table (11:00–12:30)","Lunch Bouncers (11:15–12:30)",
  "Restroom Patrol (TBA)","Teacher Hospitality (AM) (TBA)","153 Readiness Piano (TBA)",
  "Sing-A-Long Band (TBA)","Sing-A-Long Lead (TBA)","PowerPoint (9:00–9:20)",
  "Signage (create/place) (TBA)","Packet Collating (TBA)","Guest Artist Host (TBA)",
  "Performers (permission req.) (TBA)"
];
function initRoster(roles){ const r={}; for(const k of roles) r[k]=[null,null,null,null]; return r; }
function json(body,status=200,headers={}){ return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}}); }
export default async (request, context) => {
  const store = getStore(STORE);
  let roster = {};
  try {
    const existing = await store.get(ROSTER_KEY, { type:'json' });
    roster = existing || initRoster(DEFAULT_ROLES);
    if (!existing) await store.set(ROSTER_KEY, JSON.stringify(roster,null,2), { contentType:'application/json' });
  } catch {
    roster = initRoster(DEFAULT_ROLES);
    await store.set(ROSTER_KEY, JSON.stringify(roster,null,2), { contentType:'application/json' });
  }
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (url.searchParams.get('roster')) return json({ roster });
    if (url.searchParams.get('csv')) {
      const rows = [['Window','Role','Slot 1','Slot 2','Slot 3','Slot 4']];
      for (const [key, arr] of Object.entries(roster)) {
        const m = key.match(/^(.*) \((.*)\)$/);
        const role = m ? m[1] : key;
        const window = m ? m[2] : '';
        rows.push([window, role, ...(arr||[]).map(x=>x||'')]);
      }
      const csv = rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\n');
      return new Response(csv,{ status:200, headers:{ 'content-type':'text/csv', 'content-disposition':'attachment; filename="tenor-bass-volunteers.csv"' }});
    }
    return json({ ok:true });
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(()=>null);
    if (!body || !body.key || typeof body.slot !== 'number' || !body.first || !body.last || !body.email) return json({ error:'Missing fields' }, 400);
    const key = body.key, slot = body.slot;
    if (!roster[key] || slot<0 || slot>3) return json({ error:'Invalid slot' }, 400);
    if (roster[key][slot]) return json({ ok:false, message:'Slot already taken' }, 409);
    const name = `${body.first.trim()} ${body.last.trim()}`;
    roster[key][slot] = name;
    await store.set(ROSTER_KEY, JSON.stringify(roster,null,2), { contentType:'application/json' });
    const recKey = `volunteers/${Date.now()}_${body.email.replace(/[^a-zA-Z0-9._-]/g,'_')}.json`;
    await store.set(recKey, JSON.stringify({ ...body, name, ts:new Date().toISOString() }, null, 2), { contentType:'application/json' });
    return json({ ok:true, roster });
  }
  return json({ error:'Method not allowed' }, 405);
};