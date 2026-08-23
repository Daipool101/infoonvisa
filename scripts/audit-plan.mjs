// Group the verdict audit by DESTINATION, not by page.
//
// A destination's entry policy is the same whoever is asking, so checking
// Singapore's official list once settles every Singapore page at the same time.
// 124 pages collapse into far fewer official lookups, and grouping also keeps
// the answers consistent — checking page by page invites two Singapore pages
// ending up with different verdicts.
//
//   node scripts/audit-plan.mjs            # the whole plan, batch by batch
//   node scripts/audit-plan.mjs --batch 1  # just one batch
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const ONLY = Number(flag('--batch')) || null;
// Batches are counted in DESTINATIONS, because a destination is one official
// lookup — that is the unit of work, not the page.
const PER_BATCH = Number(flag('--size')) || 10;

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const res = await db.from('corridors').select('slug,verdict,data,status,search_count,generated_at');
if (res.error) { console.error(res.error.message); process.exit(1); }
const rows = (res.data || []).filter((r) => r.status === 'verified');

// Google impressions per page, so busiest destinations are checked first.
const G = 'C:/Users/Akash/Downloads/infoonvisa.com-Performance-on-Search-2026-08-17';
const impr = new Map();
try {
  for (const l of readFileSync(`${G}/Pages.csv`, 'utf8').split(/\r?\n/).filter(Boolean).slice(1)) {
    const p = l.split(','); const n = p.slice(-4);
    const slug = p.slice(0, p.length - 4).join(',').replace('https://infoonvisa.com/', '').replace(/\/$/, '');
    impr.set(slug, (impr.get(slug) || 0) + (+n[1] || 0));
  }
} catch { /* export not present; fall back to on-site searches only */ }

const byDest = new Map();
for (const r of rows) {
  const dest = r.slug.split('-to-')[1];
  if (!dest) continue;
  if (!byDest.has(dest)) byDest.set(dest, []);
  byDest.get(dest).push({
    slug: r.slug,
    origin: r.slug.split('-to-')[0],
    verdict: r.verdict,
    checked: !!r.data?.verdictCheckedOn,
    traffic: (impr.get(r.slug) || 0) + (r.search_count || 0),
    source: r.data?.officialSource?.url,
  });
}

const groups = [...byDest].map(([dest, pages]) => ({
  dest,
  pages: pages.sort((a, b) => b.traffic - a.traffic),
  unchecked: pages.filter((p) => !p.checked).length,
  traffic: pages.reduce((s, p) => s + p.traffic, 0),
  verdicts: [...new Set(pages.map((p) => p.verdict))],
}))
  .filter((g) => g.unchecked > 0)
  .sort((a, b) => b.traffic - a.traffic);

// Pack destinations into batches of roughly PER_BATCH pages, keeping each
// destination whole so one lookup is never split across two batches.
const batches = [];
let cur = { n: 1, groups: [], pages: 0 };
for (const g of groups) {
  if (cur.groups.length >= PER_BATCH) { batches.push(cur); cur = { n: batches.length + 1, groups: [], pages: 0 }; }
  cur.groups.push(g);
  cur.pages += g.unchecked;
}
if (cur.groups.length) batches.push(cur);

const totalPages = groups.reduce((s, g) => s + g.unchecked, 0);
console.log(`${rows.length} live pages — ${totalPages} still unchecked, across ${groups.length} destinations.`);
console.log(`=> ${groups.length} official lookups instead of ${totalPages} page-by-page checks.\n`);

for (const b of batches) {
  if (ONLY && b.n !== ONLY) continue;
  console.log(`===== BATCH ${b.n} — ${b.pages} pages, ${b.groups.length} destinations to verify =====`);
  for (const g of b.groups) {
    console.log(`\n  ${g.dest.toUpperCase()}  (${g.unchecked} page(s), ${g.traffic} traffic, verdicts: ${g.verdicts.join('/')})`);
    g.pages.filter((p) => !p.checked).forEach((p) =>
      console.log(`     ${String(p.traffic).padStart(4)}  ${p.origin.padEnd(20)} -> ${p.verdict.padEnd(10)} ${p.source || '(no source)'}`)
    );
  }
  console.log('');
}
if (!ONLY) console.log(`Total: ${batches.length} batches.`);
