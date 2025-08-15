// netlify/functions/events-admin.js
import { sqlClient } from './_db.js';
import { requireRole } from './_auth.js';

export async function handler(event, context) {
  try {
    // Only admin or eboard
    requireRole(context, ["admin", "eboard"]);

    const sql = sqlClient();
    const method = event.httpMethod.toUpperCase();

    if (method === "POST") {
      const { title, summary, starts_at } = JSON.parse(event.body || "{}");
      if (!title || !starts_at) return { statusCode: 400, body: "Missing title or starts_at" };

      const rows = await sql`
        insert into events (title, summary, starts_at)
        values (${title}, ${summary || null}, ${starts_at})
        returning id, title, summary, starts_at
      `;
      return json(rows[0]);
    }

    if (method === "PUT") {
      const { id, title, summary, starts_at } = JSON.parse(event.body || "{}");
      if (!id) return { statusCode: 400, body: "Missing id" };
      const rows = await sql`
        update events
        set title = coalesce(${title}, title),
            summary = coalesce(${summary}, summary),
            starts_at = coalesce(${starts_at}, starts_at)
        where id = ${id}
        returning id, title, summary, starts_at
      `;
      return json(rows[0] || {});
    }

    if (method === "DELETE") {
      const { id } = JSON.parse(event.body || "{}");
      if (!id) return { statusCode: 400, body: "Missing id" };
      await sql`delete from events where id = ${id}`;
      return json({ ok: true });
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (e) {
    const status = e.statusCode || 500;
    return { statusCode: status, body: JSON.stringify({ error: e.message }) };
  }
}

function json(data) {
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
}
