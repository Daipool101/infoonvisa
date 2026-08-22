// Which pages are due a human verdict check?
//
// Today's audit found four wrong verdicts — UK ETA on two routes, Türkiye's
// abolished e-Visa, Korea's waived K-ETA — and we only found them because we
// happened to look. Nothing was watching. No script can decide whether a
// verdict is right (that needs reading an official source and judgement), so
// this does the next best thing: it ranks pages by how much traffic they get
// against how long since a human last confirmed the verdict, and names the ones
// worth an hour of attention.
//
// `verdictCheckedOn` in a page's data records the last human check. Where it is
// absent we fall back to generated_at, which is when the model wrote the page.
//
//   node scripts/verdict-review.mjs            # report
//   node scripts/verdict-review.mjs --days 90  # change the staleness threshold
import { readFileSync, appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const STALE_DAYS = Number(flag('--days')) || 60;
const LIMIT = Number(flag('--limit')) || 10;

const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
} catch {} // absent in CI

if (!env.PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(2);
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const res = await db.from('corridors').select('slug,verdict,data,status,generated_at,search_count');
if (res.error) { console.error('DB error:', res.error.message); process.exit(2); }
const rows = (res.data || []).filter((r) => r.status === 'verified');

const now = Date.now();
const DAY = 86400000;
const scored = rows.map((r) => {
  const checked = r.data?.verdictCheckedOn || r.generated_at;
  const ageDays = Math.floor((now - new Date(checked).getTime()) / DAY);
  const traffic = r.search_count || 0;
  return {
    slug: r.slug,
    verdict: r.verdict,
    ageDays,
    traffic,
    everChecked: !!r.data?.verdictCheckedOn,
    // Weight by traffic so attention goes where readers actually are, but keep
    // age mattering on its own so quiet pages are not ignored forever.
    priority: traffic * ageDays,
  };
});

// Two separate backlogs, and the first is the one that matters today: a page
// nobody has ever checked is a page whose verdict is only as good as the model's
// training data. Age alone would have hidden this — the oldest pages are barely
// 40 days old, so an age threshold reports "nothing overdue" while a hundred
// unverified verdicts sit live.
const neverChecked = scored.filter((r) => !r.everChecked).sort((a, b) => b.traffic - a.traffic || b.ageDays - a.ageDays);
const dueRecheck = scored.filter((r) => r.everChecked && r.ageDays >= STALE_DAYS).sort((a, b) => b.priority - a.priority);
const overdue = [...neverChecked, ...dueRecheck];

console.log(`${rows.length} live pages`);
console.log(`  never verdict-checked by a human : ${neverChecked.length}`);
console.log(`  checked, but ${STALE_DAYS}+ days ago         : ${dueRecheck.length}`);
console.log(`  recently confirmed               : ${scored.length - overdue.length}\n`);

if (!overdue.length) { console.log('Nothing overdue.'); process.exit(0); }

const top = overdue.slice(0, LIMIT);
const lines = [
  `**${neverChecked.length} pages** have never had their verdict confirmed against an official source`,
  `${dueRecheck.length ? `, and **${dueRecheck.length}** were last checked over ${STALE_DAYS} days ago` : ''}.`,
  '',
  'Entry rules changed under us four times this year (UK ETA, Türkiye, Korea K-ETA, Japan transit).',
  'A verdict is the page\'s central claim — it sits in the title, H1 and structured data — so a stale one misinforms.',
  '',
  `Worth checking next, busiest first (top ${top.length}):`,
  '',
  '| Page | Verdict | Ever checked | Age (days) | Searches |',
  '| --- | --- | --- | --- | --- |',
  ...top.map((r) => `| [${r.slug}](https://infoonvisa.com/${r.slug}) | ${r.verdict} | ${r.everChecked ? 'yes' : '**no**'} | ${r.ageDays} | ${r.traffic} |`),
  '',
  'To clear one: confirm the verdict on the official source, correct it in `scripts/fix-verdicts.mjs` if wrong,',
  'and set `verdictCheckedOn` on the page so it drops off this list.',
];
const body = lines.join('\n');
console.log(body);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${overdue.length}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `body<<__EOF__\n${body}\n__EOF__\n`);
}
process.exit(1);
