# Rowan ACDA — Neon + Google Sheets Events (Minimal Inject)

This adds:
- `netlify/functions/list-events.js` — JSON API to read events
- `netlify/functions/sync-events.js` — imports your Google Sheet (CSV) into Neon
- `netlify.toml` — config + a schedule to sync every 3 hours
- `assets/css/events.css` — small, separate stylesheet
- A tiny `<section id="events">` + inline `<script>` added to your homepage to render cards

## 1) Neon (Postgres) — one time
1. Create a Neon project → get your **DATABASE_URL** (Connection details).
2. Run this SQL in Neon:
```sql
create extension if not exists pgcrypto;
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text,
  date date,
  time text,
  short_desc text,
  long_desc text,
  image_url text,
  unique (title, date)
);
create index if not exists events_date_idx on events (date);
```

## 2) Publish your Google Sheet as CSV
Google Sheets → **File → Share → Publish to web → Link → Select the correct tab → CSV**.  
Copy the CSV link.

## 3) Netlify environment variables
Add in **Site settings → Environment**:
- `DATABASE_URL` = your Neon connection string
- `SHEET_CSV_URL` = your Google Sheet's published CSV URL

(Deploy after setting env vars.)

## 4) Seed once, then automatic
- Visit `/.netlify/functions/sync-events` once to import from the sheet.
- Events appear under the "Upcoming Events" section on your homepage.
- A scheduler runs every 3 hours to keep Neon in sync.

## 5) Local development (optional)
```
npm i @neondatabase/serverless papaparse cross-fetch
netlify dev
```
Then open `http://localhost:8888/.netlify/functions/list-events` to test.

## Notes
- To change the card look, edit `assets/css/events.css` only.
- To filter/type/date in the future, extend `list-events.js` or the frontend fetch URL with `?type=...&from=YYYY-MM-DD`.
