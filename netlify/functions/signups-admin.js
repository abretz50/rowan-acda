// signups-admin.js
import { sqlClient } from './_db.js';
import { requireRole } from './_auth.js';
const json=(d,s=200)=>({statusCode:s,headers:{'content-type':'application/json'},body:JSON.stringify(d)});

export async function handler(event, context){
  try{
    const { user } = requireRole(context, ['admin','eboard']);
    const sql = sqlClient();
    const m = event.httpMethod.toUpperCase();
    const b = event.body ? JSON.parse(event.body):{};

    if(m==='GET'){
      const { event_id } = b; // or use queryStringParameters
      const rows = await sql`
        select es.*, e.title, e.points_value
        from event_signups es
        join events e on e.id = es.event_id
        where es.status='pending'
        order by es.created_at asc
        limit 200`;
      return json(rows);
    }

    if(m==='POST'){ // approve/deny batch
      const approverEmail = context.clientContext.user.email;
      // upsert approver in users table to get id
      const u = await sql`insert into users (email) values (${approverEmail})
                          on conflict (email) do update set email=excluded.email
                          returning id`;
      const approver_id = u[0].id;

      const { decisions } = b; // [{signup_id, approve:true/false, points_override?, comment}]
      if(!Array.isArray(decisions) || !decisions.length) return json({error:'decisions[] required'},400);

      const results = [];
      for(const d of decisions){
        const s = await sql`select * from event_signups where id=${d.signup_id} for update`;
        if(!s.length) { results.push({id:d.signup_id, error:'not found'}); continue; }
        const row = s[0];
        const ev = (await sql`select id, points_value from events where id=${row.event_id}`)[0];

        const status = d.approve ? 'approved' : 'denied';
        const points = d.approve ? (d.points_override ?? ev.points_value ?? 0) : 0;

        await sql`update event_signups
                  set status=${status}, points_awarded=${points}, approved_by=${approver_id},
                      approval_comment=${d.comment||null}, updated_at=now()
                  where id=${row.id}`;

        if(d.approve && points){
          await sql`insert into points_ledger (user_id, event_id, amount, reason, created_by)
                    values (${row.user_id}, ${row.event_id}, ${points}, 'Event participation', ${approver_id})`;
        }
        results.push({id:row.id, status, points});
      }
      return json({ok:true, results});
    }

    return json({error:'Method Not Allowed'},405);
  }catch(e){ return json({error:e.message}, e.statusCode||500); }
}
