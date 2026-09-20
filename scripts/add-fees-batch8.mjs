// Visa fees, phase 2 — batch 8. One route priced, and eight written off with
// reasons, which is the more useful half of this file.
//
// PRICED
//
//   india-to-saudi-arabia   SAR 300, and from the best kind of source there is:
//     not a help page but the Tourist Visa Regulations published by Saudi
//     Arabia's Ministry of Tourism, which says
//       "The amount of SAR (300) shall be collected as a fee for a Tourist
//        Visa, as prescribed by Royal Decree No. (2) dated 5/1/1441 AH."
//     A number fixed by royal decree does not drift between quarters or
//     between web pages. Approved medical insurance is a separate compulsory
//     requirement under the same regulation and is charged on top, which is
//     why the commonly quoted "SAR 535" is higher than the fee itself. Only
//     the fee is stated here; the insurance premium is not a fixed figure.
//
// NOT PRICED, and why. Two of these are the same reading trap in different
// clothes: a page says "free of charge", and the phrase belongs to a
// different group of people than the one you are reading about.
//
//   united-states-to-united-arab-emirates
//   united-kingdom-to-united-arab-emirates
//   india-to-united-arab-emirates
//     The UAE consulate page (mofa.gov.ae/en/missions/shanghai/services/Visas)
//     carries "free of charge" three times, and NOT ONCE for the list that
//     contains the UK and the USA on ordinary passports. Those nationals
//     "will be granted upon arrival a one-month non-renewable visa" — no fee
//     stated either way. The free-of-charge sentences belong to Chinese
//     nationals, to Russian nationals, and to DIPLOMATIC and official passport
//     holders. Quoting one of them as the British or American entitlement is
//     precisely the mistake that once gave this project a 90-day stay for
//     Americans by reading Britain's row. u.ae and icp.gov.ae render nothing
//     without JavaScript, so there is no better page to read yet.
//
//   india-to-maldives
//     Same shape. immigration.gov.mv says "Submission of the form is free of
//     charge" — of the Traveller Declaration, not of the visa — and states no
//     visa fee anywhere. The 30-day visa really is issued free, but that is
//     not something the Maldives says, and "free" is a claim about a reader's
//     money.
//
//   india-to-turkey       fee shown only inside the application flow; the
//                         published table is from 2014 and omits India.
//   india-to-mozambique   fee shown only inside the application flow.
//   india-to-south-africa Home Affairs declines to publish a figure at all.
//   india-to-belarus      mfa.gov.by does not answer from here.
//   india-to-israel       gov.il sits behind a bot challenge.
//   india-to-pakistan     visa.nadra.gov.pk returns Access Denied.
//
// TWO THINGS FOUND THAT ARE NOT FEES, both worth a look when someone has the
// official page in front of them:
//
//   1. pakistan-to-saudi-arabia claims a Tourist e-Visa. Saudi Arabia issues
//      that to a published list of eligible nationalities, and whether
//      Pakistan is on it could not be confirmed from any official page here.
//      The route is already on the manual-check list; this is a second reason
//      to look. No fee was written to it, because a price implies eligibility.
//
//   2. united-kingdom-to-united-arab-emirates says 90 days. The UAE consulate
//      page above puts the UK in the same list as the USA and calls it "a
//      one-month non-renewable visa" — but that page cites 2016 and 2017
//      decisions and may simply be old. Worth resolving against a current
//      source rather than against either page alone.
//
//   node scripts/add-fees-batch8.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ON = '2026-09-20';

const BATCH = {
  'india-to-saudi-arabia': [
    {
      appliesTo: 'Tourist e-Visa',
      amount: 'SAR 300',
      note: 'set by royal decree. Medical insurance approved in Saudi Arabia is compulsory and costs extra, so the total charged at checkout is higher',
      refundable: null,
      verifiedOn: ON,
      source: {
        url: 'https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/tourism-regulations/Tourist-Visa-Regulations-En-V012.pdf',
        label: "Saudi Ministry of Tourism — Tourist Visa Regulations",
      },
    },
  ],
};

let changed = 0;
for (const [slug, fees] of Object.entries(BATCH)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const data = res.data.data;
  const types = (data.visaOptions || []).map((o) => o.type);

  const typeSet = new Set(types);
  const orphans = fees.filter((f) => f.appliesTo !== '*' && !typeSet.has(f.appliesTo));
  if (orphans.length) {
    console.error(`  ! ${slug}: ${orphans.length} fee(s) match no visa option — SKIPPED`);
    orphans.forEach((o) => console.error(`      wanted "${o.appliesTo}"\n      page has: ${types.join(' | ')}`));
    continue;
  }
  const dupes = types.filter((t, i, a) => a.indexOf(t) !== i);
  if (fees.some((f) => dupes.includes(f.appliesTo))) {
    console.error(`  ! ${slug}: fee points at a name two options share — SKIPPED`);
    continue;
  }

  const priced = fees.some((f) => f.appliesTo === '*') ? types : types.filter((t) => fees.some((f) => f.appliesTo === t));
  const unpriced = types.filter((t) => !priced.includes(t));
  console.log(`${slug}${unpriced.length ? `   (left to the official source: ${unpriced.join(', ')})` : ''}`);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(10)} ${f.appliesTo === '*' ? 'every option on the page' : f.appliesTo}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(BATCH).length} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
