// users-admin.js
import { requireRole } from './_auth.js';
const json=(d,s=200)=>({statusCode:s,headers:{'content-type':'application/json'},body:JSON.stringify(d)});

const IDENTITY_URL = process.env.NETLIFY_IDENTITY_URL || process.env.URL + '/.netlify/identity';
const ADMIN_TOKEN = process.env.NETLIFY_IDENTITY_ADMIN_TOKEN;

async function adminFetch(path, init={}){
  if(!ADMIN_TOKEN) throw new Error('Missing NETLIFY_IDENTITY_ADMIN_TOKEN');
  const r = await fetch(`${IDENTITY_URL}${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}`, 'Content-Type':'application/json', ...(init.headers||{}) }
  });
  if(!r.ok){ throw new Error(`Identity admin ${r.status}`); }
  return r.json();
}

export async function handler(event, context){
  try{
    requireRole(context, ['admin']); // only admin can manage roles
    const m = event.httpMethod.toUpperCase();
    const b = event.body ? JSON.parse(event.body):{};

    if(m==='GET'){ // list users
      const users = await adminFetch('/admin/users');
      // hide tokens
      return json(users.map(u=>({id:u.id,email:u.email,app_metadata:u.app_metadata,user_metadata:u.user_metadata})));
    }

    if(m==='POST'){ // set roles
      const { user_id, roles } = b;
      if(!user_id || !Array.isArray(roles)) return json({error:'user_id & roles[] required'},400);
      const updated = await adminFetch(`/admin/users/${user_id}`, {
        method:'PUT',
        body: JSON.stringify({ app_metadata: { roles } })
      });
      return json({id:updated.id, app_metadata: updated.app_metadata});
    }

    return json({error:'Method Not Allowed'},405);
  }catch(e){ return json({error:e.message}, e.statusCode||500); }
}
