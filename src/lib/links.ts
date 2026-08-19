import type { CorridorData, Source } from './corridor';
import { safeUrl } from './corridor';

// ---------------------------------------------------------------------------
// Source-link hygiene.
//
// The model writes URLs from memory, which rots in two distinct ways:
//   1. The domain is decommissioned  (molina.imigrasi.go.id -> DNS gone)
//   2. The path is invented or stale (visaforchina.cn/DEL2_EN/ -> wrong centre)
//
// Fetch-checking catches (1) and any honest 404. It CANNOT catch (2) on
// JS-rendered sites, which return HTTP 200 for every path and only show the
// error client-side. So we combine three defences:
//   - a curated map of known-good official portals (highest trust)
//   - path normalisation for the patterns the model hallucinates
//   - a live fetch check, with a deliberately conservative drop policy
// ---------------------------------------------------------------------------

/** Curated official immigration/e-visa portals, keyed by destination country slug.
 *  These are hand-verified and always win over whatever the model produced for
 *  `officialSource`. Add entries as they are confirmed working. */
export const OFFICIAL_PORTALS: Record<string, Source> = {
  indonesia: { label: 'Directorate General of Immigration — official e-Visa portal', url: 'https://evisa.imigrasi.go.id/' },
  china: { label: 'Chinese Visa Application Service Centre', url: 'https://www.visaforchina.cn/' },
  india: { label: 'Indian Visa Online (Bureau of Immigration)', url: 'https://indianvisaonline.gov.in/' },
  japan: { label: 'Ministry of Foreign Affairs of Japan — visa information', url: 'https://www.mofa.go.jp/' },
  thailand: { label: 'Thailand e-Visa (Ministry of Foreign Affairs)', url: 'https://www.thaievisa.go.th/' },
  singapore: { label: 'Immigration & Checkpoints Authority (ICA)', url: 'https://www.ica.gov.sg/' },
  'united-arab-emirates': { label: 'UAE Government portal — visas', url: 'https://u.ae/' },
  'united-kingdom': { label: 'UK Government — visas and immigration', url: 'https://www.gov.uk/browse/visas-immigration' },
  'united-states': { label: 'U.S. Department of State — Bureau of Consular Affairs', url: 'https://travel.state.gov/' },
  australia: { label: 'Australian Department of Home Affairs — Immigration', url: 'https://immi.homeaffairs.gov.au/' },
  canada: { label: 'Immigration, Refugees and Citizenship Canada', url: 'https://www.canada.ca/en/services/immigration-citizenship.html' },
  'new-zealand': { label: 'Immigration New Zealand', url: 'https://www.immigration.govt.nz/' },
  vietnam: { label: 'Vietnam National e-Visa portal', url: 'https://evisa.xuatnhapcanh.gov.vn/' },
  'sri-lanka': { label: 'Sri Lanka Department of Immigration and Emigration', url: 'https://www.immigration.gov.lk/' },
  maldives: { label: 'Maldives Immigration', url: 'https://www.immigration.gov.mv/' },
  malaysia: { label: 'Malaysian Immigration Department', url: 'https://www.imi.gov.my/' },
  turkey: { label: 'Republic of Türkiye — Ministry of Foreign Affairs', url: 'https://www.mfa.gov.tr/' },
  switzerland: { label: 'Switzerland — official visa system', url: 'https://www.swiss-visa.ch/' },
  germany: { label: 'German Federal Foreign Office — visa service', url: 'https://www.auswaertiges-amt.de/en/visa-service' },
  france: { label: 'France-Visas — official French visa portal', url: 'https://france-visas.gouv.fr/' },
  italy: { label: 'Italy — Visa for Italy (Ministry of Foreign Affairs)', url: 'https://vistoperitalia.esteri.it/' },
  spain: { label: 'Spain — Ministry of Foreign Affairs', url: 'https://www.exteriores.gob.es/' },
  netherlands: { label: 'Netherlands — official government information', url: 'https://www.netherlandsworldwide.nl/' },
  mexico: { label: 'Mexico — Secretaría de Relaciones Exteriores', url: 'https://consulmex.sre.gob.mx/' },
  jamaica: { label: 'Passport, Immigration & Citizenship Agency (PICA)', url: 'https://www.pica.gov.jm/' },
  georgia: { label: 'Georgia — Ministry of Foreign Affairs', url: 'https://www.mfa.gov.ge/' },
  bhutan: { label: 'Bhutan — Department of Immigration', url: 'https://www.doi.gov.bt/' },
  egypt: { label: 'Egypt e-Visa portal', url: 'https://visa2egypt.gov.eg/' },
  nepal: { label: 'Nepal Department of Immigration', url: 'https://www.immigration.gov.np/' },
  russia: { label: 'Russia — Consular Department, Ministry of Foreign Affairs', url: 'https://www.kdmid.ru/' },
  azerbaijan: { label: 'Azerbaijan ASAN Visa (e-Visa)', url: 'https://evisa.gov.az/' },
  pakistan: { label: 'Pakistan Online Visa System (NADRA)', url: 'https://visa.nadra.gov.pk/' },
};

