// Repair source links on every stored corridor.
//
// This does NOT call the AI and does NOT touch page copy — it only verifies each
// URL and rewrites/drops the broken ones, using the same rules the live
// generator now applies (src/lib/links.ts):
//   * curated official portal wins for `officialSource`
//   * invented visa-centre path codes (e.g. /DEL2_EN/) are stripped
//   * 404 -> retry bare origin -> drop if that is dead too
//   * dead domain (DNS) -> drop
//   * 403/5xx/timeout -> KEPT (gov sites block bots but work in browsers)
//
//   node scripts/fix-links.mjs           # dry run: report only
//   node scripts/fix-links.mjs --write   # apply the fixes
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

// Mirror of src/lib/links.ts (plain JS so the script runs without a TS loader).
const { OFFICIAL_PORTALS, JUNK_SEGMENT } = await loadRules();
async function loadRules() {
  const src = readFileSync(new URL('../src/lib/links.ts', import.meta.url), 'utf8');
  const portals = {};
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*'?([a-z-]+)'?:\s*\{\s*label:\s*'((?:[^'\\]|\\.)*)',\s*url:\s*'([^']+)'/);
    if (m) portals[m[1]] = { label: m[2].replace(/\\'/g, "'"), url: m[3] };
  }
  return { OFFICIAL_PORTALS: portals, JUNK_SEGMENT: /^[A-Z]{2,5}\d{0,2}_[A-Z]{2}$/ };
}
console.log(`loaded ${Object.keys(OFFICIAL_PORTALS).length} curated portals\n`);

const UA = 'Mozilla/5.0 (compatible; InfoOnVisaLinkCheck/1.0; +https://infoonvisa.com)';
const safeUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  try { const p = new URL(u.trim()); return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null; }
  catch { return null; }
};
const normalizeUrl = (raw) => {
  const s = safeUrl(raw); if (!s) return raw;
  const u = new URL(s);
  const segs = u.pathname.split('/').filter(Boolean);
  const kept = segs.filter((x) => !JUNK_SEGMENT.test(x));
  if (kept.length !== segs.length) { u.pathname = kept.length ? `/${kept.join('/')}/` : '/'; u.search = ''; u.hash = ''; }
  return u.href;
};
const originOf = (raw) => { const s = safeUrl(raw); if (!s) return null; return new URL(s).origin + '/'; };

async function checkUrl(url, ms = 12000) {
  const headers = { 'user-agent': UA };
  const run = (method, t) => fetch(url, { method, redirect: 'follow', headers, signal: AbortSignal.timeout(t) });
  try {
    let r = await run('HEAD', ms);
    // Many servers mishandle HEAD (mfa.gov.tr: 404 to HEAD, 200 to GET),
    // so never trust a HEAD failure — confirm with a real GET.
    if (r.status >= 400) r = await run('GET', ms + 5000);
    if (r.status === 404 || r.status === 410) return 'dead-path';
    return 'alive';
  } catch (e) {
    const code = String(e?.cause?.code || e?.name || '');
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dead-host';
    return 'alive';
  }
}
async function resolveUrl(raw) {
  const url = normalizeUrl(raw);
  if (!safeUrl(url)) return null;
  let v = await checkUrl(url);
  // Gov sites are flaky — confirm a bad result before acting on it.
  if (v !== 'alive') v = await checkUrl(url);
  if (v === 'alive') return url;
  if (v === 'dead-host') return null;
  const o = originOf(url);
  if (!o || o === url) return null;
  return (await checkUrl(o)) === 'alive' ? o : null;
}

const { data: rows, error } = await db.from('corridors').select('id, slug, data');
if (error) { console.error('DB error:', error.message); process.exit(1); }
console.log(`${rows.length} corridors\n`);

