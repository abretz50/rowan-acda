// netlify/functions/events-get.js
import { sqlClient } from './_db.js';

export async function handler() {
  try {
    const sql = sqlClient();
    const rows = await sql`
      select id, title, summary, starts_at
      from events
      order by starts_at asc
      limit 200
    `;
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(rows) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
