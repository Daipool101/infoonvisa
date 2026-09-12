// Second pass on united-states-to-israel: clear the leftovers.
//
// The first pass changed the verdict and the headline answers, but the page
// repeats itself — the documents question, the "how long can I stay" question,
// the work question and the rejection-reasons list each restated the old
// position in their own words. A page that says "you need an ETA-IL" at the top
// and "you will need a passport valid for six months" further down is still
// wrong where it counts, so every restatement has to move together.
//
// Same source as the first pass: https://israel-entry.piba.gov.il, read 2026-09-12.
//
//   node scripts/fix-israel-eta-remnants.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SLUG = 'united-states-to-israel';
const res = await db.from('corridors').select('id,data').eq('slug', SLUG).single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const d = { ...res.data.data };
const changed = [];

d.faq = (d.faq || []).map((item) => {
  if (/What documents do I need to enter Israel/i.test(item.q)) {
    changed.push('faq: documents');
    return {
      q: item.q,
      a: 'An approved ETA-IL, a passport valid for at least three months from the date you arrive, a return or onward ticket, proof of sufficient funds, and proof of accommodation.',
    };
  }
  if (/How long can American citizens stay in Israel/i.test(item.q)) {
    changed.push('faq: length of stay');
    return {
      q: 'How long can American citizens stay in Israel?',
      a: 'Up to 90 days per visit on an approved ETA-IL. The authorization itself stays valid for up to two years, or until your passport expires — whichever comes first — and covers multiple visits within that time.',
    };
  }
  if (/Can I work in Israel/i.test(item.q)) {
    changed.push('faq: work');
    return {
      q: item.q,
      a: 'No. An ETA-IL covers tourism, family visits and business meetings only. Working in Israel requires a specific work visa, obtained in advance.',
    };
  }
  return item;
});

d.rejectionReasons = (d.rejectionReasons || []).map((r) =>
  /passport validity/i.test(r.reason)
    ? (changed.push('rejectionReasons: passport validity'), {
        ...r,
        avoid: 'Check your passport is valid for at least three months from the date you arrive in Israel, and apply for your ETA-IL before you book non-refundable travel.',
      })
    : r
);

console.log(`${SLUG}: ${changed.length} remnant(s) corrected`);
changed.forEach((c) => console.log(`  - ${c}`));

const stale = JSON.stringify(d).match(/six months|visa-free entry for American/gi);
console.log(stale ? `  STILL STALE: ${stale.join(', ')}` : '  no stale claims remain');

if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }
const upd = await db.from('corridors').update({ data: d }).eq('id', res.data.id);
if (upd.error) { console.error(upd.error.message); process.exit(1); }
console.log('\nUpdated.');
