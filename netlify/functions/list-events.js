import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');
    const type = url.searchParams.get('type');

    let query = `select id, title, type, date, time, short_desc, long_desc, image_url from events`;
    const conds = [];
    const params = [];

    if (from) { params.push(from); conds.push(`date >= $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`date <= $${params.length}`); }
    if (type) { params.push(type); conds.push(`type = $${params.length}`); }

    if (conds.length) query += ` where ` + conds.join(' and ');
    query += ` order by date asc, time asc nulls last limit 200`;

    const rows = await sql(query, params);
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(rows) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