/** Path segments the model invents: visa-centre / locale codes such as
 *  "DEL2_EN", "SHA_EN", "BLR_CN". These 404 client-side while the server
 *  happily returns 200, so they must be stripped by pattern, not by fetch. */
const JUNK_SEGMENT = /^[A-Z]{2,5}\d{0,2}_[A-Z]{2}$/;

/** Strip hallucination-prone segments from a URL's path. */
export function normalizeUrl(raw: string): string {
  const safe = safeUrl(raw);
  if (!safe) return raw;
  try {
    const u = new URL(safe);
    const segs = u.pathname.split('/').filter(Boolean);
    const kept = segs.filter((s) => !JUNK_SEGMENT.test(s));
    if (kept.length !== segs.length) {
      u.pathname = kept.length ? `/${kept.join('/')}/` : '/';
      u.search = '';
      u.hash = '';
    }
    return u.href;
  } catch {
    return safe;
  }
}

/** The bare origin of a URL, e.g. https://example.gov.uk/ */
export function originOf(raw: string): string | null {
  const safe = safeUrl(raw);
  if (!safe) return null;
  try {
    return new URL(safe).origin + '/';
  } catch {
    return null;
  }
}

// 'unreachable' means the request could not be made at all — DNS failure,
// refused connection, TLS handshake failure. It is kept separate from
// 'dead-host' because on Cloudflare Workers, where generation runs, a DNS
// failure throws a generic error with no error code, so it is indistinguishable
// from a TLS quirk. Treating it as dead outright would delete valid links from
// the handful of government sites with broken certificate chains.
export type LinkVerdict = 'alive' | 'dead-path' | 'dead-host' | 'unreachable';

/** Hosts sitting behind bot protection that answers with misleading status
 *  codes — visa.vfsglobal.com returns 403 from one network and 404 from
 *  another for the very same page, and consulmex.sre.gob.mx serves a Radware
 *  challenge as a 404. Their HTTP status carries no information about whether
 *  the page exists, so we never judge them broken on the strength of it. */
const UNVERIFIABLE_HOSTS = [
  'visa.vfsglobal.com',
  'vfsglobal.com',
  'consulmex.sre.gob.mx',
];
const isUnverifiable = (url: string): boolean => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return UNVERIFIABLE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

const UA = 'Mozilla/5.0 (compatible; InfoOnVisaLinkCheck/1.0; +https://infoonvisa.com)';

/**
 * Check a single URL. The drop policy is deliberately conservative: many
 * government sites block automated clients (403) or fail TLS negotiation
 * against non-browser stacks, yet work perfectly for real visitors. Only a
 * definitive 404/410, or a domain that does not resolve, counts as broken.
 */
export async function checkUrl(url: string, timeoutMs = 8000): Promise<LinkVerdict> {
  if (isUnverifiable(url)) return 'alive'; // status code proves nothing here
  const headers = { 'user-agent': UA };
  const run = (method: string, ms: number) =>
    fetch(url, { method, redirect: 'follow', headers, signal: AbortSignal.timeout(ms) });
  try {
    let res = await run('HEAD', timeoutMs);
    // Many servers mishandle HEAD — mfa.gov.tr answers 404 to HEAD and 200 to
    // GET — so never trust a HEAD failure. Always confirm with a real GET.
    if (res.status >= 400) res = await run('GET', timeoutMs + 4000);
    if (res.status === 404 || res.status === 410) return 'dead-path';
    return 'alive'; // includes 2xx/3xx, and 401/403/5xx which we do not trust as "broken"
  } catch (err: any) {
    const code = String(err?.cause?.code || err?.name || '');
    // Node gives us the reason; a non-resolving domain is decommissioned.
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dead-host';
    if (code === 'TimeoutError' || code === 'AbortError') return 'alive'; // slow, not gone
    // Workers gives no code. We could not connect, but we cannot tell a dead
    // domain from a certificate problem, so say so and let the caller decide.
    return 'unreachable';
  }
}

