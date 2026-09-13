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

export interface RejectionReason {
  reason: string; // e.g. "Insufficient proof of funds"
  avoid?: string; // short "how to avoid it" tip
}

/**
 * A visa fee we have read on an official government page ourselves.
 *
 * Phase 2 of the fee work. The rule that shapes this type: a wrong fee is worse
 * than no fee, so there is no field for an estimate, a range or a "typically".
 * Either we read the number on the government's own page and record where and
 * when, or the page keeps saying nothing and sends the reader to the source.
 *
 * `verifiedOn` is displayed to the reader. It is deliberately NOT wired into
 * the sitemap's lastmod or into any schema date: those drive recrawl scheduling,
 * and a date that moves whenever we re-check a fee would churn the sitemap
 * without the page having changed for a reader.
 */
export interface VerifiedFee {
  /** visaOption.type this fee belongs to, or '*' for every option on the page. */
  appliesTo: string;
  /** Exactly as the government charges it, in its own currency: "US$30", "Rp 500,000". */
  amount: string;
  /** What the amount covers: "Single entry, tourism". Keep it short. */
  note?: string;
  /**
   * true / false only when the official page says so. null means it is silent —
   * we say that rather than guessing, because "non-refundable" is a claim about
   * the reader's money.
   */
  refundable: boolean | null;
  /**
   * Overrides the Yes/No wording when the government's actual rule is neither.
   * Japan, for example, does not refund the fee — it does not charge it at all
   * unless the visa is issued, which is better news than "No" and different
   * news from "Yes".
   */
  refundableNote?: string;
  /** ISO date we last read the amount on the source below. */
  verifiedOn: string;
  /** The government page the amount was read from — not a summary of it. */
  source: Source;
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

  // Verified fee amounts, added route by route. Absent on most pages.
  fees?: VerifiedFee[];

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

