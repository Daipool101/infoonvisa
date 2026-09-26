// India and Pakistan are NOT on Saudi Arabia's e-Visa list. Both pages said
// they were.
//
// How it was found: the nationality dropdown on Saudi Arabia's own signup page
// (visa.visitsaudi.com/Registration/Verify) is the eligibility list — the page
// says so itself, immediately beneath it: "In case your nationality country is
// not eligible for eVisa, please contact the nearest embassy of Saudi Arabia."
// It holds 70 countries. India is not among them; nor is Pakistan. Verified by
// the owner on 26 Sep 2026.
//
// The law behind the dropdown is the Tourist Visa Regulations of the Ministry
// of Tourism, and it is unusually clear. Article 4 publishes a list of
// nationalities who may apply on arrival, by e-Visa, or through a mission.
// Article 6(1) then says:
//
//   "Anyone who holds the nationality of a country that is not included in the
//    list published on the electronic platform www.visitsaudi.com referred to
//    in Article (4), can obtain a Visa through one of the Kingdom's diplomatic
//    missions abroad, or through the digital embassy on the Ministry of
//    Foreign Affairs platform... provided that they submit the following:
//    a. Return ticket including flight itinerary...
//    b. Accommodation booking inside the Kingdom...
//    c. Employee identification certificate.
//    d. Proof of financial solvency by submitting a bank statement or salary
//       certificate."
//
// So the verdict on both pages moves from "e-Visa required" to "Embassy visa
// required". That is the correction.
//
// But the interesting half is Article 6(2), and it is why so much of the
// internet — and our own generated pages — says Indians and Pakistanis can get
// a Saudi e-Visa. The regulation excludes from the embassy route, and treats
// as if listed, anyone who:
//
//   b. "Holds a valid Tourist or Business Visa — from the United States of
//       America, the United Kingdom, or one of the countries of the Schengen
//       Agreement. It shall have been used at least once to enter the country
//       granting the visa. This shall include the Visa holder's first-degree
//       relatives coming with them."
//   c. Holds Permanent Residence in the USA, the EU or the UK (relatives too).
//   d. Holds a GCC residence visa valid at least three months, in one of the
//      professions published on visitsaudi.com (relatives and accompanying
//      domestic workers too).
//   a. Has bought a Ministry-approved tour package.
//
// A great many Indian travellers hold a used US visa. For them the e-Visa
// really is available — which is exactly how a page ends up confidently wrong:
// the exception is common enough to look like the rule. So this does not
// delete the e-Visa, it demotes it to the conditional option it actually is,
// with the condition written into its name rather than buried in prose.
//
// Not touched: the 96-hour stopover visa, and Pakistan's family and business
// visit visas. They are separate regimes, the regulation is silent on them,
// and nothing found here bears on whether they are right.
//
//   node scripts/fix-saudi-evisa-eligibility.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const AT = new Date().toISOString();
const BY = 'aksjai101@gmail.com';

const REG = {
  url: 'https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/tourism-regulations/Tourist-Visa-Regulations-En-V012.pdf',
  label: 'Saudi Ministry of Tourism — Tourist Visa Regulations (Articles 4 and 6)',
};

const CONDITIONAL =
  'Tourist e-Visa or visa on arrival (only with a used US, UK or Schengen visa, or US/EU/UK residence)';

const EMBASSY_OPTION = (stay) => ({
  type: 'Tourist Visa (Saudi embassy, consulate or the ministry’s digital embassy)',
  validity: 'Single entry: 3 months, stay up to 1 month. Multiple entry: 1 year, stay up to 3 months in total',
  maxStay: stay,
  entries: 'Single or Multiple',
  eligibility:
    'The normal route. Saudi Arabia asks for a return ticket and itinerary, an accommodation booking in the Kingdom, employee identification and proof of funds.',
});

const CONDITIONAL_OPTION = (stay, validity) => ({
  type: CONDITIONAL,
  validity,
  maxStay: stay,
  entries: 'Single or Multiple',
  eligibility:
    'Open only if you hold a US, UK or Schengen tourist or business visa you have already used to enter that country, permanent residence in the US, EU or UK, a GCC residence valid at least three months in a listed profession, or an approved tour package. First-degree relatives travelling with you are covered too.',
});

