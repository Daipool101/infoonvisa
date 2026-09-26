// india-to-japan said "There is no visa-on-arrival or e-Visa option for Indian
// citizens for tourism." JAPAN eVISA has been running in India since 1 April
// 2024. That sentence is flatly false, and it sits on the busiest page on the
// site — 197 searches, the highest of any route.
//
// THE VERDICT IS NOT CHANGING, AND THAT IS THE POINT OF THIS FILE.
//
// The new grounded research pass found this page and returned `evisa` with
// high confidence, having opened mofa.go.jp and the Japanese embassy's own
// site. It was the first disagreement the regeneration audit produced. Taken
// at face value it would have flipped the busiest page on the site.
//
// It would have been wrong. Here is what the Embassy of Japan in India
// actually says:
//
//   "JAPAN eVISA starts in India from 1 April 2024. You can apply for eVISA
//    through Japan Visa Application Centers... *Please note that applicants
//    have to submit applications to the Visa Application Centers AS BEFORE but
//    receive a visa issued in electronic form instead of a visa sticker on
//    their passports."
//
// The eVISA changed what you RECEIVE, not how you APPLY. You still take your
// documents to a visa application centre in person. Telling an Indian reader
// "e-Visa" implies they can do this from their sofa, and they cannot — so
// `embassy` remains the honest verdict for the effort involved, even though an
// electronic visa is genuinely what comes out at the end.
//
// So the audit was right that the page was wrong, and wrong about how. Both
// halves matter. It is the reason the audit reports differences for a human
// instead of overwriting pages with fresh model output: an automated
// regeneration would have "fixed" this into something new and misleading.
//
// What changes here is the false sentence, plus the one operational detail a
// traveller genuinely needs and did not have: the visa now arrives as a "visa
// issuance notice" that must be shown ON A PHONE at the airport. The embassy
// is explicit that a PDF, photo, screenshot or printout will NOT be accepted —
// which is the kind of thing that ends a trip at the check-in desk.
//
//   node scripts/fix-india-japan-evisa.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SRC = {
  url: 'https://www.in.emb-japan.go.jp/itpr_ja/11_000001_01148.html',
  label: 'Embassy of Japan in India — the JAPAN eVISA system',
};

const SUMMARY =
  'Indian citizens need a visa before travelling to Japan for tourism, and it has to be arranged in advance — there is no visa on arrival. ' +
  'Since 1 April 2024 the visa is issued electronically rather than as a sticker in the passport, but the way you apply has not changed: applications still go to a Japan Visa Application Centre in person, exactly as before. ' +
  'What arrives at the end is a “visa issuance notice”, and Japan requires you to show it on a mobile device at the airport — a PDF, photo, screenshot or printed copy is not accepted, so you need a working phone and internet access when you travel.';

const TIP =
  'Japan’s electronic visa must be shown on a phone with internet access at the airport. A printout, screenshot or PDF will not be accepted.';

const res = await db.from('corridors').select('id,data').eq('slug', 'india-to-japan').single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const before = res.data.data;
const data = { ...before };

const changes = [];
const note = (field, was, now) => changes.push({
  id: `${Date.now().toString(36)}-${field}-${changes.length}`,
  at: new Date().toISOString(), by: 'aksjai101@gmail.com', field, before: was ?? null, after: now ?? null,
});

if (before.summary !== SUMMARY) note('summary', before.summary, SUMMARY);
data.summary = SUMMARY;

// The tip belongs with the other practical tips, not buried in the summary.
const tips = Array.isArray(before.tips) ? before.tips : [];
if (!tips.some((t) => /issuance notice|mobile device|on a phone/i.test(t))) {
  data.tips = [TIP, ...tips].slice(0, 6);
}

if (!(data.sources || []).some((s) => s.url === SRC.url)) data.sources = [...(data.sources || []), SRC];

data.changeLog = [...changes, ...(Array.isArray(before.changeLog) ? before.changeLog : [])].slice(0, 40);

console.log('verdict stays:', data.verdict, '(unchanged — you still apply in person)');
console.log('\nsummary BEFORE:\n ', before.summary);
console.log('\nsummary AFTER:\n ', SUMMARY);
console.log('\ntip added:', data.tips?.[0] === TIP ? 'yes' : 'already present');
console.log('changes recorded:', changes.map((c) => c.field).join(', ') || 'none');

if (!DRY) {
  const upd = await db.from('corridors')
    .update({ sources: data.sources, data })
    .eq('id', res.data.id);
  if (upd.error) { console.error(upd.error.message); process.exit(1); }
  console.log('\nSaved.');
} else {
  console.log('\nDRY RUN — nothing written.');
}
