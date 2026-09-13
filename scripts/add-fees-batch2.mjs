// Visa fees, phase 2 — batch 2 of 10 routes.
//
// Same rule as batch 1: every amount read on the government's own page, on the
// date recorded. Nothing inferred, nothing carried over from elsewhere.
//
// The find of this batch is Japan. Its consular fees were amended by Cabinet
// Order with effect from 1 July 2026 and went up roughly fivefold — a
// single-entry visa moved from about 3,000 yen to about 15,000 yen. Japan's own
// fee page still shows the old figures with a note pointing at the new ones, so
// anyone reading the obvious page today gets a number that is wrong by a factor
// of five. That is worth publishing carefully and dating clearly.
//
// Amounts are quoted in the government's own words. Where a page says "about"
// or "from", so do we: Japan converts into local currency at each mission, and
// New Zealand's fee varies by where you apply. Rounding those to a hard number
// would invent a precision the source does not have.
//
//   node scripts/add-fees-batch2.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ON = '2026-09-13';

const S = {
  ukEta: { url: 'https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta', label: 'GOV.UK' },
  ukVisit: { url: 'https://www.gov.uk/standard-visitor/apply-standard-visitor-visa', label: 'GOV.UK' },
  canadaEta: { url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/apply.html', label: 'the Government of Canada' },
  japan: { url: 'https://www.mofa.go.jp/j_info/visit/visa/procedure/pagewe_000001_00391.html', label: "Japan's Ministry of Foreign Affairs" },
  hongKong: { url: 'https://www.immd.gov.hk/eng/services/visas/pre-arrival_registration_for_indian_nationals.html', label: 'the Hong Kong Immigration Department' },
  australia651: { url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651', label: 'the Department of Home Affairs' },
  australia601: { url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601', label: 'the Department of Home Affairs' },
  nz: { url: 'https://www.immigration.govt.nz/new-zealand-visas/visas/visa/visitor-visa', label: 'Immigration New Zealand' },
};

// "Fees must be paid for the issuance of visas… If a visa is not issued, no visa
// fee will be charged." Not a refund — the charge never happens.
const JAPAN_NOT_CHARGED = 'The fee is only charged if the visa is issued — no visa, no fee';
const japanFees = (single, multiple, transit) => [
  { appliesTo: single, amount: 'about ¥15,000', note: 'single entry, from 1 July 2026; collected in local currency', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan },
  { appliesTo: multiple, amount: 'about ¥30,000', note: 'multiple entry, from 1 July 2026; collected in local currency', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan },
  ...(transit ? [{ appliesTo: transit, amount: 'about ¥15,000', note: 'the single-entry rate; Japan no longer lists a separate transit fee from 1 July 2026', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan }] : []),
];

// "You will not get a refund of the application fee if you get a shorter visa
// or if your application is refused."
const UK_NO_REFUND = 'No — GOV.UK states the fee is not refunded if you get a shorter visa or your application is refused';
const ukVisitor = (t) => ({ appliesTo: t, amount: '£135', note: 'Standard Visitor, up to 6 months (£506 for 2 years, £903 for 5, £1,128 for 10)', refundable: false, refundableNote: UK_NO_REFUND, verifiedOn: ON, source: S.ukVisit });
const ukEta = (t) => ({ appliesTo: t, amount: '£20', note: 'per application', refundable: null, verifiedOn: ON, source: S.ukEta });

const BATCH = {
  'canada-to-united-kingdom': [ukEta('Electronic Travel Authorisation (ETA)')],
  'united-states-to-united-kingdom': [ukEta('Electronic Travel Authorisation (ETA)'), ukVisitor('Standard Visitor Visa (Applied)')],
  'india-to-united-kingdom': [ukVisitor('Standard Visitor Visa')],

  // "It only costs CAN$7" and the page calls the fee non-refundable outright.
  'united-kingdom-to-canada': [
    { appliesTo: 'Electronic Travel Authorization (eTA)', amount: 'CAN$7', note: 'per application', refundable: false, refundableNote: 'No — the Government of Canada states the eTA fee is non-refundable', verifiedOn: ON, source: S.canadaEta },
  ],

  'india-to-japan': japanFees('Temporary Visitor Visa (Tourism - Single Entry)', 'Temporary Visitor Visa (Tourism - Multiple Entry)'),
  'russia-to-japan': japanFees('Temporary Visitor Visa (Tourism - Single Entry)', 'Temporary Visitor Visa (Tourism - Multiple Entry)'),
  'china-to-japan': japanFees('Temporary Visitor Visa (Single Entry - Tourism)', 'Temporary Visitor Visa (Multiple Entry - Tourism)'),

  // "An Indian national can make use of the online service to apply for
  // pre-arrival registration free of charge." Free, and worth saying loudly:
  // unofficial sites charge for this.
  'india-to-hong-kong': [
    { appliesTo: 'Pre-arrival Registration (PAR)', amount: 'Free', note: 'valid 6 months; 14 days per visit. Unofficial sites charge for it — the government does not', refundable: null, refundableNote: 'Nothing to refund — there is no fee', verifiedOn: ON, source: S.hongKong },
  ],

  // eVisitor "Cost: Free"; the ETA on the same page carries the AUD20 app
  // service charge, so the two rows must not share a figure.
  'united-kingdom-to-australia': [
    { appliesTo: 'eVisitor (subclass 651)', amount: 'Free', note: 'no charge for this visa', refundable: null, refundableNote: 'Nothing to refund — there is no fee', verifiedOn: ON, source: S.australia651 },
    { appliesTo: 'Electronic Travel Authority (ETA) (subclass 601)', amount: 'AUD 20', note: 'app service charge — there is no separate ETA fee', refundable: null, verifiedOn: ON, source: S.australia601 },
  ],

  // Immigration NZ publishes "From NZD $441" — the "from" is theirs, because the
  // fee depends on where you apply. Quoted as written rather than hardened.
  'india-to-new-zealand': [
    { appliesTo: 'Visitor Visa', amount: 'From NZD $441', note: 'Immigration New Zealand quotes a "from" price — it varies by where you apply', refundable: null, verifiedOn: ON, source: S.nz },
  ],
};

let changed = 0;
for (const [slug, fees] of Object.entries(BATCH)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const data = res.data.data;

  const types = new Set((data.visaOptions || []).map((o) => o.type));
  const orphans = fees.filter((f) => f.appliesTo !== '*' && !types.has(f.appliesTo));
  if (orphans.length) {
    console.error(`  ! ${slug}: ${orphans.length} fee(s) match no visa option — SKIPPED`);
    orphans.forEach((o) => console.error(`      wanted "${o.appliesTo}"\n      page has: ${[...types].join(' | ')}`));
    continue;
  }

  console.log(slug);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(16)} ${f.appliesTo}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(BATCH).length} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
