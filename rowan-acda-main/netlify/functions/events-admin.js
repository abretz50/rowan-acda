// netlify/functions/events-admin.js
import { sqlClient } from './_db.js';
import { requireRole } from './_auth.js';

const json = (d, s=200) => ({ statusCode: s, headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });

export async function handler(event, context) {
  try {
    requireRole(context, ['admin', 'eboard']);
    const sql = sqlClient();
    const m = event.httpMethod.toUpperCase();
    const body = event.body ? JSON.parse(event.body) : {};

    if (m === 'POST') {
      const {
        title,
        brief,
        full_description,
        starts_at,
      } = body;

      if (!title || !starts_at) return json({ error: 'title & starts_at required' }, 400);

      // Map to current schema: summary := brief || full_description
      const summary = brief || full_description || null;

      const rows = await sql`
        insert into events (title, summary, starts_at)
        values (${title}, ${summary}, ${starts_at})
        returning id, title, summary, starts_at
      `;
      return json(rows[0]);
    }

    if (m === 'PATCH' || m === 'PUT') {
      const { id } = body;
      if (!id) return json({ error: 'id required' }, 400);

      const {
        title,
        brief,
        full_description,
        starts_at,
      } = body;

      // For updates, prefer explicit provided values; summary from brief/full_description if either provided
      const summary =
        (brief !== undefined ? brief :
        (full_description !== undefined ? full_description : undefined));

      const rows = await sql`
        update events set
          title = coalesce(${title}, title),
          summary = coalesce(${summary}, summary),
          starts_at = coalesce(${starts_at}, starts_at)
        where id = ${id}
        returning id, title, summary, starts_at
      `;
      return json(rows[0] || {});
    }

    if (m === 'DELETE') {
      const { id } = body;
      if (!id) return json({ error: 'id required' }, 400);
      await sql`delete from events where id=${id}`;
      return json({ ok: true });
    }

    return json({ error: 'Method Not Allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, e.statusCode || 500);
  }
}
