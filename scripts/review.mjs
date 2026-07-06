// Review & approve auto-generated corridor pages.
//
//   node scripts/review.mjs                     → list all PENDING pages with a
//                                                  quick-look summary + live link
//   node scripts/review.mjs show <slug>         → print the FULL content of one page
//   node scripts/review.mjs approve <slug> ...  → mark page(s) verified (enter sitemap)
//   node scripts/review.mjs approve --all       → approve every pending page
//   node scripts/review.mjs reject <slug> ...   → mark page(s) low_quality (stay noindex)
//
// Approving flips status -> 'verified', which (a) lets Google index it and
// (b) auto-adds it to /sitemap-corridors.xml. Rejecting sets 'low_quality'.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const SITE = 'https://infoonvisa.com';

const [cmd, ...rest] = process.argv.slice(2);

async function list() {
  const { data, error } = await db
    .from('corridors')
    .select('slug, status, verdict, data, generated_at')
    .eq('status', 'pending_review')
    .order('generated_at', { ascending: false });
  if (error) return console.error('DB error:', error.message);
  if (!data.length) return console.log('No pending pages. 🎉 Everything is reviewed.');

  console.log(`\n${data.length} PENDING page(s) awaiting review:\n${'='.repeat(70)}`);
  for (const r of data) {
    const d = r.data || {};
    console.log(`\n● ${r.slug}`);
    console.log(`  verdict : ${d.verdict}  —  ${d.verdictHeadline || ''}`);
    console.log(`  summary : ${(d.summary || '').slice(0, 160)}`);
    console.log(`  options : ${d.visaOptions?.length || 0} visa types | docs ${d.documents?.length || 0} | steps ${d.applySteps?.length || 0} | faq ${d.faq?.length || 0}`);
    console.log(`  source  : ${d.officialSource?.url || '(none!)'}  | total sources: ${d.sources?.length || 0}`);
    console.log(`  REVIEW  : ${SITE}/${r.slug}`);
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log('Open each REVIEW link, sanity-check the facts, then:');
  console.log('  node scripts/review.mjs approve <slug> [<slug> ...]   (or  approve --all)');
  console.log('  node scripts/review.mjs reject  <slug> [<slug> ...]');
  console.log('  node scripts/review.mjs show    <slug>                (full content dump)\n');
}

async function show(slug) {
  const { data, error } = await db.from('corridors').select('data,status').eq('slug', slug).maybeSingle();
  if (error || !data) return console.error('Not found:', slug, error?.message || '');
  console.log(`\n${slug}  [${data.status}]\n${'='.repeat(70)}`);
  console.log(JSON.stringify(data.data, null, 2));
}

async function setStatus(slugs, status) {
  let targets = slugs;
  if (slugs[0] === '--all') {
    const { data } = await db.from('corridors').select('slug').eq('status', 'pending_review');
    targets = (data || []).map((r) => r.slug);
  }
  if (!targets.length) return console.log('No slugs given.');
  for (const slug of targets) {
    const { error, count } = await db
      .from('corridors')
      .update({ status }, { count: 'exact' })
      .eq('slug', slug)
      .select('slug');
    if (error) console.error(`  ✗ ${slug}: ${error.message}`);
    else console.log(`  ✓ ${slug} → ${status}`);
  }
  console.log(`\nDone. (Verified pages appear in /sitemap-corridors.xml within ~1h cache.)`);
}

if (cmd === 'approve') await setStatus(rest, 'verified');
else if (cmd === 'reject') await setStatus(rest, 'low_quality');
else if (cmd === 'show') await show(rest[0]);
else await list();
