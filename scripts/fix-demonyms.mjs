// Repair traveller wording on stored corridor pages.
//
// The generation prompt used to demonstrate the pattern "${from.name} citizens",
// which taught the model to write "India citizens need a visa" as the page H1.
// The correct form is the demonym: "Indian citizens". The prompt is fixed, but
// pages generated before that keep the old wording.
//
// This is a pure text repair — no AI call, no cost, and page facts are untouched.
// Only phrases naming the ORIGIN country are rewritten.
//
//   node scripts/fix-demonyms.mjs           # dry run: show what would change
//   node scripts/fix-demonyms.mjs --write   # apply
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const WRITE = process.argv.includes('--write');

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// countries.ts stores rows as: ['IN', 'India', 'india', 'Indian'],
const COUNTRY = {};
const ROW = /\['([A-Z]{2})',\s*'((?:[^'\\]|\\.)*)',\s*'([^']+)',\s*'((?:[^'\\]|\\.)*)'\]/g;
for (const m of readFileSync(new URL('../src/lib/countries.ts', import.meta.url), 'utf8').matchAll(ROW)) {
  COUNTRY[m[3]] = { name: m[2].replace(/\\'/g, "'"), demonym: m[4].replace(/\\'/g, "'") };
}
console.log(`loaded ${Object.keys(COUNTRY).length} countries`);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrite origin-country phrasing into the demonym form. */
function fixText(text, c) {
  if (!text || c.name === c.demonym) return text;
  const n = esc(c.name);
  const d = c.demonym;
  return (
    text
      // "Citizens of India" / "citizens of India" -> "Indian citizens"
      .replace(new RegExp(`\\bCitizens of ${n}\\b`, 'g'), `${d} citizens`)
      .replace(new RegExp(`\\bcitizens of ${n}\\b`, 'g'), `${d.toLowerCase()} citizens`)
      .replace(new RegExp(`\\bNationals of ${n}\\b`, 'g'), `${d} nationals`)
      .replace(new RegExp(`\\bnationals of ${n}\\b`, 'g'), `${d.toLowerCase()} nationals`)
      // "India citizens" -> "Indian citizens" (also citizen/national/passport holder/traveller)
      .replace(new RegExp(`\\b${n} (citizens?|nationals?|passport holders?|travellers?|travelers?|tourists?)\\b`, 'g'),
        (_, w) => `${d} ${w}`)
      // "an India passport" -> "an Indian passport"
      .replace(new RegExp(`\\b${n} (passports?)\\b`, 'g'), (_, w) => `${d} ${w}`)
  );
}

/**
 * Fix article agreement ONLY where our own swap could have broken it, i.e.
 * directly before the demonym we inserted. A blanket a/an pass would corrupt
 * correct English elsewhere ("a European" -> "an European", "an hour" -> "a hour").
 */
function fixArticles(text, c) {
  if (!text || c.name === c.demonym) return text;
  const d = esc(c.demonym);
  const wanted = /^[AEIOU]/i.test(c.demonym) ? 'an' : 'a';
  return text.replace(new RegExp(`\\b(a|an|A|An) (${d})\\b`, 'g'), (_, art, dem) => {
    const fixed = art[0] === art[0].toUpperCase() ? wanted[0].toUpperCase() + wanted.slice(1) : wanted;
    return `${fixed} ${dem}`;
  });
}

const { data: rows, error } = await db.from('corridors').select('id, slug, data');
if (error) { console.error('DB error:', error.message); process.exit(1); }

let changed = 0;
const updates = [];
for (const r of rows) {
  const c = COUNTRY[r.slug.split('-to-')[0]];
  if (!c) continue;
  const d = r.data || {};

  const headline = fixArticles(fixText(d.verdictHeadline, c), c);
  const summary = fixArticles(fixText(d.summary, c), c);
  const faq = (d.faq || []).map((f) => ({
    ...f,
    q: fixArticles(fixText(f.q, c), c),
    a: fixArticles(fixText(f.a, c), c),
  }));

  if (headline === d.verdictHeadline && summary === d.summary &&
      JSON.stringify(faq) === JSON.stringify(d.faq || [])) continue;

  changed++;
  if (headline !== d.verdictHeadline) {
    console.log(`~ ${r.slug}`);
    console.log(`    was: ${d.verdictHeadline}`);
    console.log(`    now: ${headline}`);
  }
  updates.push({ id: r.id, data: { ...d, verdictHeadline: headline, summary, faq } });
}

console.log(`\n${changed} of ${rows.length} pages need wording fixes`);
if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write to apply.'); process.exit(0); }

let ok = 0;
for (const u of updates) {
  const { error: e } = await db.from('corridors').update({ data: u.data }).eq('id', u.id);
  if (e) console.error(`  write failed ${u.id}: ${e.message}`); else ok++;
}
console.log(`\nWrote ${ok}/${updates.length} pages.`);
