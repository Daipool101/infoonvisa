// Re-check every live page against the new grounded research pass, and report
// where it disagrees with what is published. Writes nothing to the site.
//
// WHY THIS IS AN AUDIT AND NOT A REGENERATION
//
// The obvious move, once generation is fixed, is to re-run all 128 pages and
// overwrite them. That would be a mistake. It would discard every human
// verification recorded so far, every hand-checked fee, and the corrections
// made by hand over the last month — and it would replace them with fresh
// model output that nobody has read. Trading known-checked text for
// unknown-checked text is not an improvement just because the pipeline got
// better.
//
// So this compares instead. It runs ONLY the research pass — the half that
// reads government pages — extracts the verdict it arrives at, and sets that
// against the verdict on the live page. Where they agree, there is nothing to
// do. Where they differ, a human looks. That is the same shape as the verdict
// audit that found fifteen errors by hand, except the reading is done for you.
//
// Running research alone also halves the cost: the structuring pass is only
// needed when a page is actually being rewritten.
//
//   node scripts/regen-audit.mjs --limit 10            # top 10 by traffic
//   node scripts/regen-audit.mjs --limit 10 --skip 10  # the next 10
//   node scripts/regen-audit.mjs --slug india-to-nepal # one route
//
// Results are appended to audit-regen.md in the project root, so a run can be
// stopped and resumed without losing what it has already learned.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, vertexGenerate, textOf, retrievedUrls, searchTitles } from './lib-vertex.mjs';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const LIMIT = Number(argOf('--limit', 10));
const SKIP = Number(argOf('--skip', 0));
const ONLY = argOf('--slug', null);
const OUT = new URL('../audit-regen.md', import.meta.url);

const env = loadEnv(new URL('../.dev.vars', import.meta.url));
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// This runs on Vertex, not the AI Studio key, and that is not a preference.
// The free Gemini tier allows 20 requests PER DAY per model
// (GenerateRequestsPerDayPerProjectPerModel-FreeTier) — a 128-page audit
// exhausts it in minutes, and the failures arrive mid-run as 429s. Vertex is
// also what the deployed site uses, so auditing through it means auditing the
// pipeline that actually produces pages.
if (!env.GCP_SA_KEY || !env.GCP_PROJECT_ID) {
  console.error(
    'Missing GCP_SA_KEY / GCP_PROJECT_ID in .dev.vars.\n' +
    'This audit runs on Vertex AI, the same credentials the deployed site uses:\n' +
    'the free Gemini API key is capped at 20 requests per day, which this exhausts at once.'
  );
  process.exit(1);
}

// Mirrors src/lib/links.ts OFFICIAL_PORTALS. Read from the TypeScript source so
// the two cannot drift: a stale copy here would seed the model with a dead
// portal and quietly weaken every result.
const portalSrc = readFileSync(new URL('../src/lib/links.ts', import.meta.url), 'utf8');
const PORTALS = {};
{
  const block = portalSrc.slice(portalSrc.indexOf('OFFICIAL_PORTALS'), portalSrc.indexOf('};', portalSrc.indexOf('OFFICIAL_PORTALS')));
  for (const m of block.matchAll(/^\s*'?([a-z-]+)'?:\s*\{[^}]*url:\s*'([^']+)'/gm)) PORTALS[m[1]] = m[2];
}

