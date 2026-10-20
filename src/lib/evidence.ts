// What the model actually read, and whether any of it was a government.
//
// This exists because of a specific discovery. Turning on Google Search
// grounding was supposed to fix generation: instead of answering from memory,
// the model would search, open real pages and report what they said. It does.
// But search returns whatever ranks, and for the query "Saudi e-visa for
// Indian citizens" what ranks is visa agents. A grounded answer about Saudi
// Arabia came back resting on saudievisaonline.com, visadeskglobal.com,
// happyfares.in and an airline's blog, with two government pages among eight.
//
// The model had then written "Official Saudi government sources consulted
// include: the Ministry of Foreign Affairs, as referenced by TATA AIG and The
// Times of India" — an insurance company standing in for a ministry. That is
// worse than the old failure, not better: ungrounded guesses at least did not
// arrive wearing citations.
//
// Telling the model "government sources only" does not control what search
// hands it. So the check cannot live in the prompt. It lives here, on the way
// out, over the list of pages the API says were actually retrieved.
import type { Source } from './corridor';

/**
 * Is this an official government / immigration authority source?
 *
 * Not a whitelist of every government on earth — that list does not exist in a
 * usable form — but the domain shapes governments actually use, plus the
 * handful of real immigration authorities that sit on ordinary domains.
 */
export function isGovernmentUrl(url?: string): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    /(^|\.)gov(\.[a-z]{2,3})*$/.test(host) || // gov.uk, .gov.sg, .gov.eg, .gov
    /\.go\.[a-z]{2}$/.test(host) || // .go.th, .go.kr, .go.id
    /(^|\.)gob\.[a-z]{2}$/.test(host) || // .gob.mx
    /(^|\.)gouv\.[a-z]{2}$/.test(host) || // .gouv.fr
    /(^|\.)govt\.[a-z]{2}$/.test(host) || // .govt.nz
    host === 'u.ae' ||
    host.endsWith('.u.ae') ||
    host.endsWith('.admin.ch') ||
    host.endsWith('.gc.ca') ||
    host === 'canada.ca' ||
    host.endsWith('.canada.ca') ||
    host === 'europa.eu' ||
    host.endsWith('.europa.eu') ||
    // Immigration authorities and official visa systems that are genuinely
    // government-run but do not carry a government-shaped domain. Each one is
    // here because a correctly sourced page was otherwise being held back.
    host === 'irishimmigration.ie' ||
    host.endsWith('.irishimmigration.ie') ||
    host === 'ind.nl' ||
    host.endsWith('.ind.nl') ||
    host === 'swiss-visa.ch' ||
    host.endsWith('.swiss-visa.ch') ||
    host === 'visitsaudi.com' ||
    host.endsWith('.visitsaudi.com') || // Saudi Tourism Authority
    host === 'bhutan.travel' || // Bhutan Department of Tourism
    host.endsWith('.esteri.it') ||
    host === 'auswaertiges-amt.de' ||
    host.endsWith('.auswaertiges-amt.de') ||
    host === 'france-visas.gouv.fr' ||
    host === 'netherlandsworldwide.nl' ||
    host.endsWith('.netherlandsworldwide.nl')
  );
}

/** A page the model says it actually retrieved while researching. */
export interface EvidenceSource {
  /** Domain or page title as the API reported it. */
  title: string;
  /** The URL, where the API gave us a real one rather than a redirect stub. */
  url?: string;
  government: boolean;
  /**
   * A visa agent, insurer, airline, aggregator or similar — a site with an
   * interest in the answer. Present only when true, and never on a government
   * domain. Nothing is published on one; it is recorded so a reviewer can see
   * what the research actually rested on.
   */
  commercial?: boolean;
  /** 'url' = we handed it this page to read. 'search' = search found it. */
  via: 'url' | 'search';
}

export interface Evidence {
  /** ISO date the research ran. */
  researchedOn: string;
  sources: EvidenceSource[];
  /** How many of them were governments. Zero means nothing here is official. */
  governmentCount: number;
}

/**
 * The URLs the API confirmed it fetched — `via: 'url'` entries that kept a real
 * address rather than an expiring grounding redirect stub.
 *
 * This is the only list of URLs in the pipeline that the model cannot have
 * invented, which is why the structuring pass is given it and told to cite
 * nothing else.
 */
export function retrievedUrls(evidence: Evidence): string[] {
  return evidence.sources
    .filter((s) => s.via === 'url' && s.url)
    .map((s) => s.url as string);
}

/**
 * Domains that must never count as evidence, whatever else is true of them.
 *
 * Visa agents are the dangerous entry on this list. They rank well, they look
 * governmental, they are frequently out of date, and their business model is
 * charging people for a form they could file themselves. An answer resting on
 * one is not merely unsourced, it is sourced to someone with an interest.
 */
