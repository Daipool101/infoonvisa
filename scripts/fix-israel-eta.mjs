// Correct united-states-to-israel: an ETA-IL is required, not nothing.
//
// The page said American citizens simply turn up and receive an entry slip.
// That stopped being true on 1 January 2025, when Israel made the ETA-IL
// mandatory for every visa-exempt national. A reader following the old page
// would reach the airport without one and could be refused boarding, so this
// is a denied-travel error, not a wording problem.
//
// Two claims are corrected here:
//   1. verdict visa_free -> eta, with the ETA-IL as the route to take.
//   2. passport validity "six months" -> three months from the date of arrival,
//      which is what the Population and Immigration Authority actually requires.
//      Six months is the widespread travel-industry rule of thumb, not Israel's
//      rule, and stating it would send people to renew a passport they can use.
//
// Source: Israel Population and Immigration Authority, https://israel-entry.piba.gov.il
//   "As of January 1st, 2025, travelers to Israel must have a valid visa or
//    ETA-IL approval before starting their journey."
//   "Validity 2 Years or less … Duration Up to 90 Days per visit … Cost 25 NIS"
//   "Your passport must be valid for at least three months from the date of
//    your arrival in Israel"
//   "Obtaining an ETA-IL does not constitute a guarantee of entry into Israel."
// Read 2026-09-12.
//
//   node scripts/fix-israel-eta.mjs --dry-run
//   node scripts/fix-israel-eta.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SLUG = 'united-states-to-israel';
const PIBA = 'https://israel-entry.piba.gov.il';

const res = await db.from('corridors').select('id,verdict,data').eq('slug', SLUG).single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const d = { ...res.data.data };

// The verdict is stored twice: a `verdict` column and a `verdict` key inside
// the data JSON. The pages render data.verdict — it drives the badge, the
// at-a-glance row, the fee section and the generated city FAQ — so setting only
// the column leaves a page whose headline says ETA-IL under a "Visa-free" badge.
d.verdict = 'eta';

d.verdictHeadline =
  'American citizens need an approved ETA-IL before flying to Israel, then may stay up to 90 days.';

d.summary =
  'American citizens do not need a visa for Israel, but since 1 January 2025 they must hold an approved ETA-IL ' +
  '(Electronic Travel Authorization) before they start their journey. It is applied for online, costs 25 shekels, ' +
  'and stays valid for up to two years or until the passport expires, whichever comes first. Each visit may last up ' +
  'to 90 days. An approved ETA-IL lets you reach the border; a border control officer still decides on entry.';

// The old first option told readers there was nothing to arrange. Replace it
// rather than adding the ETA-IL beside it, or the page contradicts itself.
d.visaOptions = [
  {
    type: 'ETA-IL (Electronic Travel Authorization)',
    entries: 'Multiple Entry',
    maxStay: '90 days per visit',
    validity: '2 years, or until the passport expires — whichever comes first',
    eligibility:
      'Required for American citizens visiting Israel for tourism, family visits or business. Apply online before travelling; the fee is 25 shekels and is not refundable.',
  },
  ...(d.visaOptions || []).filter((o) => !/visa-free/i.test(o.type || '')),
];

const THREE_MONTHS = 'Must be valid for at least three months from the date of your arrival in Israel.';
d.documents = [
  { label: 'Approved ETA-IL', note: 'Apply online before you travel. Airlines check for it at boarding.' },
  ...(d.documents || []).map((doc) =>
    /passport/i.test(doc.label || '') ? { ...doc, note: THREE_MONTHS } : doc
  ),
];

d.applySteps = [
  { text: 'Check your passport is valid for at least three months from the date you arrive in Israel.' },
  { text: `Apply for the ETA-IL at ${PIBA} and pay the 25-shekel fee. Apply at least 72 hours before you travel.` },
  { text: 'Wait for the approval email. Most answers arrive within 72 hours.' },
  { text: 'Book your return or onward flight and arrange accommodation.' },
  { text: 'Carry the ETA-IL approval with your passport — the airline checks it before boarding.' },
  { text: 'Present your passport at the border. You will receive an entry permit slip instead of a passport stamp; keep it safe.' },
];

// Rewrite the two answers that are now wrong, and add the question readers
// will actually arrive with.
const faq = (d.faq || []).map((item) => {
  if (/need a visa to visit israel/i.test(item.q)) {
    return {
      q: item.q,
      a: 'No visa, but you do need an approved ETA-IL. Since 1 January 2025 every traveller from a visa-exempt country, including the United States, must have one before starting the journey. It is applied for online and covers stays of up to 90 days.',
    };
  }
  if (/passport expires in 5 months/i.test(item.q)) {
    return {
      q: 'My passport expires in 5 months – can I still enter Israel?',
      a: 'Yes. Israel requires your passport to be valid for at least three months from the date you arrive, so five months is enough. The six-month rule you may have read elsewhere is a common travel-industry guideline, not an Israeli requirement — but check your airline\'s own conditions.',
    };
  }
  return item;
});
faq.splice(1, 0, {
  q: 'How much does the ETA-IL cost and how long does it take?',
  a: 'The fee is 25 shekels, which is under 7 US dollars, and it is not refundable once you apply. Answers usually arrive within 72 hours, so apply at least three days before you fly.',
});
faq.push({
  q: 'Does an approved ETA-IL guarantee I will be let in?',
  a: 'No. In Israel\'s own words, an ETA-IL "only allows you to reach the border-crossing into Israel, but does not grant you permission to enter". A border control officer makes the final decision on arrival.',
});
d.faq = faq;

const official = { url: PIBA, label: 'Israel Population and Immigration Authority — ETA-IL' };
d.officialSource = official;
d.sources = [official, ...(d.sources || []).filter((s) => !/embassies\.gov\.il/i.test(s.url))];

console.log(`${SLUG}: ${res.data.verdict} -> eta`);
console.log(`  headline: ${d.verdictHeadline}`);
console.log(`  options : ${d.visaOptions.map((o) => o.type).join(' | ')}`);
console.log(`  faq     : ${d.faq.length} questions`);
console.log(`  source  : ${official.url}`);

if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }

const upd = await db.from('corridors')
  .update({ verdict: 'eta', data: { ...d, verdictCheckedOn: new Date().toISOString(), verdictCheckSource: 'israel-entry.piba.gov.il, read 2026-09-12' } })
  .eq('id', res.data.id);
if (upd.error) { console.error(upd.error.message); process.exit(1); }
console.log('\nUpdated.');