const NAMES = {};
{
  const src = readFileSync(new URL('../src/lib/countries.ts', import.meta.url), 'utf8');
  for (const m of src.matchAll(/slug:\s*'([a-z-]+)'[^}]*?name:\s*'([^']+)'/g)) NAMES[m[1]] = m[2];
  for (const m of src.matchAll(/name:\s*'([^']+)'[^}]*?slug:\s*'([a-z-]+)'/g)) NAMES[m[2]] ??= m[1];
}
const nameOf = (slug) => NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function researchPrompt(fromSlug, toSlug) {
  const from = nameOf(fromSlug), to = nameOf(toSlug);
  const seeds = [PORTALS[toSlug], PORTALS[fromSlug]].filter(Boolean);
  return `Research the visa rules for a citizen of ${from} holding an ORDINARY ${from}
passport, travelling to ${to} for TOURISM. Report the rules in force NOW.

${seeds.length ? `START by opening these pages and reading them:\n${seeds.map((u) => `  - ${u}`).join('\n')}\n\nThen search for whatever they do not answer.\n` : ''}
WHAT COUNTS AS A SOURCE
Only pages published by a government: the destination's immigration service,
foreign ministry, e-visa portal, embassies, official gazette or regulations, or
the traveller's OWN government's travel advice.

These do NOT count and you must not base any statement on them, however highly
ranked: visa agencies and commercial "e-visa" sites, travel agents, airlines,
comparison sites, insurers, newspapers, blogs, forums, Wikipedia.

THE TRAP TO AVOID
An exception that applies to many travellers is not the rule. If a route is
open only to people holding another country's visa, a residence permit, or a
package, then the rule for an ordinary passport is the OTHER route. State the
rule first; describe the exception as an exception, with its condition.

ALSO CHECK, because this project has been wrong on each of these before:
- Whether the nationality appears on an eligibility LIST. Open the list; look.
- Which COLUMN a figure sits in — tables split by passport type and nationality.
- Whether the rule changed recently, or changes on a known future date.

ANSWER IN EXACTLY THIS SHAPE:
VERDICT: <one of visa_free|voa|evisa|eta|embassy>
CONFIDENCE: <high|medium|low>
WHY: <one sentence>
EVIDENCE: <the government page(s) you read, and what each said>
UNCONFIRMED: <anything you could not settle on a government page, or "none">`;
}

const parse = (text, key) => {
  // Anchored to a line start first. If the model wrapped the label in markdown
  // or ran it into a sentence, fall back to finding it anywhere — two of the
  // first eight routes answered correctly and were scored as failures purely
  // because the label arrived as "**VERDICT**" mid-paragraph.
  const line = text.match(new RegExp(`^[*#>\\-\\s]*${key}\\**\\s*:\\s*\\**\\s*(.+)$`, 'im'));
  if (line) return line[1].replace(/\*+/g, '').trim();
  const any = text.match(new RegExp(`${key}\\**\\s*:?\\s*\\**\\s*([^\\n]+)`, 'i'));
  return any ? any[1].replace(/\*+/g, '').trim() : '';
};

/** Last resort: the answer is in there, just not under a label we recognise. */
const sniffVerdict = (text) => {
  const m = text.match(/\b(visa[_ -]?free|voa|visa on arrival|evisa|e-visa|eta|embassy)\b/i);
  if (!m) return '';
  const w = m[1].toLowerCase().replace(/[ -]/g, '_');
  if (w === 'visa_on_arrival') return 'voa';
  if (w === 'e_visa') return 'evisa';
  return w;
};

// Differences a human has already looked at and decided the live page wins.
// Re-flagging a settled argument on every run buries the unsettled ones.
let ACCEPTED = {};
try {
  ACCEPTED = JSON.parse(readFileSync(new URL('../audit-accepted.json', import.meta.url), 'utf8'));
} catch { /* no decisions recorded yet */ }

let rows = [];
if (ONLY) {
  const r = await db.from('corridors').select('slug,verdict,data,search_count').eq('slug', ONLY);
  rows = r.data ?? [];
} else {
  const r = await db.from('corridors').select('slug,verdict,data,search_count').eq('status', 'verified');
  rows = (r.data ?? []).sort((a, b) => (b.search_count ?? 0) - (a.search_count ?? 0)).slice(SKIP, SKIP + LIMIT);
}
if (!rows.length) { console.error('nothing to audit'); process.exit(1); }

if (!existsSync(OUT)) {
  appendFileSync(OUT, `# Regeneration audit\n\nEach page re-researched against government sources and compared with what is live.\nNothing here has been written to the site.\n\n| route | live | researched | conf | agree |\n|---|---|---|---|---|\n`);
}

