-- Weekly blog research tool. Run in the Supabase SQL editor.
--
-- Three tables, none of them readable by the anon key. Everything here is
-- either a credential or an operational log, and the public site never reads
-- any of it — only the admin pages (behind Cloudflare Access) and the GitHub
-- Action, both of which use the service-role key.

-- ── API key pool ────────────────────────────────────────────────────────────
--
-- Google AI Studio keys, several of them, across different Google accounts.
-- The free tier allows 20 requests per day per model
-- (GenerateRequestsPerDayPerProjectPerModel-FreeTier), and a weekly run needs
-- about 5-7. The pool exists so a key that is exhausted, revoked or rotated
-- does not end the run: the job moves to the next one and carries on.
--
-- Vertex credentials are deliberately NOT in here. Corridor generation runs on
-- Vertex and must never compete with the blog for quota, so the blog job has no
-- way to reach them.
create table if not exists blog_api_keys (
  id            bigserial primary key,
  label         text not null,              -- 'personal gmail', 'work account'
  api_key       text not null,              -- never returned to a browser
  enabled       boolean not null default true,
  -- Usage accounting. calls_date is the UTC date the counter belongs to; the
  -- job resets the count when it sees a new date rather than needing a cron.
  calls_today   integer not null default 0,
  calls_date    date,
  -- Set when the key returns 429. The job prefers keys that have not been
  -- exhausted today, and reports the reset time when every key is spent.
  exhausted_at  timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_blog_keys_enabled on blog_api_keys(enabled);

-- ── Run history ─────────────────────────────────────────────────────────────
--
-- One row per attempt, created the moment the workflow starts rather than when
-- it finishes. A run that dies halfway must still leave a trace: a job that
-- vanishes silently is the failure mode this project keeps meeting.
create table if not exists blog_runs (
  id             bigserial primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running',  -- running | ok | empty | failed
  trigger        text not null default 'manual',   -- manual | schedule
  -- What the research actually covered and found.
  window_from    date,
  window_to      date,
  stories_found  integer not null default 0,
  drafts_written integer not null default 0,
  api_calls      integer not null default 0,
  keys_used      jsonb not null default '[]',      -- [{label, calls}]
  gov_sources    integer not null default 0,
  -- 'empty' is a success, not a failure: a week with nothing verifiable on a
  -- government page should produce no posts and say so.
  note           text,
  error          text
);

create index if not exists idx_blog_runs_started on blog_runs(started_at desc);

-- ── Drafts produced ─────────────────────────────────────────────────────────
--
-- Kept separately from the markdown file so the admin UI can show what a run
-- produced, and what it was built on, without reading the repo. The file itself
-- is the source of truth for content; this is the receipt.
create table if not exists blog_drafts (
  id          bigserial primary key,
  run_id      bigint references blog_runs(id) on delete cascade,
  slug        text not null,
  title       text not null,
  words       integer,
  tags        jsonb not null default '[]',
  -- Every URL the research pass actually retrieved, with whether it was a
  -- government domain. Taken from the API's own metadata, never from the
  -- model's prose about its sources.
  sources     jsonb not null default '[]',
  gov_sources integer not null default 0,
  committed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_blog_drafts_run on blog_drafts(run_id);

-- ── Lock everything to the service role ─────────────────────────────────────
--
-- RLS on with no policy granting anon anything means the anon key reads
-- nothing and writes nothing. The service-role key bypasses RLS, which is what
-- the admin pages and the GitHub Action use. An API key table readable with a
-- key that ships to browsers would be a credential leak.
alter table blog_api_keys enable row level security;
alter table blog_runs     enable row level security;
alter table blog_drafts   enable row level security;

revoke all on blog_api_keys from anon;
revoke all on blog_runs     from anon;
revoke all on blog_drafts   from anon;
