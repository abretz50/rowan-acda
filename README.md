# Rowan ACDA — Netlify + Neon (DB + Auth)

This version adds a **Neon Postgres** database and **Netlify Identity** user authentication.

## 1) Create a Neon project
- Create DB and get your connection string (use pooled string or add `?sslmode=require`).
- Set Netlify env var: **NEON_DATABASE_URL**

Run this SQL once (Neon SQL editor) to create tables:
```
-- db/schema.sql
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  starts_at timestamptz not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

## 2) Enable Netlify Identity
- Netlify Dashboard → **Identity** → Enable.
- **Emails**: enable magic links if you want.
- **External providers** optional.
- (Optional) Go to **Identity → Settings → Webhooks** and add:
  - `/.netlify/functions/identity-signup` (trigger: Signup)

## 3) Deploy
- Push to GitHub, connect the repo to Netlify, deploy.
- Set **Environment variables** in Netlify:
  - `NEON_DATABASE_URL=postgresql://USER:PASSWORD@...neon.tech/DB_NAME?sslmode=require`

## 4) Use the API
- Public GET events: `/.netlify/functions/events-get`
- Authenticated POST event: `/.netlify/functions/events-post` with JSON body:
```json
{ "title":"General Meeting", "summary":"Kickoff", "starts_at":"2025-09-10T23:00:00Z" }
```
Netlify Identity JWT is passed automatically to functions via `event.clientContext.user` when the user is logged in on your site domain.

## Frontend
- Login/Logout handled by the Netlify Identity widget (already included).
- On **Events** page, items load from Neon via the GET function.

---

**Tip:** For local dev, install Netlify CLI (`npm i -g netlify-cli`), then:
```
npm install
netlify dev
```