console.log(`Auditing ${rows.length} route(s)\n`);
let agree = 0, differ = 0, failed = 0, settledCount = 0;
const disagreements = [];

for (const row of rows) {
  const [fromSlug, toSlug] = row.slug.split('-to-');
  const live = row.data?.verdict ?? row.verdict;
  process.stdout.write(`${row.slug.padEnd(42)} live=${String(live).padEnd(9)} `);
  try {
    const res = await vertexGenerate(env, {
      prompt: researchPrompt(fromSlug, toSlug),
      tools: [{ urlContext: {} }, { googleSearch: {} }],
      // 8192, not 4096. This model thinks before it answers and the thinking is
      // billed against the same cap: at 4096 five of the first eight routes came
      // back with an empty body and finishReason MAX_TOKENS, which the parser
      // reported as "UNPARSED" — a silent failure dressed as a result.
      config: { temperature: 0, maxOutputTokens: 8192 },
    });
    const text = textOf(res);
    const found =
      (parse(text, 'VERDICT').match(/visa_free|voa|evisa|eta|embassy/) || [''])[0] || sniffVerdict(text);
    const conf = (parse(text, 'CONFIDENCE').match(/high|medium|low/i) || ['?'])[0].toLowerCase();
    const why = parse(text, 'WHY');
    const unconfirmed = parse(text, 'UNCONFIRMED');

    const retrieved = retrievedUrls(res);
    const searched = searchTitles(res);

    if (!found) {
      // Say WHY it failed. An empty answer and a refusal are different problems.
      const reason = res?.candidates?.[0]?.finishReason || 'unknown';
      console.log(`-> NO VERDICT (finish=${reason}, ${text.length} chars)`);
      failed++; continue;
    }
    const same = found === live;
    // A recorded decision only covers the exact argument it settled. If the
    // research now says something different again, that is a new finding and
    // the old decision does not cover it.
    const decided = ACCEPTED[row.slug];
    const settled = !same && decided && decided.liveVerdict === live && decided.researchSays === found;

    if (same) agree++;
    else if (settled) settledCount++;
    else differ++;

    console.log(`-> ${found.padEnd(9)} ${conf.padEnd(6)} ${same ? 'agree' : settled ? 'settled earlier' : '*** DIFFERS ***'}`);
    appendFileSync(OUT, `| ${row.slug} | ${live} | ${found} | ${conf} | ${same ? 'yes' : settled ? 'settled' : '**NO**'} |\n`);
    if (!same && !settled) {
      disagreements.push({ slug: row.slug, live, found, conf, why, unconfirmed, retrieved, searched, traffic: row.search_count });
    }
  } catch (e) {
    console.log(`-> ERROR ${String(e.message).slice(0, 80)}`);
    failed++;
  }
}

if (disagreements.length) {
  appendFileSync(OUT, `\n## Disagreements from this run\n\n`);
  for (const d of disagreements) {
    appendFileSync(OUT,
      `### ${d.slug} — live says \`${d.live}\`, research says \`${d.found}\` (${d.conf} confidence, ${d.traffic} searches)\n\n` +
      `**Why:** ${d.why}\n\n**Could not confirm:** ${d.unconfirmed || '—'}\n\n` +
      `**Pages opened directly:** ${d.retrieved.join(', ') || 'none'}\n\n` +
      `**Found by search:** ${d.searched.join(', ') || 'none'}\n\n`);
  }
}

console.log(`\n${agree} agree · ${differ} DIFFER · ${settledCount} settled earlier · ${failed} failed`);
if (differ) console.log(`\nDisagreements (check these by hand):`);
disagreements.sort((a, b) => b.traffic - a.traffic).forEach((d) =>
  console.log(`  ${String(d.traffic).padStart(4)}  ${d.slug.padEnd(42)} ${d.live} -> ${d.found}  (${d.conf})`));
console.log(`\nWritten to audit-regen.md`);