const NEVER_EVIDENCE =
  /(^|\.)(wikipedia\.org|blogspot\.|medium\.com|quora\.com|tripadvisor\.|reddit\.com)$|visa(online|desk|hq|central|guide|express)|evisa[a-z]*\.(com|net|org)|ivisa|travelvisa|fares?\.|airlines?\.|indiatimes|timesofindia|tataaig|policybazaar/i;

export function classifySource(titleOrUrl: string, via: 'url' | 'search'): EvidenceSource {
  const raw = (titleOrUrl || '').trim();
  let host = raw;
  let url: string | undefined;
  try {
    const u = new URL(raw);
    host = u.hostname;
    url = u.toString();
  } catch {
    // Grounding metadata often gives a bare domain as the "title".
    host = raw.replace(/^www\./i, '');
  }
  // A government URL is judged on the URL; a bare domain is judged as a host.
  //
  // The blocklist used to veto this, and must not: the name patterns it looks
  // for occur inside real state domains. `indianvisaonline.gov.in` is India's
  // own national visa portal and contains the substring "visaonline", so it
  // was being classed as a commercial visa agent and thrown away as evidence.
  // A government domain is registry-controlled and cannot be an agent, so the
  // government test now stands on its own.
  //
  // Nothing is lost by that: a blocked host that is not governmental already
  // failed this test, so the veto only ever removed correct answers. The
  // blocklist keeps its real job below — naming a source as commercial, so a
  // reviewer can see at a glance that a page rests on an agent or an insurer.
  const government = isGovernmentUrl(url ?? `https://${host}`);
  const commercial = !government && NEVER_EVIDENCE.test(host);
  return { title: host, ...(url ? { url } : {}), government, ...(commercial ? { commercial } : {}), via };
}

export function buildEvidence(
  retrievedUrls: string[],
  searchTitles: string[],
  researchedOn = new Date().toISOString()
): Evidence {
  const seen = new Set<string>();
  const sources: EvidenceSource[] = [];
  const add = (s: EvidenceSource) => {
    if (seen.has(s.title)) return;
    seen.add(s.title);
    sources.push(s);
  };
  for (const u of retrievedUrls) add(classifySource(u, 'url'));
  for (const t of searchTitles) add(classifySource(t, 'search'));
  return {
    researchedOn,
    sources,
    governmentCount: sources.filter((s) => s.government).length,
  };
}

/**
 * May a page built on this evidence publish itself?
 *
 * The old gate asked whether the page CITED a government URL, which a model
 * could satisfy by recalling one. This asks whether a government page was
 * actually retrieved during research, which it cannot fake: the list comes
 * from the API, not from the model's prose.
 */
/**
 * Which country a government domain belongs to, as ISO 3166-1 alpha-2, or null
 * when it cannot be told. Deliberately conservative: it answers only for the
 * shapes it is sure about, because a wrong answer here holds a good page back.
 */
export function govCountryOf(url?: string): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // A bare .gov, with no country suffix, is the United States.
  if (/(^|\.)gov$/.test(host)) return 'us';
  const m =
    host.match(/(^|\.)(?:gov|go|gob|gouv|govt)\.([a-z]{2})$/) ??
    host.match(/(^|\.)gc\.(ca)$/);
  if (m) return m[2];
  if (host === 'canada.ca' || host.endsWith('.canada.ca')) return 'ca';
  if (host === 'u.ae' || host.endsWith('.u.ae')) return 'ae';
  if (host.endsWith('.admin.ch')) return 'ch';
  return null;
}

/**
 * `fromIso`/`toIso` are the corridor's endpoints, used for one check only: the
 * traveller's OWN government is a legitimate source but is never the official
 * source for someone else's visa.
 *
 * Research routinely fails to reach a small destination's immigration site and
 * comes back holding the origin's portal instead — `indianvisaonline.gov.in`,
 * which is India's page for foreigners entering India, offered as the official
 * source for an Indian travelling to Panama. It is a government domain, so
 * every other test here passes it. Holding those for review costs a click;
 * publishing them sends a reader to a page that cannot help them.
 */
export function evidenceIsPublishable(
  evidence?: Evidence,
  officialSource?: Source,
  fromIso?: string,
  toIso?: string
): boolean {
  if (!evidence) return false;
  if (!isGovernmentUrl(officialSource?.url)) return false;

  if (fromIso && toIso && fromIso.toLowerCase() !== toIso.toLowerCase()) {
    const owner = govCountryOf(officialSource?.url);
    if (owner && owner === fromIso.toLowerCase()) return false;
  }

  // One government page among eight is not reassuring when the other seven are
  // a comparison site, an insurer, an airline and a newspaper — which is
  // literally what search returned for Saudi Arabia. So either we handed the
  // model the official portal and it successfully read it, or at least two
  // independent government pages were retrieved. A single search hit that
  // happens to be governmental is not enough to publish on.
  const seededGov = evidence.sources.some((s) => s.government && s.via === 'url');
  return seededGov || evidence.governmentCount >= 2;
}
