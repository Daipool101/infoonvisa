// Correct united-states-to-united-arab-emirates: the stay is 30 days, not 90.
//
// The page told American visitors their visa on arrival was good for 90 days
// within 180. Two UAE missions say one month. An American who planned a 60-day
// trip on this page would be an overstayer from day 31, and the UAE fines by
// the day.
//
// The 90/180 figure is real, but it belongs to BRITISH citizens — UK government
// travel advice gives exactly that for the UAE. It looks as though the wrong
// country's entitlement was applied here.
//
// Sources, both UAE Ministry of Foreign Affairs missions, read 2026-09-12:
//   Embassy in Washington/New York: "US citizens with a US passport that is
//     valid for more than six months do not need to obtain a visa prior to entry
//     to the UAE if the duration of their visit will be less than one month."
//   Consulate in Boston: "No visas are required for American citizens (holder of
//     regular passports) before arrival in the UAE." / "Visas are available upon
//     arrival at the airport and they are valid for one (1) month stay in the
//     UAE." / "If you plan to stay longer, you can request more time from the
//     immigration officer at the airport or contact the local immigration office
//     in the UAE and request an extension."
//
//   node scripts/fix-us-uae-stay.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SLUG = 'united-states-to-united-arab-emirates';
const SRC = 'https://www.mofa.gov.ae/en/Missions/Boston/Services/Visas';

const res = await db.from('corridors').select('id,data').eq('slug', SLUG).single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const d = { ...res.data.data };

d.maxStayDays = 30;
d.verdictHeadline = 'American citizens get a visa on arrival in the UAE for a stay of one month.';
d.summary =
  'American citizens travelling to the United Arab Emirates for tourism, business or visiting family do not apply for a ' +
  'visa in advance. Immigration stamps the passport on arrival with a visa valid for a one-month stay. If you need longer, ' +
  'you can ask the immigration officer at the airport or apply to a local immigration office in the UAE for an extension. ' +
  'Your passport must be valid for at least six months from the date you arrive.';

d.visaOptions = [{
  type: 'Visa on Arrival',
  entries: 'Multiple Entry',
  maxStay: '30 days',
  validity: '30 days from date of entry, extendable on request',
  eligibility: 'American passport holders arriving for tourism, business meetings or visiting family.',
}];

const REWRITES = [
  [/Can I extend my 90-day visa on arrival/i, {
    q: 'Can I extend my visa on arrival?',
    a: 'Yes. The UAE grants Americans a one-month stay on arrival, and you can request more time from the immigration officer at the airport or from a local immigration office in the UAE. Extensions are charged and are not guaranteed, so do not build a longer trip around one.',
  }],
  [/transiting through the UAE/i, {
    q: 'Do I need a visa if I am transiting through the UAE?',
    a: 'If you stay airside and never pass through immigration, you need nothing. If you want to leave the airport, you are admitted on the same one-month visa on arrival.',
  }],
  [/multiple-entry|how many times/i, {
    q: 'Is the visa on arrival multiple entry?',
    a: 'Yes — the visa on arrival granted to American citizens allows multiple entries, but each stay is limited to one month. Leaving and returning does not extend a stay beyond what the officer granted you.',
  }],
];

d.faq = (d.faq || []).map((item) => {
  for (const [re, replacement] of REWRITES) if (re.test(item.q)) return replacement;
  // Some answers restate 90 days without the question doing so.
  return /90[- ]day|90 days/i.test(item.a)
    ? { ...item, a: item.a.replace(/90[- ]days?/gi, 'one month').replace(/within a 180-day period/gi, 'per entry') }
    : item;
});

d.applySteps = (d.applySteps || []).map((s) => ({
  ...s,
  text: s.text.replace(/valid for 90 days/gi, 'valid for a one-month stay').replace(/90[- ]days?/gi, 'one month'),
}));

const official = { url: SRC, label: 'UAE Ministry of Foreign Affairs — visa information for US citizens' };
d.officialSource = official;
d.sources = [official, ...(d.sources || []).filter((s) => s.url !== SRC)].slice(0, 4);

const left = (JSON.stringify(d).match(/90[- ]days?/gi) || []).length;
console.log(`${SLUG}: maxStayDays ${res.data.data.maxStayDays} -> ${d.maxStayDays}`);
console.log(`  headline: ${d.verdictHeadline}`);
console.log(`  remaining "90 day" mentions: ${left}`);
if (left) [...JSON.stringify(d).matchAll(/.{100}90[- ]days?.{100}/gi)].forEach((m) => console.log(`    …${m[0]}…`));

if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }
const upd = await db.from('corridors')
  .update({ data: { ...d, verdictCheckedOn: new Date().toISOString(), verdictCheckSource: `${SRC}, read 2026-09-12` } })
  .eq('id', res.data.id);
if (upd.error) { console.error(upd.error.message); process.exit(1); }
console.log('\nUpdated.');