/**
 * Resolve a URL to the best working form:
 *   normalise -> check -> on 404 fall back to the bare origin -> else drop.
 * Returns null when the link cannot be salvaged.
 */
export async function resolveUrl(raw: string, timeoutMs = 8000): Promise<string | null> {
  const url = normalizeUrl(raw);
  if (!safeUrl(url)) return null;
  let verdict = await checkUrl(url, timeoutMs);
  // Government sites are flaky: several return a one-off 404 and are fine on
  // the next request. Never act on a single bad result — confirm it first.
  if (verdict !== 'alive') verdict = await checkUrl(url, timeoutMs);
  if (verdict === 'alive') return url;
  if (verdict === 'dead-host') return null; // origin shares the dead host
  // Twice unreachable: hand it back as unusable so a curated portal can take
  // over, rather than publishing a link nobody can open. This is what let
  // molina.imigrasi.go.id — a domain that has not resolved for weeks — be
  // saved as Indonesia's official source from the Workers runtime.
  if (verdict === 'unreachable') return null;
  const origin = originOf(url);
  if (!origin || origin === url) return null;
  return (await checkUrl(origin, timeoutMs)) === 'alive' ? origin : null;
}

export interface LinkFixReport {
  checked: number;
  rewritten: number;
  dropped: number;
  notes: string[];
}

/**
 * Verify and repair every source link on a corridor before it is saved.
 * `officialSource` is additionally pinned to the curated portal for the
 * destination when we have one, since that link is the page's main call to
 * action and must not depend on the model's memory.
 */
export async function sanitizeCorridorLinks(
  data: CorridorData,
  toSlug?: string
): Promise<{ data: CorridorData; report: LinkFixReport }> {
  const report: LinkFixReport = { checked: 0, rewritten: 0, dropped: 0, notes: [] };

  // Resolve each distinct URL once — corridors reuse the same links a lot.
  const unique = new Set<string>();
  const collect = (u?: string) => { const s = safeUrl(u); if (s) unique.add(s); };
  collect(data.officialSource?.url);
  (data.sources || []).forEach((s) => collect(s.url));
  (data.applySteps || []).forEach((s) => collect(s.link?.url));

  const resolved = new Map<string, string | null>();
  // Each check costs 1-2 subrequests; cap so one page can never exhaust the
  // Worker's subrequest budget. Anything beyond the cap is left untouched.
  const toCheck = [...unique].slice(0, 14);
  await Promise.all(
    toCheck.map(async (u) => {
      const r = await resolveUrl(u);
      resolved.set(u, r);
      report.checked++;
      if (r === null) { report.dropped++; report.notes.push(`dropped ${u}`); }
      else if (r !== u) { report.rewritten++; report.notes.push(`${u} -> ${r}`); }
    })
  );
  const fix = (u?: string): string | null => {
    const s = safeUrl(u);
    if (!s) return null;
    const v = resolved.get(s);
    return v === undefined ? s : v; // beyond the cap => left as-is, never dropped
  };

  // Distinct deep links can collapse onto the same origin, so dedupe after fixing.
  const seen = new Set<string>();
  const sources = (data.sources || [])
    .map((s) => ({ ...s, url: fix(s.url) }))
    .filter((s): s is Source => !!s.url)
    .filter((s) => !seen.has(s.url) && seen.add(s.url));

  const applySteps = (data.applySteps || []).map((step) => {
    if (!step.link?.url) return step;
    const url = fix(step.link.url);
    return url ? { ...step, link: { ...step.link, url } } : { ...step, link: undefined };
  });

  // Official source: keep the model's own link when it verifies — a working
  // deep link ("…/electronic-travel-authority-601") is far more useful than a
  // homepage. The curated portal is the safety net for when it does not.
  const curated = toSlug ? OFFICIAL_PORTALS[toSlug] : undefined;
  const ownUrl = fix(data.officialSource?.url);
  const officialSource: Source | undefined = ownUrl
    ? { ...data.officialSource, url: ownUrl }
    : curated
      ? { ...curated }
      : sources[0];

  // Dropping every dead source can empty the list while officialSource still
  // stands (it may come from the curated map). Never leave a page citing nothing.
  const finalSources =
    sources.length || !officialSource?.url ? sources : [{ ...officialSource } as Source];

  return {
    data: { ...data, officialSource: officialSource as Source, sources: finalSources, applySteps },
    report,
  };
}
