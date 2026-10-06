// What /admin/blog reads and writes.
//
// Everything here goes through the service-role client. The key pool is a table
// of live credentials, so it must never be reachable with the anon key that
// ships to browsers — and the keys themselves must never travel back to a
// browser at all, which is what `maskKey` is for.
import type { AppEnv } from './supabase';
import { adminClient } from './admin-data';

export interface BlogKey {
  id: number;
  label: string;
  /** Masked. The real key never leaves the server once it is saved. */
  masked: string;
  enabled: boolean;
  callsToday: number;
  exhaustedAt: string | null;
  lastUsedAt: string | null;
}

export interface BlogRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'ok' | 'empty' | 'failed';
  trigger: string;
  windowFrom: string | null;
  windowTo: string | null;
  storiesFound: number;
  draftsWritten: number;
  apiCalls: number;
  keysUsed: { label: string; calls: number }[];
  govSources: number;
  note: string | null;
  error: string | null;
}

export interface BlogDraft {
  id: number;
  runId: number | null;
  slug: string;
  title: string;
  words: number | null;
  tags: string[];
  sources: { title: string; government: boolean }[];
  govSources: number;
  createdAt: string;
}

/**
 * Show enough of a key to recognise it, not enough to use it.
 *
 * Google keys all begin `AIza`, so the prefix identifies nothing; the tail is
 * what tells two of the owner's accounts apart.
 */
export function maskKey(key: string): string {
  const k = (key ?? '').trim();
  if (k.length <= 10) return '••••';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

const todayUTC = () => new Date().toISOString().slice(0, 10);

export type BlogAdmin =
  | { setupNeeded: true }
  | { setupNeeded?: false; keys: BlogKey[]; runs: BlogRun[]; drafts: BlogDraft[] };

export async function loadBlogAdmin(env: AppEnv): Promise<BlogAdmin | null> {
  const db = adminClient(env);
  if (!db) return null;

  const [keysRes, runsRes, draftsRes] = await Promise.all([
    db.from('blog_api_keys').select('*').order('id'),
    db.from('blog_runs').select('*').order('started_at', { ascending: false }).limit(15),
    db.from('blog_drafts').select('*').order('created_at', { ascending: false }).limit(20),
  ]);

  // Tell "the tables do not exist yet" apart from "there is nothing in them".
  // Both render as three empty lists otherwise, and the first one then looks
  // like a working page right up until adding a key fails with an error nobody
  // can act on.
  //
  // PGRST205 is PostgREST's "table not in the schema cache", which is what
  // Supabase actually returns here — NOT Postgres's own 42P01 undefined_table,
  // which never reaches the client through this path.
  if (keysRes.error?.code === 'PGRST205' || keysRes.error?.code === '42P01') {
    return { setupNeeded: true as const };
  }

  const d = todayUTC();
  const keys: BlogKey[] = (keysRes.data ?? []).map((k: any) => ({
    id: k.id,
    label: k.label,
    masked: maskKey(k.api_key),
    enabled: k.enabled,
    // A counter from yesterday is not today's usage. Showing a stale number
    // would make a fresh key look spent.
    callsToday: k.calls_date === d ? k.calls_today : 0,
    exhaustedAt: k.exhausted_at,
    lastUsedAt: k.last_used_at,
  }));

  const runs: BlogRun[] = (runsRes.data ?? []).map((r: any) => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    trigger: r.trigger,
    windowFrom: r.window_from,
    windowTo: r.window_to,
    storiesFound: r.stories_found ?? 0,
    draftsWritten: r.drafts_written ?? 0,
    apiCalls: r.api_calls ?? 0,
    keysUsed: r.keys_used ?? [],
    govSources: r.gov_sources ?? 0,
    note: r.note,
    error: r.error,
  }));

  const drafts: BlogDraft[] = (draftsRes.data ?? []).map((x: any) => ({
    id: x.id,
    runId: x.run_id,
    slug: x.slug,
    title: x.title,
    words: x.words,
    tags: x.tags ?? [],
    sources: x.sources ?? [],
    govSources: x.gov_sources ?? 0,
    createdAt: x.created_at,
  }));

  return { keys, runs, drafts };
}

/** Next Monday 05:00 UTC — the workflow's cron, computed rather than hardcoded. */
export function nextScheduledRun(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(5, 0, 0, 0);
  const daysUntilMonday = (8 - next.getUTCDay()) % 7;
  next.setUTCDate(next.getUTCDate() + (daysUntilMonday === 0 && next <= now ? 7 : daysUntilMonday));
  return next;
}
