import { sqlClient } from './_db.js';
export async function handler(event, context){
  if(event.httpMethod!=='POST') return {statusCode:405,body:'Only POST'};
  const user = context.clientContext && context.clientContext.user;
  if(!user) return {statusCode:401,body:'Login required'};
  const { event_id, kind, slot_start, slot_end } = JSON.parse(event.body||'{}');
  if(!event_id || !kind) return {statusCode:400,body:'event_id & kind required'};
  const sql = sqlClient();
  // upsert Netlify user into Neon users table
  const u = await sql`insert into users (email, full_name, avatar_url)
                      values (${user.email}, ${user.user_metadata?.full_name||null}, ${user.user_metadata?.avatar_url||null})
                      on conflict (email) do update set full_name=excluded.full_name, avatar_url=excluded.avatar_url
                      returning id`;
  await sql`insert into event_signups (user_id, event_id, kind, slot_start, slot_end)
            values (${u[0].id}, ${event_id}, ${kind}, ${slot_start||null}, ${slot_end||null})`;
  return {statusCode:200, body: JSON.stringify({ok:true})};
}
