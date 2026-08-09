// Weekly link health check (read-only).
//
// Verifies every source URL on every stored corridor and reports the broken
// ones. Exits 1 when anything is broken so CI can raise an issue; exits 0 when
// the site is healthy, so a quiet week produces no notification at all.
//
// Credentials come from .dev.vars locally, or the environment in CI.
//   node scripts/check-links.mjs
import { readFileSync, appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
} catch {} // absent in CI — env vars are supplied there

if (!env.PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(2);
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const UA = 'Mozilla/5.0 (compatible; InfoOnVisaLinkCheck/1.0; +https://infoonvisa.com)';
const safeUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  try { const p = new URL(u.trim()); return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null; }
  catch { return null; }
};

// Same conservative policy as the generator: only a definitive 404/410 or a
// domain that does not resolve counts as broken. 403/5xx/timeouts are gov
// sites blocking bots, not real breakage.
async function check(url, ms = 15000) {
  const headers = { 'user-agent': UA };
  const run = (method, t) => fetch(url, { method, redirect: 'follow', headers, signal: AbortSignal.timeout(t) });
  try {
    let r = await run('HEAD', ms);
    // Many servers mishandle HEAD (mfa.gov.tr: 404 to HEAD, 200 to GET),
    // so never trust a HEAD failure — confirm with a real GET.
    if (r.status >= 400) r = await run('GET', ms + 5000);
    if (r.status === 404 || r.status === 410) return `HTTP ${r.status}`;
    return null;
  } catch (e) {
    const code = String(e?.cause?.code || e?.name || '');
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'domain does not resolve';
    return null;
  }
}

const { data: rows, error } = await db.from('corridors').select('slug, data, status');
if (error) { console.error('DB error:', error.message); process.exit(2); }

const urls = new Map(); // url -> Set<slug>
for (const r of rows) {
  // Only live pages matter. Anything already held for review is noindexed and
  // out of the sitemap, so it must not keep raising alerts.
  if (r.status !== 'verified') continue;
  const d = r.data || {};
  for (const u of [d.officialSource?.url, ...(d.sources || []).map((s) => s.url), ...(d.applySteps || []).map((s) => s.link?.url)]) {
    const s = safeUrl(u);
    if (!s) continue;
    if (!urls.has(s)) urls.set(s, new Set());
    urls.get(s).add(r.slug);
  }
}
console.log(`Checking ${urls.size} unique URLs across ${rows.length} corridors…`);

const all = [...urls.keys()];
const broken = [];
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < all.length) {
    const u = all[i++];
    let why = await check(u);
    // Confirm before reporting — a single flaky 404 must not raise an issue.
    if (why) why = await check(u);
    if (why) broken.push({ url: u, why, pages: [...urls.get(u)] });
  }
}));

if (!broken.length) {
  console.log('All source links healthy.');
  process.exit(0);
}

broken.sort((a, b) => b.pages.length - a.pages.length);
const lines = [
  `**${broken.length} broken source link${broken.length > 1 ? 's' : ''}** found across ${new Set(broken.flatMap((b) => b.pages)).size} page(s).`,
  '',
  'Run `node scripts/fix-links.mjs` for a dry run, then `--write` to repair.',
  '',
  '| Link | Problem | Pages |',
  '| --- | --- | --- |',
  ...broken.map((b) => `| ${b.url} | ${b.why} | ${b.pages.slice(0, 5).join(', ')}${b.pages.length > 5 ? ` +${b.pages.length - 5}` : ''} |`),
];
const body = lines.join('\n');
console.log('\n' + body);

// Hand the report to the GitHub Action so it can open an issue.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${broken.length}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `body<<__EOF__\n${body}\n__EOF__\n`);
}
process.exit(1);
