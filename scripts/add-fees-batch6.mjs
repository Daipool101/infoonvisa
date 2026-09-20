// Visa fees, phase 2 — batch 6. The first five of the twenty-one routes the
// earlier batches left unpriced.
//
// These were parked as "no published schedule". Three of them turned out to
// have one; the schedule was simply not where the page's own source link
// pointed.
//
// Vietnam: the fee is on the Immigration Department's portal, but not on the
// page a reader lands on. The homepage says only that the fee "will not be
// refunded if the application is refused"; the amounts sit one click deeper,
// on the apply page, as a two-line aside in step 2:
//     "- $25/single-entry electronic visa  - $50/multiple-entry electronic visa"
// Note also that Vietnam moved its portal to evisa.gov.vn in November 2024 and
// all three of our Vietnam pages still cite the old xuatnhapcanh.gov.vn
// domain. The old domain still serves, and is still the Immigration
// Department's, so the fee is sourced to the page actually carrying it —
// but those source links want updating separately.
//
// Georgia: the e-visa portal buries the amount in a payments FAQ — "How much
// is a visa fee? 20 USD + 2% service fee" — and, in the same FAQ, "e-Visa fee
// is not refundable". The Georgian embassy in the UAE publishes the same
// figure as a consular tariff ("C1 category — 20 USD / 75 AED") with no
// separate rate for multiple entry, which is why both of Georgia's options
// carry the same number here rather than one being left blank.
//
// Norway: there is no Norwegian fee page to read — UDI blocks automated
// readers — and there does not need to be. The amount is fixed in EU law that
// binds Norway as a Schengen state, in the Visa Code itself:
//     "Applicants shall pay a visa fee of EUR 90."
//     "Children from the age of six years and below the age of 12 years shall
//      pay a visa fee of EUR 45."  (waived below six)
//     "...shall not be refundable except in the cases referred to in
//      Articles 18(2) and 19(3)."
// It is the one row in this batch that applies to every option on its page:
// the Visa Code's fee covers short-stay C visas and airport transit A visas
// alike, so a wildcard here is accurate rather than lazy. It also happens to
// be the only way to price that page at all — two of its options share a name,
// and a named fee may not point at a name two options share.
//
//   node scripts/add-fees-batch6.mjs --dry-run
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
  vietnam: {
    url: 'https://evisa.xuatnhapcanh.gov.vn/en_US/web/guest/khai-thi-thuc-dien-tu/cap-thi-thuc-dien-tu',
    label: "Viet Nam Immigration Department — e-visa application page",
  },
  georgia: {
    url: 'https://www.evisa.gov.ge/GeoVisa/en/Home/FAQ',
    label: "Georgia's official e-Visa portal",
  },
  visaCode: {
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02009R0810-20240611',
    label: 'Article 16 of the EU Visa Code (Regulation 810/2009, consolidated)',
  },
};

const VN_NO_REFUND = 'No — the Immigration Department states the fee is not refunded if the application is refused';
const GE_NO_REFUND = 'No — Georgia’s portal states the e-Visa fee is not refundable, including if you do not use the visa';
const SCHENGEN_NO_REFUND = 'No — the Visa Code says the fee is not refundable except where a consulate was not competent to examine the application';

const vnFee = (type, multiple) => ({
  appliesTo: type,
  amount: multiple ? 'US$50' : 'US$25',
  note: multiple ? 'multiple entry, up to 90 days' : 'single entry, up to 90 days',
  refundable: false,
  refundableNote: VN_NO_REFUND,
  verifiedOn: ON,
  source: S.vietnam,
});

const geFee = (type) => ({
  appliesTo: type,
  amount: 'US$20',
  note: 'plus a 2% payment surcharge taken at checkout',
  refundable: false,
  refundableNote: GE_NO_REFUND,
  verifiedOn: ON,
  source: S.georgia,
});

const BATCH = {
  'india-to-vietnam': [vnFee('E-visa (Single Entry)', false), vnFee('E-visa (Multiple Entry)', true)],
  'united-states-to-vietnam': [
    vnFee('E-visa (Tourist - Single Entry)', false),
    vnFee('E-visa (Tourist - Multiple Entry)', true),
  ],
  'mexico-to-vietnam': [
    vnFee('e-Visa (Tourist - Single Entry)', false),
    vnFee('e-Visa (Tourist - Multiple Entry)', true),
  ],
  'india-to-georgia': [
    geFee('Short-term Single Entry e-Visa (Category C)'),
    geFee('Short-term Multiple Entry e-Visa (Category C)'),
  ],
  'india-to-norway': [
    {
      appliesTo: '*',
      amount: '€90',
      note: '€45 for children aged 6 to 11, and free below six. Set in EU law and the same at every Schengen consulate',
      refundable: false,
      refundableNote: SCHENGEN_NO_REFUND,
      verifiedOn: ON,
      source: S.visaCode,
    },
  ],
};

let changed = 0;
for (const [slug, fees] of Object.entries(BATCH)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const data = res.data.data;
  const types = (data.visaOptions || []).map((o) => o.type);

  // The check that caught batch 1's wildcard mistake, kept: a fee naming an
  // option that does not exist prices nothing and says nothing about why.
  const typeSet = new Set(types);
  const orphans = fees.filter((f) => f.appliesTo !== '*' && !typeSet.has(f.appliesTo));
  if (orphans.length) {
    console.error(`  ! ${slug}: ${orphans.length} fee(s) match no visa option — SKIPPED`);
    orphans.forEach((o) => console.error(`      wanted "${o.appliesTo}"\n      page has: ${types.join(' | ')}`));
    continue;
  }
  // And the rule the dashboard enforces: a named fee may not point at a name
  // two options share, or one price lands on two rows that cost differently.
  const dupes = types.filter((t, i, a) => a.indexOf(t) !== i);
  const ambiguous = fees.filter((f) => dupes.includes(f.appliesTo));
  if (ambiguous.length) {
    console.error(`  ! ${slug}: fee points at a name two options share — SKIPPED`);
    continue;
  }

  const priced = fees.some((f) => f.appliesTo === '*')
    ? types
    : types.filter((t) => fees.some((f) => f.appliesTo === t));
  const unpriced = types.filter((t) => !priced.includes(t));
  console.log(`${slug}${unpriced.length ? `   (left to the official source: ${unpriced.join(', ')})` : ''}`);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(8)} ${f.appliesTo === '*' ? 'every option on the page' : f.appliesTo}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(BATCH).length} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
