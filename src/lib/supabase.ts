import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as cfEnv } from 'cloudflare:workers';
import type { CorridorData, Source, Verdict } from './corridor';
import { REFRESH_DAYS } from './corridor';
import { SEED } from './seed';

// On Cloudflare, runtime secrets come from `cloudflare:workers` env (Astro v6).
// PUBLIC_* vars are also inlined by Vite, so import.meta.env is the dev/build fallback.
export interface AppEnv {
  PUBLIC_SUPABASE_URL: string;
  PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  PUBLIC_ADSENSE_CLIENT: string;
  // Google Cloud / Vertex AI (for on-demand generation from Cloudflare).
  GCP_PROJECT_ID: string;
  GCP_LOCATION: string;
  GCP_SA_KEY: string; // service-account JSON (raw or base64)
}

// Accessing the cloudflare env proxy can throw during prerender/build — guard it.
function cf(key: string): string | undefined {
  try {
    return (cfEnv as Record<string, any> | undefined)?.[key];
  } catch {
    return undefined;
  }
}

export function getEnv(): AppEnv {
  const ime = import.meta.env as any;
  const pick = (k: string) => cf(k) ?? ime[k] ?? '';
  return {
    PUBLIC_SUPABASE_URL: pick('PUBLIC_SUPABASE_URL'),
    PUBLIC_SUPABASE_ANON_KEY: pick('PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: pick('SUPABASE_SERVICE_ROLE_KEY'),
    GEMINI_API_KEY: pick('GEMINI_API_KEY'),
    GEMINI_MODEL: pick('GEMINI_MODEL') || 'gemini-2.5-flash',
    PUBLIC_ADSENSE_CLIENT: pick('PUBLIC_ADSENSE_CLIENT'),
    GCP_PROJECT_ID: pick('GCP_PROJECT_ID'),
    GCP_LOCATION: pick('GCP_LOCATION') || 'us-central1',
    GCP_SA_KEY: pick('GCP_SA_KEY'),
  };
}

export type CorridorStatus = 'verified' | 'pending_review' | 'low_quality';

export interface CorridorRow {
  id: string;
  from_country: string;
  to_country: string;
  slug: string;
  data: CorridorData;
  sources: Source[];
  verdict: Verdict;
  max_stay_days: number | null;
  status: CorridorStatus;
  generated_at: string;
  next_refresh_at: string;
  search_count: number;
}

function client(env: AppEnv, useServiceRole = false): SupabaseClient | null {
  const key = useServiceRole ? env.SUPABASE_SERVICE_ROLE_KEY : env.PUBLIC_SUPABASE_ANON_KEY;
  if (!env.PUBLIC_SUPABASE_URL || !key) return null;
  return createClient(env.PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

export async function getCorridor(env: AppEnv, slug: string): Promise<CorridorRow | null> {
  // Server-side read with the service-role key so we can also serve freshly
  // generated `pending_review` pages to users (noindex handles SEO gating).
  // The anon key + RLS "verified only" policy remains as defense-in-depth.
  const db = client(env, true);
  if (!db) return seedRow(slug);
  const { data, error } = await db.from('corridors').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return data as CorridorRow;
}

// Fallback so the site previews without a database configured.
function seedRow(slug: string): CorridorRow | null {
  const data = SEED[slug];
  if (!data) return null;
  return {
    id: slug,
    from_country: '',
    to_country: '',
    slug,
    data,
    sources: data.sources,
    verdict: data.verdict,
    max_stay_days: data.maxStayDays ?? null,
    status: 'pending_review',
    generated_at: '2026-06-18T00:00:00.000Z',
    next_refresh_at: '2026-07-18T00:00:00.000Z',
    search_count: 0,
  };
}

// Is this URL an official government / immigration authority source?
// Auto-publish gate: pages grounded in a .gov (or equivalent) source are safe
// to go live without manual review; anything else is held as pending_review.
function isOfficialSourceUrl(url?: string): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    /(^|\.)gov(\.[a-z]{2,3})*$/.test(host) || // gov.uk, .gov.sg, .gov.eg, .gov
    /\.go\.[a-z]{2}$/.test(host) || // .go.th, .go.kr
    /(^|\.)gob\.[a-z]{2}$/.test(host) || // .gob.mx (Spanish-speaking gov)
    /(^|\.)gouv\.[a-z]{2}$/.test(host) || // .gouv.fr
    host === 'u.ae' ||
    host.endsWith('.u.ae') ||
    host.endsWith('.admin.ch') ||
    host.endsWith('.govt.nz') ||
    host.endsWith('.gc.ca') || // Government of Canada
    host === 'canada.ca' ||
    host.endsWith('.canada.ca') || // Government of Canada (canada.ca)
    host === 'europa.eu' ||
    host.endsWith('.europa.eu') // Official EU (Schengen, ec.europa.eu, etc.)
  );
}

// Decide whether a freshly generated page can auto-publish. It must cite at
// least one official government source (in officialSource or sources[]).
function autoStatus(data: CorridorData): CorridorStatus {
  const official =
    isOfficialSourceUrl(data.officialSource?.url) ||
    (data.sources || []).some((s) => isOfficialSourceUrl(s.url));
  return official ? 'verified' : 'pending_review';
}

export async function saveCorridor(
  env: AppEnv,
  row: {
    id: string;
    from_country: string;
    to_country: string;
    slug: string;
    data: CorridorData;
  }
): Promise<boolean> {
  const db = client(env, true);
  if (!db) return false;
  const now = new Date();
  const next = new Date(now.getTime() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await db.from('corridors').upsert(
    {
      ...row,
      sources: row.data.sources,
      verdict: row.data.verdict,
      max_stay_days: row.data.maxStayDays ?? null,
      status: autoStatus(row.data),
      generated_at: now.toISOString(),
      next_refresh_at: next.toISOString(),
    },
    { onConflict: 'id' }
  );
  return !error;
}

// Verified corridors only — used to build the dynamic SEO sitemap so Google
// discovers our quality-checked pages. Pending/noindex pages are excluded.
export async function listVerifiedCorridors(
  env: AppEnv
): Promise<Array<{ slug: string; generated_at: string }>> {
  const db = client(env, true);
  if (!db) return [];
  const { data, error } = await db
    .from('corridors')
    .select('slug, generated_at')
    .eq('status', 'verified');
  if (error || !data) return [];
  return data as Array<{ slug: string; generated_at: string }>;
}

export async function bumpSearchCount(env: AppEnv, corridorId: string): Promise<void> {
  const db = client(env, true);
  if (!db) return;
  await db.rpc('increment_search_count', { c_id: corridorId }).then(
    () => {},
    () => {}
  );
}
