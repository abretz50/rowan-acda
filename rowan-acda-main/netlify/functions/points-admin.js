// points-admin.js
import { sqlClient } from './_db.js';
import { requireRole } from './_auth.js';
const json=(d,s=200)=>({statusCode:s,headers:{'content-type':'application/json'},body:JSON.stringify(d)});

export async function handler(event, context){
  try{
    const { user } = requireRole(context, ['admin','eboard']);
    const sql = sqlClient();
    const m = event.httpMethod.toUpperCase();
    const q = event.queryStringParameters || {};
    const b = event.body ? JSON.parse(event.body):{};

    if(m==='GET'){
      if(q.kind==='leaderboard'){
        const rows = await sql`
          select u.id, u.full_name, u.email, coalesce(t.total_points,0) as points
          from users u
          left join v_points_totals t on t.user_id=u.id
          order by points desc, u.full_name asc
          limit 100`;
        return json(rows);
      }
      if(q.kind==='user_log' && q.user_id){
        const rows = await sql`
          select pl.*, e.title
          from points_ledger pl
          left join events e on e.id = pl.event_id
          where pl.user_id=${q.user_id}
          order by pl.created_at desc
          limit 200`;
        return json(rows);
      }
      return json({error:'Specify kind=leaderboard or kind=user_log&user_id=…'},400);
    }

    if(m==='POST'){ // manual award/remove
      const adminEmail = context.clientContext.user.email;
      const sqlc = sql;
      const u = await sqlc`insert into users (email) values (${adminEmail})
                           on conflict (email) do update set email=excluded.email
                           returning id`;
      const created_by = u[0].id;

      const { user_id, amount, reason, event_id } = b;
      if(!user_id || !amount || !reason) return json({error:'user_id, amount, reason required'},400);
      const r = await sqlc`
        insert into points_ledger (user_id, event_id, amount, reason, created_by)
        values (${user_id}, ${event_id||null}, ${amount}, ${reason}, ${created_by})
        returning *`;
      return json(r[0]);
    }

    return json({error:'Method Not Allowed'},405);
  }catch(e){ return json({error:e.message}, e.statusCode||500); }
}
