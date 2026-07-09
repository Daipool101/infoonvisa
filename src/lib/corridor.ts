import { countryBySlug, type Country } from './countries';

// ---- Verdict types ----
export type Verdict = 'visa_free' | 'voa' | 'evisa' | 'eta' | 'embassy';

export const VERDICT_LABEL: Record<Verdict, string> = {
  visa_free: 'Visa-free',
  voa: 'Visa on arrival',
  evisa: 'e-Visa required',
  eta: 'Travel authorization (ETA)',
  embassy: 'Embassy visa required',
};

// Verdicts that are "good news" get the green treatment; others use accent/amber.
export const isGoodVerdict = (v: Verdict) => v === 'visa_free' || v === 'voa';

// ---- Structured content (blocks A–G). This is also the Gemini output schema. ----
export interface Source {
  label: string;
  url: string;
}

export interface VisaOption {
  type: string; // "Tourist e-Visa (single entry)"
  validity?: string; // "90 days from issue"
  maxStay?: string; // "90 days"
  entries?: string; // "Single" | "Multiple"
  eligibility?: string;
  // Fee is OPTIONAL and off by default in the UI (see BUILD_PLAN: accuracy).
  feeApprox?: string; // "approx ¥3,000" — only when a solid source exists
}

export interface DocItem {
  label: string;
  note?: string;
}

export interface ApplyStep {
  text: string;
  link?: Source;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface CorridorData {
  // A. Verdict
  verdict: Verdict;
  verdictHeadline: string; // one-line answer
  summary: string;
  maxStayDays?: number;
  processingTime?: string;
  officialSource: Source;

  // B. Visa details
  visaOptions: VisaOption[];

  // C. Documents
  documents: DocItem[];

  // D. How & where to apply
  applySteps: ApplyStep[];
  applicationCenters?: { name: string; address?: string; bookingUrl?: string }[];

  // F. Things to know + places
  tips: string[];
  bestTimeToVisit?: string;
  topPlaces?: string[];

  // G. FAQ
  faq: FaqItem[];

  // sources used for grounding
  sources: Source[];
}

// ---- Slug helpers: "india-to-japan" <-> countries ----
export interface ParsedCorridor {
  from: Country;
  to: Country;
  slug: string;
  id: string; // "IN-JP"
}

export function parseCorridorSlug(slug: string): ParsedCorridor | null {
  const marker = '-to-';
  const i = slug.indexOf(marker);
  if (i === -1) return null;
  const fromSlug = slug.slice(0, i);
  const toSlug = slug.slice(i + marker.length);
  const from = countryBySlug(fromSlug);
  const to = countryBySlug(toSlug);
  if (!from || !to || from.iso === to.iso) return null;
  return { from, to, slug: `${fromSlug}-to-${toSlug}`, id: `${from.iso}-${to.iso}` };
}

export const corridorSlug = (from: Country, to: Country) => `${from.slug}-to-${to.slug}`;
export const corridorId = (from: Country, to: Country) => `${from.iso}-${to.iso}`;

// Only allow http/https URLs from generated content (blocks javascript:, data:, etc.).
// Returns a safe href string, or null if the URL is unusable/unsafe.
export function safeUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const p = new URL(u.trim());
    if (p.protocol === 'http:' || p.protocol === 'https:') return p.href;
    return null;
  } catch {
    return null;
  }
}

// Freshness window: 90 days. Visa rules change slowly, so a 90-day cache cuts
// regeneration cost ~66% vs 30 days while keeping pages acceptably current.
export const REFRESH_DAYS = 90;
export const isFresh = (generatedAt: string) =>
  Date.now() - new Date(generatedAt).getTime() < REFRESH_DAYS * 24 * 60 * 60 * 1000;
