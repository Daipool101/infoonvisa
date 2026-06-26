-- InfoOnVisa — Supabase schema. Run in the Supabase SQL editor.

create table if not exists corridors (
  id              text primary key,            -- 'IN-JP'
  from_country    text not null,               -- ISO 'IN'
  to_country      text not null,               -- ISO 'JP'
  slug            text unique not null,         -- 'india-to-japan'
  data            jsonb not null,               -- full structured content (blocks A–G)
  sources         jsonb not null default '[]',
  verdict         text,                         -- 'visa_free'|'voa'|'evisa'|'eta'|'embassy'
  max_stay_days   integer,
  status          text not null default 'pending_review', -- 'verified'|'pending_review'|'low_quality'
  generated_at    timestamptz not null default now(),
  next_refresh_at timestamptz not null,
  search_count    integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_corridors_refresh on corridors(next_refresh_at);
create index if not exists idx_corridors_status on corridors(status);

create table if not exists searches (
  id          bigserial primary key,
  corridor_id text references corridors(id),
  searched_at timestamptz not null default now()
);

-- Atomic search counter used by the app.
create or replace function increment_search_count(c_id text)
returns void language sql as $$
  update corridors set search_count = search_count + 1 where id = c_id;
$$;

-- Row Level Security: anon can read ONLY verified corridors.
alter table corridors enable row level security;

drop policy if exists "anon reads verified" on corridors;
create policy "anon reads verified"
  on corridors for select
  to anon
  using (status = 'verified');

-- Lock down the searches table too (analytics only; written server-side via service-role).
-- RLS with no policy = default-deny for the public anon key.
alter table searches enable row level security;

-- The service-role key bypasses RLS, so server-side writes/generation work without extra policies.

-- ---------------------------------------------------------------------------
-- Verification console: to PUBLISH a corridor (make it indexable), run e.g.
--   update corridors set status = 'verified' where slug = 'india-to-japan';
-- ---------------------------------------------------------------------------
