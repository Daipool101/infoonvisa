import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as cfEnv } from 'cloudflare:workers';
import type { CorridorData, Source, Verdict } from './corridor';
import { REFRESH_DAYS } from './corridor';
import { SEED } from './seed';
import { evidenceIsPublishable, type Evidence } from './evidence';
import { ADSENSE_CLIENT } from './adsense';

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
  // Secret that gates forced regeneration via /api/generate (admin backfills).
  REGEN_KEY: string;
  // Local development only — see admin-auth.ts. Never set in production.
  ADMIN_DEV_BYPASS: string;
  // Cloudflare Access, guarding /admin. Absent = the dashboard 404s, which is
  // the safe default: a missing variable must lock the door, never open it.
  ADMIN_ACCESS_TEAM_DOMAIN: string; // e.g. yourteam.cloudflareaccess.com
  ADMIN_ACCESS_AUD: string; // Application Audience (AUD) tag from Access
}

// Accessing the cloudflare env proxy can throw during prerender/build — guard it.
function cf(key: string): string | undefined {
  try {
    return (cfEnv as Record<string, any> | undefined)?.[key];
  } catch {
    return undefined;
  }
}

// Build-time fallback, limited to values that are public by definition.
//
// These MUST be written as individual `import.meta.env.NAME` references. Taking
// the object as a whole — `const ime = import.meta.env` — makes Vite materialise
// every key it knows about into the bundle, and with a .dev.vars present that
// baked the service-role key, the Gemini key and the GCP service account
// straight into dist/. CI never had that file so its builds were clean, but
// `npm run deploy` runs locally and would have shipped them inside the Worker.
//
// Naming each key keeps the substitution static and auditable: what is listed
// here is all that can ever reach the bundle.
const PUBLIC_FALLBACK: Record<string, string | undefined> = {
  PUBLIC_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
  // Falls back to the literal in adsense.ts. An env var has to survive
  // GitHub Actions, Vite's inlining and the Cloudflare adapter to get here,
  // and on the prerendered blog it did not — while every SSR page, which
  // reads the Cloudflare secret at runtime, was fine. The constant cannot
  // fail that way, and a Cloudflare secret still overrides it.
  PUBLIC_ADSENSE_CLIENT: import.meta.env.PUBLIC_ADSENSE_CLIENT || ADSENSE_CLIENT,
};

export function getEnv(): AppEnv {
  // Everything else comes only from the Cloudflare env: real secrets in
  // production, and .dev.vars through the adapter's platformProxy in local dev.
  // An EMPTY value counts as absent, not as a setting. `??` alone falls
  // through only on null/undefined, so a blank line in .dev.vars —
  // `PUBLIC_ADSENSE_CLIENT=` — used to win over the build-time fallback and
  // silently disable the thing it was meant to configure. That is how the
  // prerendered blog ended up with no ad code while every server-rendered
  // page had it: nothing errored, the value was simply "".
  const pick = (k: string) => {
    const fromCf = cf(k);
    if (fromCf !== undefined && fromCf !== '') return fromCf;
    return PUBLIC_FALLBACK[k] || '';
  };
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
    REGEN_KEY: pick('REGEN_KEY'),
    ADMIN_ACCESS_TEAM_DOMAIN: pick('ADMIN_ACCESS_TEAM_DOMAIN'),
    ADMIN_ACCESS_AUD: pick('ADMIN_ACCESS_AUD'),
    ADMIN_DEV_BYPASS: pick('ADMIN_DEV_BYPASS'),
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

// Decide whether a freshly generated page can auto-publish.
//
// The old gate asked whether the page CITED a government URL. That is a test a
// model passes by recalling one, and it is how a page claiming Indians may use
// Saudi Arabia's tourist e-Visa went live: it cited mofa.gov.sa, a perfectly
// real ministry homepage that says nothing whatever about Indians. The link
// checker confirmed the URL loaded. Nothing asked whether it supported the
// claim, because nothing could.
//
// The gate now asks whether a government page was actually RETRIEVED while the
// page was being researched. That list comes from the generation API's own
// record of what it fetched, so the model cannot satisfy it by naming a
// ministry it never opened. A page researched entirely off visa agents and
// newspapers - which is what search returns for these queries - is held for
// review instead of publishing itself.
function autoStatus(data: CorridorData): CorridorStatus {
  const evidence = (data as Record<string, unknown>).evidence as Evidence | undefined;
  return evidenceIsPublishable(evidence, data.officialSource) ? 'verified' : 'pending_review';
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
  // Preserve a human-decided status on regeneration/refresh: a page already
  // reviewed (verified) or rejected (low_quality) keeps that status, so a
  // refresh never silently drops a verified page out of the sitemap. Only
  // brand-new pages get the auto-publish gate.
  const { data: prev } = await db.from('corridors').select('status').eq('id', row.id).maybeSingle();
  const status =
    prev?.status === 'verified' || prev?.status === 'low_quality'
      ? prev.status
      : autoStatus(row.data);
  const { error } = await db.from('corridors').upsert(
    {
      ...row,
      sources: row.data.sources,
      verdict: row.data.verdict,
      max_stay_days: row.data.maxStayDays ?? null,
      status,
      generated_at: now.toISOString(),
      next_refresh_at: next.toISOString(),
    },
    { onConflict: 'id' }
  );
  return !error;
}

// Verified corridors only — used for the dynamic SEO sitemap, the related-routes
// module and the /from/[country] hub pages. Pending/noindex pages are excluded.
export interface CorridorSummary {
  slug: string;
  generated_at: string;
  from_country: string; // ISO
  to_country: string; // ISO
  verdict: Verdict;
  max_stay_days: number | null;
}

export async function listVerifiedCorridors(env: AppEnv): Promise<CorridorSummary[]> {
  const db = client(env, true);
  if (!db) return [];
  const { data, error } = await db
    .from('corridors')
    .select('slug, generated_at, from_country, to_country, verdict, max_stay_days')
    .eq('status', 'verified');
  if (error || !data) return [];
  return data as CorridorSummary[];
}

export async function bumpSearchCount(env: AppEnv, corridorId: string): Promise<void> {
  const db = client(env, true);
  if (!db) return;
  await db.rpc('increment_search_count', { c_id: corridorId }).then(
    () => {},
    () => {}
  );
}
