import { sqlClient } from './_db.js';

function requireAuth(event){
  const claims = event.clientContext && event.clientContext.user;
  if(!claims) throw new Error('Unauthorized');
  return claims;
}

export async function handler(event){
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body:'Method Not Allowed' };
  }
  try{
    const user = requireAuth(event);
    const { title, summary, starts_at } = JSON.parse(event.body || '{}');
    if(!title || !starts_at) return { statusCode: 400, body:'Missing title or starts_at' };

    const sql = sqlClient();
    // Upsert user by email into users table
    const email = user.email;
    const full_name = user.user_metadata && user.user_metadata.full_name || null;
    const avatar_url = user.user_metadata && user.user_metadata.avatar_url || null;

    const u = await sql`insert into users (email, full_name, avatar_url)
                         values (${email}, ${full_name}, ${avatar_url})
                         on conflict (email) do update set full_name=excluded.full_name, avatar_url=excluded.avatar_url
                         returning id`;
    const user_id = u[0].id;

    const rows = await sql`insert into events (title, summary, starts_at, created_by)
                           values (${title}, ${summary || null}, ${starts_at}, ${user_id})
                           returning id, title, summary, starts_at`;
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(rows[0]) };
  }catch(e){
    const code = /Unauthorized/.test(e.message) ? 401 : 500;
    return { statusCode: code, body: JSON.stringify({error:e.message}) };
  }
}