// Resolve every distinct URL once across the whole site.
const unique = new Set();
for (const r of rows) {
  const d = r.data || {};
  [d.officialSource?.url, ...(d.sources || []).map((s) => s.url), ...(d.applySteps || []).map((s) => s.link?.url)]
    .forEach((u) => { const s = safeUrl(u); if (s) unique.add(s); });
}
console.log(`checking ${unique.size} unique URLs…`);
const resolved = new Map();
const all = [...unique];
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < all.length) { const u = all[i++]; resolved.set(u, await resolveUrl(u)); process.stdout.write('.'); }
}));
console.log('\n');

const fix = (u) => { const s = safeUrl(u); if (!s) return null; const v = resolved.get(s); return v === undefined ? s : v; };
let changedPages = 0, rewritten = 0, dropped = 0;
const updates = [];
const heldForReview = [];

for (const r of rows) {
  const d = r.data || {};
  const toSlug = r.slug.split('-to-')[1];
  const before = JSON.stringify([d.officialSource, d.sources, (d.applySteps || []).map((s) => s.link)]);

  // Distinct deep links can collapse onto the same origin, so dedupe after fixing.
  const seen = new Set();
  const sources = (d.sources || [])
    .map((s) => ({ ...s, url: fix(s.url) }))
    .filter((s) => s.url)
    .filter((s) => !seen.has(s.url) && seen.add(s.url));
  const applySteps = (d.applySteps || []).map((step) => {
    if (!step.link?.url) return step;
    const url = fix(step.link.url);
    return url ? { ...step, link: { ...step.link, url } } : { ...step, link: undefined };
  });
  // A working link from the model beats a generic curated homepage; the
  // curated portal only steps in when the model's link is dead.
  const curated = OFFICIAL_PORTALS[toSlug];
  const own = fix(d.officialSource?.url);
  const officialSource = own ? { ...d.officialSource, url: own } : curated ? { ...curated } : sources[0];
  // A page we can no longer ground in a reachable official source should not
  // stay in the sitemap claiming to be verified. Hold it for review instead.
  if (!officialSource?.url) {
    console.log(`!! ${r.slug}: no working official source — holding for review`);
    if (WRITE) await db.from('corridors').update({ status: 'pending_review' }).eq('id', r.id);
    heldForReview.push(r.slug);
    continue;
  }

  const next = { ...d, officialSource, sources, applySteps };
  const after = JSON.stringify([next.officialSource, next.sources, (next.applySteps || []).map((s) => s.link)]);
  if (before === after) continue;

  changedPages++;
  const oldUrls = [d.officialSource?.url, ...(d.sources || []).map((s) => s.url)].filter(Boolean);
  const newUrls = [next.officialSource?.url, ...next.sources.map((s) => s.url)].filter(Boolean);
  rewritten += newUrls.filter((u) => !oldUrls.includes(u)).length;
  // Only count links that were removed outright — a rewritten URL also
  // disappears from the old list, and must not be counted as a drop.
  dropped += oldUrls.filter((u) => resolved.get(safeUrl(u)) === null).length;
  console.log(`~ ${r.slug}`);
  if (d.officialSource?.url !== next.officialSource.url)
    console.log(`    official: ${d.officialSource?.url}\n           -> ${next.officialSource.url}`);
  for (const u of oldUrls) if (resolved.get(safeUrl(u)) === null) console.log(`    dropped:  ${u}`);
  updates.push({ id: r.id, data: next, sources: next.sources });
}

console.log(`\n${changedPages} of ${rows.length} pages need changes (${rewritten} links rewritten, ${dropped} dropped)`);
if (heldForReview.length)
  console.log(`${heldForReview.length} page(s) held for review (no reachable official source): ${heldForReview.join(', ')}`);

if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write to apply.'); process.exit(0); }

let ok = 0;
for (const u of updates) {
  const { error: e } = await db.from('corridors').update({ data: u.data, sources: u.sources }).eq('id', u.id);
  if (e) console.error(`  write failed ${u.id}: ${e.message}`); else ok++;
}
console.log(`\nWrote ${ok}/${updates.length} pages.`);
