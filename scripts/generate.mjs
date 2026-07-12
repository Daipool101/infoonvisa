// Batch corridor generator — run from a Gemini-supported region (e.g. your machine).
// Cloudflare's edge is geo-blocked by the free Gemini API, so generation happens here
// and writes straight to Supabase; the Worker only ever READS.
//
// Usage:
//   node scripts/generate.mjs                       # generate the default launch list
//   node scripts/generate.mjs india-to-japan ...    # generate specific slugs
//   node scripts/generate.mjs --verified india-to-japan   # also mark as verified (indexable)
//   node scripts/generate.mjs --force india-to-japan      # regenerate even if already in DB
// By default, routes already in the DB are skipped (saves Gemini quota).
//
// This script is self-contained on purpose (no cloudflare:workers imports).

import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// ---- env ----
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// ---- countries (mirror of src/lib/countries.ts) ----
const COUNTRIES = [
  ['IN', 'India', 'india'], ['JP', 'Japan', 'japan'], ['US', 'United States', 'united-states'],
  ['GB', 'United Kingdom', 'united-kingdom'], ['AE', 'United Arab Emirates', 'united-arab-emirates'],
  ['TH', 'Thailand', 'thailand'], ['SG', 'Singapore', 'singapore'], ['MY', 'Malaysia', 'malaysia'],
  ['ID', 'Indonesia', 'indonesia'], ['VN', 'Vietnam', 'vietnam'], ['LK', 'Sri Lanka', 'sri-lanka'],
  ['NP', 'Nepal', 'nepal'], ['MV', 'Maldives', 'maldives'], ['TR', 'Turkey', 'turkey'],
  ['SA', 'Saudi Arabia', 'saudi-arabia'], ['QA', 'Qatar', 'qatar'], ['FR', 'France', 'france'],
  ['DE', 'Germany', 'germany'], ['IT', 'Italy', 'italy'], ['ES', 'Spain', 'spain'],
  ['CH', 'Switzerland', 'switzerland'], ['NL', 'Netherlands', 'netherlands'], ['CA', 'Canada', 'canada'],
  ['AU', 'Australia', 'australia'], ['NZ', 'New Zealand', 'new-zealand'], ['CN', 'China', 'china'],
  ['HK', 'Hong Kong', 'hong-kong'], ['KR', 'South Korea', 'south-korea'], ['PH', 'Philippines', 'philippines'],
  ['EG', 'Egypt', 'egypt'], ['ZA', 'South Africa', 'south-africa'], ['BR', 'Brazil', 'brazil'],
  ['MX', 'Mexico', 'mexico'], ['RU', 'Russia', 'russia'], ['BD', 'Bangladesh', 'bangladesh'],
  ['PK', 'Pakistan', 'pakistan'],
];
const BY_SLUG = new Map(COUNTRIES.map(([iso, name, slug]) => [slug, { iso, name, slug }]));

function parseSlug(slug) {
  const i = slug.indexOf('-to-');
  if (i === -1) return null;
  const from = BY_SLUG.get(slug.slice(0, i));
  const to = BY_SLUG.get(slug.slice(i + 4));
  if (!from || !to || from.iso === to.iso) return null;
  return { from, to, slug, id: `${from.iso}-${to.iso}` };
}

// ---- default launch list (BUILD_PLAN §12) ----
const DEFAULT_ROUTES = [
  'india-to-united-arab-emirates', 'india-to-thailand', 'india-to-singapore', 'india-to-japan',
  'india-to-united-kingdom', 'india-to-united-states', 'india-to-france', 'india-to-germany',
  'india-to-italy', 'india-to-canada', 'india-to-australia', 'india-to-malaysia',
  'india-to-indonesia', 'india-to-vietnam', 'india-to-sri-lanka', 'india-to-nepal',
  'india-to-maldives', 'india-to-turkey', 'india-to-saudi-arabia',
  'united-states-to-france', 'united-kingdom-to-united-states', 'united-states-to-japan',
];

