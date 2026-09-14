// What the dashboard shows, computed in one place.
//
// The admin reads every corridor once and derives everything from that, rather
// than firing a query per card. It also means the list and the metrics can
// never disagree with each other, which matters on a page whose whole job is
// telling you what still needs doing.
import { createClient } from '@supabase/supabase-js';
import type { AppEnv } from './supabase';
import type { CorridorData, Verdict } from './corridor';

const DAY = 86400000;
/** A verdict confirmed longer ago than this is treated as due a re-check. */
export const STALE_DAYS = 60;

export interface AdminCorridor {
  id: string;
  slug: string;
  from: string;
  to: string;
  status: string;
  verdict: Verdict;
  traffic: number;
  /** When a human last confirmed the verdict against an official source. */
  checkedOn: string | null;
  checkedSource: string | null;
  /** Tried and could not verify — waiting on a human with better access. */
  flagged: boolean;
  flaggedNote: string | null;
  ageDays: number;
  stale: boolean;
  feeCount: number;
  /** A non-visa-free route with no fee published yet. */
  needsFee: boolean;
  optionCount: number;
  officialSource: string | null;
  headline: string;
  /** Traffic weighted by how long since anyone looked — what to do next. */
  priority: number;
}

export interface AdminMetrics {
  live: number;
  pending: number;
  lowQuality: number;
  humanVerified: number;
  neverChecked: number;
  flagged: number;
  stale: number;
  withFee: number;
  needsFee: number;
  totalTraffic: number;
  sourceUrls: number;
}

export function adminClient(env: AppEnv) {
  if (!env.PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function loadAdmin(env: AppEnv): Promise<{ rows: AdminCorridor[]; metrics: AdminMetrics } | null> {
  const db = adminClient(env);
  if (!db) return null;
  const { data, error } = await db
    .from('corridors')
    .select('id,slug,status,verdict,data,search_count,generated_at');
  if (error) return null;

  const now = Date.now();
  const rows: AdminCorridor[] = (data ?? []).map((r: any) => {
    const d = (r.data ?? {}) as CorridorData & Record<string, any>;
    const checkedOn = d.verdictCheckedOn ?? null;
    // Fall back to generated_at so a page nobody has reviewed still has an age.
    const since = checkedOn ?? r.generated_at;
    const ageDays = Math.floor((now - new Date(since).getTime()) / DAY);
    const traffic = r.search_count ?? 0;
    const verdict = (d.verdict ?? r.verdict ?? 'embassy') as Verdict;
    return {
      id: r.id,
      slug: r.slug,
      from: r.slug.split('-to-')[0] ?? '',
      to: r.slug.split('-to-')[1] ?? '',
      status: r.status,
      verdict,
      traffic,
      checkedOn,
      checkedSource: d.verdictCheckSource ?? null,
      flagged: !!d.verdictCheckAttempted && !checkedOn,
      flaggedNote: d.verdictCheckNote ?? null,
      ageDays,
      stale: !!checkedOn && ageDays >= STALE_DAYS,
      feeCount: d.fees?.length ?? 0,
      needsFee: !(d.fees?.length ?? 0) && verdict !== 'visa_free',
      optionCount: d.visaOptions?.length ?? 0,
      officialSource: d.officialSource?.url ?? null,
      headline: d.verdictHeadline ?? '',
      // Never-checked pages sort above merely-old ones: an unreviewed verdict is
      // only as good as the model that wrote it.
      priority: traffic * (checkedOn ? ageDays : ageDays + 365),
    };
  });

  const live = rows.filter((r) => r.status === 'verified');
  const urls = new Set<string>();
  for (const r of live) if (r.officialSource) urls.add(r.officialSource);

  const metrics: AdminMetrics = {
    live: live.length,
    pending: rows.filter((r) => r.status === 'pending_review').length,
    lowQuality: rows.filter((r) => r.status === 'low_quality').length,
    humanVerified: live.filter((r) => r.checkedOn).length,
    neverChecked: live.filter((r) => !r.checkedOn).length,
    flagged: live.filter((r) => r.flagged).length,
    stale: live.filter((r) => r.stale).length,
    withFee: live.filter((r) => r.feeCount > 0).length,
    needsFee: live.filter((r) => r.needsFee).length,
    totalTraffic: live.reduce((s, r) => s + r.traffic, 0),
    sourceUrls: urls.size,
  };

  rows.sort((a, b) => b.priority - a.priority);
  return { rows, metrics };
}

export async function getAdminCorridor(env: AppEnv, slug: string) {
  const db = adminClient(env);
  if (!db) return null;
  const { data, error } = await db.from('corridors').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return data as { id: string; slug: string; status: string; verdict: string; data: CorridorData & Record<string, any>; search_count: number; generated_at: string };
}

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
