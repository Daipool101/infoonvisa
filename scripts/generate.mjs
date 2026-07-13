// Batch corridor generator — run from a Gemini-supported region (e.g. your machine).
// Cloudflare's edge is geo-blocked by the free Gemini API, so generation happens here
// and writes straight to Supabase; the Worker only ever READS.
//
// Usage (needs Node 22.6+ for --experimental-strip-types; wired into `npm run generate`):
//   npm run generate                              # generate the default launch list
//   npm run generate -- india-to-japan ...        # generate specific slugs
//   npm run generate -- --verified india-to-japan # also mark verified (indexable)
//   npm run generate -- --force india-to-japan    # regenerate even if already in DB
// By default, routes already in the DB are skipped (saves quota).
//
// Country list + prompt + schema are imported from the SAME source files the site
// uses (src/lib/*), so this script can never drift out of sync with production.

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { COUNTRIES } from '../src/lib/countries.ts';
import { buildPrompt, RESPONSE_SCHEMA } from '../src/lib/gemini.ts';

// ---- env ----
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// ---- slug parsing (built from the shared country list) ----
const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));
function parseSlug(slug) {
  const i = slug.indexOf('-to-');
  if (i === -1) return null;
  const from = BY_SLUG.get(slug.slice(0, i));
  const to = BY_SLUG.get(slug.slice(i + 4));
  if (!from || !to || from.iso === to.iso) return null;
  return { from, to, slug, id: `${from.iso}-${to.iso}` };
}

// ---- default launch list ----
const DEFAULT_ROUTES = [
  'india-to-united-arab-emirates', 'india-to-thailand', 'india-to-singapore', 'india-to-japan',
  'india-to-united-kingdom', 'india-to-united-states', 'india-to-france', 'india-to-germany',
  'india-to-italy', 'india-to-canada', 'india-to-australia', 'india-to-malaysia',
  'india-to-indonesia', 'india-to-vietnam', 'india-to-sri-lanka', 'india-to-nepal',
  'india-to-maldives', 'india-to-turkey', 'india-to-saudi-arabia',
  'united-states-to-france', 'united-kingdom-to-united-states', 'united-states-to-japan',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const markVerified = args.includes('--verified');
  const force = args.includes('--force');
  const routes = args.filter((a) => !a.startsWith('--'));
  const list = routes.length ? routes : DEFAULT_ROUTES;

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';

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
        model, contents: buildPrompt(c.from, c.to),
        config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.2, maxOutputTokens: 8192 },
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
  console.log(`\nDone. ${ok} generated, ${fail} failed, ${skipped} skipped (already in DB). Countries available: ${COUNTRIES.length}.`);
}

main();