  // Common reasons applications get rejected, with how to avoid them.
  rejectionReasons?: RejectionReason[];

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

// ---- Cost ----
// "How much does it cost" is one of the most common ways people search this
// topic, and we answered none of it. Rather than let the model invent a figure
// — fees vary by visa type, nationality and application channel, and change
// often — we describe WHAT is charged and send the reader to the official page.
// Built here (not in the database) so the page and its FAQ schema stay in sync
// and cost nothing to generate.

export interface CostBreakdown {
  intro: string;
  items: { label: string; note: string }[];
}

export function costBreakdown(verdict: Verdict): CostBreakdown {
  if (verdict === 'visa_free') {
    return {
      intro: 'No visa is required for a short tourist stay, so there is no visa fee to pay.',
      items: [
        { label: 'Visa fee', note: 'None — no visa application is needed for this route.' },
        { label: 'At the border', note: 'You may still be asked for a return ticket, accommodation details and proof of funds.' },
        { label: 'Other charges', note: 'Any airport, departure or tourist taxes are set by the destination and charged separately.' },
      ],
    };
  }
  if (verdict === 'voa') {
    return {
      intro: 'The fee is paid on arrival, and is usually separate from any other charge at the airport.',
      items: [
        { label: 'Government fee', note: 'Paid at the visa-on-arrival counter. The amount depends on your nationality and length of stay.' },
        { label: 'Payment method', note: 'Some counters take cards, others require local currency in cash — check before you fly.' },
        { label: 'Other charges', note: 'Airport or tourist taxes, where they apply, are charged separately.' },
      ],
    };
  }
  if (verdict === 'evisa' || verdict === 'eta') {
    const what = verdict === 'eta' ? 'travel authorisation' : 'e-Visa';
    return {
      intro: `You pay online when you apply. The total is usually the government ${what} fee plus any card or processing charge.`,
      items: [
        { label: 'Government fee', note: `Set by the destination and charged when you submit the ${what} application.` },
        { label: 'Processing / card charge', note: 'Some official portals add a small payment-handling charge on top.' },
        { label: 'Third-party sites', note: 'Unofficial sites charge far more for the same application — always apply on the official portal.' },
      ],
    };
  }
  return {
    intro: 'The consular fee is the charge that matters; anything else depends on how and where you apply.',
    items: [
      { label: 'Government / consular fee', note: 'Set by the embassy or consulate. It varies by visa type, number of entries and your nationality.' },
      { label: 'Courier, SMS & biometrics', note: 'Optional extras such as passport return by courier are billed separately.' },
    ],
  };
}

/**
 * The verified fee for one visa option, if we have one.
 *
 * Matching is by the option's own type string, with '*' as a wildcard for routes
 * where a single fee covers everything. Matching on the type rather than an
 * index means reordering or adding a visa option can never silently attach a
 * fee to the wrong row — it just stops matching, and the page falls back to
 * telling the reader to check the official source.
 */
export function feeFor(optionType: string, fees?: VerifiedFee[]): VerifiedFee | undefined {
  if (!fees?.length) return undefined;
  return fees.find((f) => f.appliesTo === optionType) ?? fees.find((f) => f.appliesTo === '*');
}

/** "2026-09-12" -> "12 September 2026". Returns '' for anything unparseable. */
export function formatVerifiedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Is this visa option the visa-free route itself, rather than a paid visa that
 * happens to sit on the same page?
 *
 * A visa-free page usually lists the exemption AND the real visas you would buy
 * to stay longer — Thailand's page carries the 30-day exemption next to a
 * Tourist Visa (TR) and a Transit Visa. Saying "no fee" against every row on
 * such a page tells readers a TR visa is free, which is exactly the kind of
 * wrong number the fee work is meant to prevent.
 *
 * Matching on wording is imperfect, so the default is the safe one: anything
 * this does not recognise as an exemption falls through to "check the official
 * source" rather than being called free.
 */
export function isExemptionOption(type: string): boolean {
  // Also the phrasings used where the right to enter comes from a treaty rather
  // than from an exemption granted to visitors: Schengen short stays, and EU
  // free movement.
  //
  // Deliberately NOT matched, even though they appear on visa-free pages:
  // Mexico's Forma Migratoria Múltiple and Bhutan's Entry Permit. No visa is
  // needed on either route, but the document itself is charged for, so calling
  // it free would be the wrong number rather than a missing one.
  return /visa[\s-]*(free|exempt)|exemption|no visa required|free(dom of)? movement|short[\s-]*stay/i.test(type);
}

/** "Yes" / "No" / "Not stated by the official source" — never a guess. */
export function refundableLabel(refundable: boolean | null, note?: string): string {
  if (note) return note;
  if (refundable === true) return 'Yes';
  if (refundable === false) return 'No — the fee is not refunded if your application is refused';
  return 'Not stated on the official fee page';
}

// A cost question phrased the way people actually search, added to the page's
// FAQ and its FAQPage schema so search engines and AI assistants can quote it.
export function costFaq(verdict: Verdict, fromDemonym: string, toName: string): { q: string; a: string } {
  if (verdict === 'visa_free') {
    return {
      q: `Is there a visa fee for ${fromDemonym} citizens travelling to ${toName}?`,
      a: `No. ${fromDemonym} citizens do not need a visa for a short tourist stay in ${toName}, so there is no visa fee to pay. You may still be asked at the border for a return ticket, accommodation details and proof of funds, and any airport or tourist taxes are charged separately.`,
    };
  }
  const b = costBreakdown(verdict);
  // "a India visa" reads as broken English. Vowel-initial names take "an" —
  // except U-names, which are pronounced "yu" ("a United Kingdom visa").
  const article = /^[AEIO]/i.test(toName) ? 'an' : 'a';
  return {
    q: `How much does ${article} ${toName} visa cost for ${fromDemonym} citizens?`,
    a: `${b.intro} ${b.items.map((i) => `${i.label}: ${i.note}`).join(' ')} Fees change regularly, so confirm the current amount on the official source linked on this page before you apply.`,
  };
}

// ---- "Does it cover the whole country?" ----
// Copilot cites these pages for city-level questions ("visa requirements US
// citizens Paris France", "…Barcelona Spain", "…Berlin Germany") because the
// destination list already names those places — but nothing on the page tied a
// city to the visa. Readers genuinely believe a "Paris visa" exists. Answering
// that in the FAQ is both a real clarification and the honest way to capture
// those queries, without spinning up thin per-city pages that would duplicate
// the country guide.

/** "Paris (Eiffel Tower, Louvre)" -> "Paris" */
const placeName = (s: string) => s.split(' (')[0].trim();

export function placesFaq(
  verdict: Verdict,
  toName: string,
  topPlaces?: string[]
): { q: string; a: string } | null {
  const places = (topPlaces || []).map(placeName).filter(Boolean);
  if (places.length < 2) return null;
  const shown = places.slice(0, 4);
  const list =
    shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
  // The closing sentence has to match the verdict — telling a visa-free
  // traveller to "apply once" contradicts the rest of the page.
  const free = verdict === 'visa_free';
  const entry = free
    ? `visa-free entry applies to the whole of ${toName}`
    : `a ${toName} visa is valid for the whole country`;
  const closing = free
    ? `Once admitted you can travel anywhere inside ${toName}, up to the permitted length of stay.`
    : `Apply once for ${toName} and you can travel anywhere inside it, up to the permitted length of stay.`;
  return {
    q: `Do I need a separate visa for ${shown[0]}, or does this cover all of ${toName}?`,
    a: `You do not need a separate visa for any individual city. Entry rules are set nationally, not city by city, so ${entry} — including ${list}. ${closing}`,
  };
}

// ---- Page title ----
// Search Console showed the old title ("India to Georgia visa guide —
// requirements, documents & how to apply | InfoOnVisa", 87 chars) losing on two
// counts: it ran past Google's ~60-char cut, and it led with "India to Georgia"
// while the dominant query pattern is "georgia visa for indians" (467
// impressions across 110 queries). Lead with the destination and the demonym,
// drop the brand (Google appends the site name itself), and only add the tail
// when there is room for it.
//
// A visa-free route must not be titled "X Visa for Y Citizens" — that asserts a
// visa is needed. Those use the question form, which is also its own large query
// cluster ("do canadians need a visa for uk", 193 impressions).
const THE_PREFIX = /^(United |Democratic |Republic|Bahamas|Gambia|Netherlands|Philippines|Maldives|Marshall|Solomon|Czech|Ivory|Central African|Dominican|Vatican)/;

export function corridorTitle(verdict: Verdict, toName: string, fromDemonym: string): string {
  const theTo = THE_PREFIX.test(toName) ? `the ${toName}` : toName;
  // An ETA is a travel authorisation, not a visa, so "United Kingdom Visa for
  // Canadian Citizens" would be wrong. The question form is both accurate — the
  // answer is "no visa, but you do need an ETA" — and the exact phrasing of our
  // largest query cluster ("do canadians need a visa for uk", 378 impressions).
  if (verdict === 'visa_free' || verdict === 'eta') {
    return `Do ${fromDemonym} Citizens Need a Visa for ${theTo}?`;
  }
  const base = `${toName} Visa for ${fromDemonym} Citizens`;
  const tail = ': Requirements & Documents';
  return base.length + tail.length <= 62 ? base + tail : base;
}

export function corridorDescription(
  verdictHeadline: string | undefined,
  toName: string,
  fromDemonym: string
): string {
  const theTo = THE_PREFIX.test(toName) ? `the ${toName}` : toName;
  if (!verdictHeadline) {
    return `Visa requirements for ${fromDemonym} citizens travelling to ${theTo} — documents, how to apply and official sources.`;
  }
  // Keep the (unique, per-route) headline first, then only as much tail as fits
  // inside the ~155 characters Google will actually show.
  const tail = ` Documents, steps, fees and official sources for ${fromDemonym} citizens.`;
  return (verdictHeadline + tail).length <= 158 ? verdictHeadline + tail : verdictHeadline;
}

// Freshness window: 90 days. Visa rules change slowly, so a 90-day cache cuts
// regeneration cost ~66% vs 30 days while keeping pages acceptably current.
export const REFRESH_DAYS = 90;
export const isFresh = (generatedAt: string) =>
  Date.now() - new Date(generatedAt).getTime() < REFRESH_DAYS * 24 * 60 * 60 * 1000;
