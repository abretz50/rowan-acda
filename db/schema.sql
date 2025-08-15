-- Neon schema for Rowan ACDA
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
