// Visa fees, phase 2 — batch 7. Four more of the twenty-one parked routes.
//
// Three of these four price by NUMBER OF ENTRIES rather than by visa type,
// which is why they carry a wildcard. China charges the same whether you ask
// for a tourist L, a business M, a family Q2 or a transit G; what moves the
// price is how many times you want to come in. A per-option fee here would be
// four copies of one number pretending to be four facts.
//
//   us-to-china     $140 flat for a US citizen, whatever the entries.
//                   This is a REDUCED rate. The embassy's notice says it runs
//                   "until December 31, 2026" — so this row has an expiry, and
//                   the page should be re-read in January.
//   india-to-china  Rs 2,900 single, and the schedule itself says it "will be
//                   adjusted every quarter in accordance with exchange rate of
//                   USD and Rs". A rupee figure here is true for a quarter, not
//                   for a year, which the verified-on date now says out loud.
//   bhutan          The $40 visa fee is the small half of the price. Bhutan
//                   charges a Sustainable Development Fee of $100 per adult per
//                   DAY on top, so a week costs $740, not $40. Quoting the $40
//                   alone would be accurate and deeply misleading.
//   brazil          $80.90, read on Brazil's own consulate page rather than on
//                   the application portal.
//
// Three more were tried and could not be priced. Recorded here because the
// reason is the useful part, and because someone will otherwise try again:
//
//   india-to-south-africa  Home Affairs declines to publish a number at all:
//       "there is a fee charged for issuing a visa, and you should check the
//        cost with the office as well as this is updated annually. The fee is
//        payable in different currencies in different countries."
//       (bma.gov.za/wp-content/uploads/2025/08/VISAS-1.pdf, page 1)
//   india-to-turkey  The published country fee table
//       (mfa.gov.tr/data/KONSOLOSLUK/vize-harc-miktarlari-en.pdf) is dated
//       10 November 2014 and does not list India at all — Indians hold a
//       conditional e-visa, priced only inside the application flow. The
//       embassy in New Delhi says the amount is visible after you select your
//       country on the portal, and says no more than that.
//   india-to-mozambique  Same shape: the portal describes every visa type and
//       reveals the fee only once an application is under way.
//
//   node scripts/add-fees-batch7.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ON = '2026-09-20';

const S = {
  chinaUS: {
    url: 'https://us.china-embassy.gov.cn/eng/lsfw/zj/qz2021/202412/t20241227_11519914.htm',
    label: 'Chinese Embassy in the United States — notice on visa fees',
  },
  chinaIN: {
    url: 'https://www.visaforchina.cn/DEL3_EN/qianzhengyewu/jichuzhishi/feiyongbiaozhunjishixian',
    label: 'Chinese visa application centre, New Delhi — schedule of fees',
  },
  brazil: {
    url: 'https://www.gov.br/mre/pt-br/consulado-miami/information-about-visas-in-english/electronic-visitor-visa-e-visa',
    label: 'Consulate-General of Brazil — electronic visitor visa',
  },
  bhutan: {
    url: 'https://bhutan.travel/visa',
    label: "Bhutan's Department of Tourism — visa",
  },
};

const BATCH = {
  'united-states-to-china': [
    {
      appliesTo: '*',
      amount: 'US$140',
      note: 'one flat rate for US citizens whatever the visa type or number of entries. A reduced rate, in force until 31 December 2026',
      refundable: null,
      verifiedOn: ON,
      source: S.chinaUS,
    },
  ],
  'india-to-china': [
    {
      appliesTo: '*',
      amount: '₹2,900',
      note: 'single entry. Double ₹4,400, six-month multiple ₹5,900, one-year multiple ₹8,800. Re-set every quarter with the exchange rate, and an application-centre charge is added on top',
      refundable: null,
      verifiedOn: ON,
      source: S.chinaIN,
    },
  ],
  'united-states-to-brazil': [
    {
      appliesTo: 'Tourist e-Visa',
      amount: 'US$80.90',
      note: 'as listed by Brazil for United States citizens',
      refundable: null,
      verifiedOn: ON,
      source: S.brazil,
    },
  ],
  'argentina-to-bhutan': [
    {
      appliesTo: 'Tourist Visa',
      amount: 'US$40',
      note: 'a one-off application fee. Bhutan also charges a Sustainable Development Fee of US$100 per adult per day of the stay, so a seven-day visit costs US$740 on top of this',
      refundable: false,
      refundableNote: 'No — Bhutan states the visa application fee is non-refundable',
      verifiedOn: ON,
      source: S.bhutan,
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
