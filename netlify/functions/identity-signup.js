import { sqlClient } from './_db.js';

export async function handler(event){
  try{
    const payload = JSON.parse(event.body || '{}');
    const email = payload.email;
    const name = payload.user_metadata && payload.user_metadata.full_name || null;
    const avatar = payload.user_metadata && payload.user_metadata.avatar_url || null;

    const sql = sqlClient();
    await sql`insert into users (email, full_name, avatar_url)
              values (${email}, ${name}, ${avatar})
              on conflict (email) do update set full_name=excluded.full_name, avatar_url=excluded.avatar_url`;
    return { statusCode: 200, body: JSON.stringify({ app_metadata: { role: 'member' } }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({}) }; // don't block signup
  }
}