// ---- Gemini schema (mirror of src/lib/gemini.ts) ----
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ['visa_free', 'voa', 'evisa', 'eta', 'embassy'] },
    verdictHeadline: { type: Type.STRING },
    summary: { type: Type.STRING },
    maxStayDays: { type: Type.INTEGER },
    processingTime: { type: Type.STRING },
    officialSource: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, url: { type: Type.STRING } }, required: ['label', 'url'] },
    visaOptions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, validity: { type: Type.STRING }, maxStay: { type: Type.STRING }, entries: { type: Type.STRING }, eligibility: { type: Type.STRING } }, required: ['type'] } },
    documents: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, note: { type: Type.STRING } }, required: ['label'] } },
    applySteps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, link: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, url: { type: Type.STRING } } } }, required: ['text'] } },
    tips: { type: Type.ARRAY, items: { type: Type.STRING } },
    bestTimeToVisit: { type: Type.STRING },
    topPlaces: { type: Type.ARRAY, items: { type: Type.STRING } },
    faq: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { q: { type: Type.STRING }, a: { type: Type.STRING } }, required: ['q', 'a'] } },
    rejectionReasons: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { reason: { type: Type.STRING }, avoid: { type: Type.STRING } }, required: ['reason', 'avoid'] } },
    sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, url: { type: Type.STRING } }, required: ['label', 'url'] } },
  },
  required: ['verdict', 'verdictHeadline', 'summary', 'officialSource', 'visaOptions', 'documents', 'applySteps', 'faq', 'rejectionReasons', 'sources'],
};

const prompt = (from, to) => `You are a meticulous visa-information researcher. Produce a structured guide for a
citizen of ${from.name} (passport: ${from.name}) travelling to ${to.name} for TOURISM.

HARD RULES — accuracy over completeness:
- Only state visa facts you can attribute to an official government / e-visa source. Put those
  official URLs in "sources" and the single most authoritative one in "officialSource".
- DO NOT invent or guess fees. Omit fee numbers entirely.
- "verdict" must reflect the MAIN requirement for an ORDINARY ${from.name} tourist passport.
- "visaOptions" MUST list EVERY visa category realistically available (tourist single & multiple
  entry, e-Visa/VOA where applicable, transit, business, visiting-relatives), each with type,
  validity, maxStay, entries and "eligibility" (a short "best for…").
- "documents" lists only what applies. "applySteps" are concrete numbered actions with official links.
- "faq" = 4-6 useful corridor-specific Q&A. "tips" = 3-4 short entry/safety/customs tips.
- "rejectionReasons" = 4-6 common reasons a ${from.name} tourist visa for ${to.name} gets REFUSED
  (weak proof of funds, unclear purpose, incomplete/inconsistent docs, weak home-country ties,
  past overstays/refusals, passport validity), each with a short "avoid" tip. General guidance only.
- Be concise and factual. No marketing language.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const markVerified = args.includes('--verified');
  const routes = args.filter((a) => !a.startsWith('--'));
  const list = routes.length ? routes : DEFAULT_ROUTES;

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const force = args.includes('--force');

  // Skip routes already stored (saves quota), unless --force.
  const { data: existing } = await db.from('corridors').select('slug');
  const have = new Set((existing || []).map((r) => r.slug));

  let ok = 0, fail = 0, skipped = 0;
  for (const slug of list) {
    const c = parseSlug(slug);
    if (!c) { console.log(`✗ ${slug} — unknown route`); fail++; continue; }
    if (!force && have.has(slug)) { console.log(`• ${slug} — already in DB, skipped`); skipped++; continue; }
    try {
      const res = await ai.models.generateContent({
        model, contents: prompt(c.from, c.to),
        config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.2 },
      });
      const data = JSON.parse(res.text);
      if (!data.sources?.length || !data.officialSource?.url) throw new Error('no official source');
      const now = new Date();
      const next = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const { error } = await db.from('corridors').upsert({
        id: c.id, from_country: c.from.iso, to_country: c.to.iso, slug: c.slug,
        data, sources: data.sources, verdict: data.verdict,
        max_stay_days: data.maxStayDays ?? null,
        status: markVerified ? 'verified' : 'pending_review',
        generated_at: now.toISOString(), next_refresh_at: next.toISOString(),
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      console.log(`✓ ${slug} — ${data.verdict} (${data.visaOptions.length} visa types)${markVerified ? ' [verified]' : ''}`);
      ok++;
    } catch (e) {
      console.log(`✗ ${slug} — ${(e?.message || e).toString().slice(0, 120)}`);
      fail++;
    }
    await sleep(7000); // stay under free-tier rate limits
  }
  console.log(`\nDone. ${ok} generated, ${fail} failed, ${skipped} skipped (already in DB).`);
}

main();
