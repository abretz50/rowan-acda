import 'cross-fetch/polyfill';
import Papa from 'papaparse';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export const handler = async () => {
  try {
    const csvUrl = process.env.SHEET_CSV_URL;
    if (!csvUrl) return { statusCode: 500, body: 'SHEET_CSV_URL missing' };

    const res = await fetch(csvUrl, { cache: 'no-store' });
    if (!res.ok) return { statusCode: 502, body: 'Failed to fetch sheet' };
    const csvText = await res.text();

    const { data, errors } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (errors?.length) console.warn('CSV parse warnings:', errors.slice(0, 3));

    const clean = s => (s ?? '').toString().trim();

    for (const row of data) {
      const title = clean(row['Event Title'] || row['Title']);
      const type = clean(row['Type']);
      const dateStr = clean(row['Date']);
      const time = clean(row['Time']);
      const short_desc = clean(row['Short Description'] || row['Short']);
      const long_desc = clean(row['Long Description'] || row['Long']);
      const image_url = clean(row['Image'] || row['Image URL']);

      if (!title || !dateStr) continue;

      const parts = dateStr.split(/[\/\-]/).map(s => s.padStart(2, '0'));
      // Support MM/DD/YYYY and YYYY-MM-DD
      let iso = dateStr;
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          iso = `${parts[0]}-${parts[1]}-${parts[2]}`;
        } else {
          iso = `${parts[2]}-${parts[0]}-${parts[1]}`;
        }
      }

      await sql/*sql*/`
        insert into events (title, type, date, time, short_desc, long_desc, image_url)
        values (${title}, ${type}, ${iso}, ${time}, ${short_desc}, ${long_desc}, ${image_url})
        on conflict (title, date) do update set
          type = excluded.type,
          time = excluded.time,
          short_desc = excluded.short_desc,
          long_desc = excluded.long_desc,
          image_url = excluded.image_url;
      `;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, rows: data.length }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