const INDIA_SUMMARY =
  'India is not on the list of nationalities Saudi Arabia publishes for its online tourist visa, so most Indian passport holders cannot apply through the e-Visa portal. ' +
  'The Tourist Visa Regulations send nationals of countries outside that list to a Saudi embassy or consulate, or to the ministry’s digital embassy, with a return ticket and itinerary, an accommodation booking, employee identification and proof of funds. ' +
  'There is one important exception, and it is common enough to be worth checking first: if you hold a US, UK or Schengen tourist or business visa that you have already used at least once to enter that country, or permanent residence in the US, EU or UK, or a GCC residence valid for at least three months in a listed profession, you are treated as if India were on the list and can use the e-Visa or be issued a visa on arrival. First-degree relatives travelling with you are covered by the same exception. ' +
  'Hajj needs its own Hajj visa, and Umrah cannot be performed during the Hajj season.';

const PAKISTAN_SUMMARY =
  'Pakistan is not on the list of nationalities Saudi Arabia publishes for its online tourist visa, so most Pakistani passport holders cannot apply through the e-Visa portal. ' +
  'The Tourist Visa Regulations send nationals of countries outside that list to a Saudi embassy or consulate, or to the ministry’s digital embassy, with a return ticket and itinerary, an accommodation booking, employee identification and proof of funds. ' +
  'There is one important exception: if you hold a US, UK or Schengen tourist or business visa that you have already used at least once to enter that country, or permanent residence in the US, EU or UK, or a GCC residence valid for at least three months in a listed profession, you are treated as if Pakistan were on the list and can use the e-Visa or be issued a visa on arrival. First-degree relatives travelling with you are covered by the same exception. ' +
  'Family visit and business visit visas are arranged separately by a sponsor in Saudi Arabia. Hajj needs its own Hajj visa, and Umrah cannot be performed during the Hajj season.';

const PLAN = {
  'india-to-saudi-arabia': {
    verdict: 'embassy',
    verdictHeadline:
      'Indian citizens need a Saudi visa arranged in advance — India is not on the e-Visa list.',
    summary: INDIA_SUMMARY,
    options: (old) => [
      EMBASSY_OPTION('90 days per visit on a multiple-entry visa'),
      CONDITIONAL_OPTION(old[0].maxStay, old[0].validity),
      ...old.slice(1), // 96-hour stopover visa, untouched
    ],
  },
  'pakistan-to-saudi-arabia': {
    verdict: 'embassy',
    verdictHeadline:
      'Pakistani citizens need a Saudi visa arranged in advance — Pakistan is not on the e-Visa list.',
    summary: PAKISTAN_SUMMARY,
    options: (old) => [
      EMBASSY_OPTION('90 days per visit on a multiple-entry visa'),
      CONDITIONAL_OPTION(old[0].maxStay, old[0].validity),
      ...old.slice(2), // family visit and business visit visas, untouched
    ],
  },
};

let changed = 0;
for (const [slug, plan] of Object.entries(PLAN)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const before = res.data.data;

  const data = { ...before };
  const newOptions = plan.options(before.visaOptions);

  const changes = [];
  const note = (field, was, now) => changes.push({
    id: `${Date.now().toString(36)}-${field}-${changes.length}`,
    at: AT, by: BY, field, before: was ?? null, after: now ?? null,
  });

  if (before.verdict !== plan.verdict) note('verdict', before.verdict, plan.verdict);
  if (before.verdictHeadline !== plan.verdictHeadline) note('verdictHeadline', before.verdictHeadline, plan.verdictHeadline);
  if (before.summary !== plan.summary) note('summary', before.summary, plan.summary);
  if (JSON.stringify(before.visaOptions) !== JSON.stringify(newOptions)) note('visaOptions', before.visaOptions, newOptions);

  data.verdict = plan.verdict;
  data.verdictHeadline = plan.verdictHeadline;
  data.summary = plan.summary;
  data.visaOptions = newOptions;
  // The source that settles it goes into the page's own source list.
  if (!(data.sources || []).some((s) => s.url === REG.url)) data.sources = [...(data.sources || []), REG];
  data.changeLog = [...changes, ...(Array.isArray(before.changeLog) ? before.changeLog : [])].slice(0, 40);

  console.log(`\n===== ${slug}`);
  console.log(`  verdict   ${before.verdict}  ->  ${plan.verdict}`);
  console.log(`  headline  ${plan.verdictHeadline}`);
  console.log(`  options   ${before.visaOptions.length} -> ${newOptions.length}`);
  newOptions.forEach((o) => console.log(`      - ${o.type}`));

  if (!DRY) {
    // The verdict lives in a column AND inside data. Both, always — one without
    // the other is how a page once showed "ETA required" under a Visa-free badge.
    const upd = await db.from('corridors')
      .update({ verdict: data.verdict, max_stay_days: data.maxStayDays ?? null, sources: data.sources, data })
      .eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(PLAN).length} page(s) ${DRY ? 'would be' : ''} corrected.`);
if (DRY) console.log('DRY RUN — nothing written.');
