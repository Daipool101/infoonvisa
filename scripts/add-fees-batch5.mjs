// Visa fees, phase 2 — batch 5. Nine routes.
//
// The prize here is India's own e-Visa fee schedule, which prices five
// destination-India routes from two PDFs published by indianvisaonline.gov.in.
// It is also the clearest example yet of why a fee must be read for the
// specific nationality rather than looked up once and reused:
//
//   5-year e-Tourist Visa:  United Kingdom $484 · United States $160 · most
//                           countries $200 · Mongolia free
//   e-Business Visa:        United Kingdom $242 · United States $140 ·
//                           Canada and Jordan $120 · Mongolia free
//
// A single "Indian e-visa costs $x" would be wrong for almost everyone. India
// also prices the 30-day visa by SEASON — $10 April to June, $25 July to March
// — so that row carries both figures rather than picking one.
//
// Sources, all read 2026-09-14:
//   indianvisaonline.gov.in/evisa/images/Etourist_fee_final.pdf
//   indianvisaonline.gov.in/evisa/images/eTV_revised_fee_final.pdf
//     "Note: - Bank charge of 3% will be charged additional on applicable
//      e-Visa fees."
//     "e-Visa fee once submitted is non-refundable as the fee is for processing
//      of the application and is not dependent on either Grant or Rejection"
//   immigration.govt.nz — NZeTA "Cost From NZD $17"; IVL "NZD$100", and
//     "We do not refund the IVL, even if we decline your application."
//   canada.ca visitor visa — "Starting from: $CAN 100"
//   immi.homeaffairs.gov.au subclass 600 tourist stream — "From AUD250.00"
//   portal.moi.gov.qa — "Free on-Arrival Tourist Visa for a maximum of (30) days"
//
//   node scripts/add-fees-batch5.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ON = '2026-09-14';

const S = {
  indiaTourist: { url: 'https://indianvisaonline.gov.in/evisa/images/Etourist_fee_final.pdf', label: "India's official e-Tourist Visa fee schedule" },
  indiaOther: { url: 'https://indianvisaonline.gov.in/evisa/images/eTV_revised_fee_final.pdf', label: "India's official e-Visa fee schedule" },
  nzeta: { url: 'https://www.immigration.govt.nz/new-zealand-visas/visas/visa/nzeta', label: 'Immigration New Zealand' },
  canada: { url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/visitor-visa.html', label: 'the Government of Canada' },
  australia: { url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600/tourist-stream-overseas/', label: 'the Department of Home Affairs' },
  qatar: { url: 'https://portal.moi.gov.qa/wps/portal/MOIInternet/departmentcommittees/ganationalborderexpatriateaffairs/', label: "Qatar's Ministry of Interior" },
};

const INDIA_NO_REFUND =
  'No — India states the fee "is not dependent on either Grant or Rejection". A 3% bank charge is added on top';
const NOTHING_TO_REFUND = 'Nothing to refund — there is no fee';

// One row per nationality, straight from the two PDFs:
//   [30-day Apr–Jun, 30-day Jul–Mar, 1 year, 5 years, business, medical, attendant]
const INDIA_FEES = {
  'united-kingdom': [10, 25, 40, 484, 242, 129, 129],
  'united-states': [10, 25, 40, 160, 140, 100, 100],
  canada: [10, 25, 40, 200, 120, 80, 80],
  mongolia: [0, 0, 0, 0, 0, 0, 0],
  jordan: [10, 25, 40, 200, 120, 80, 80],
};

const usd = (n) => (n === 0 ? 'Free' : `US$${n}`);
const refundFor = (n) => (n === 0 ? { refundable: null, refundableNote: NOTHING_TO_REFUND } : { refundable: false, refundableNote: INDIA_NO_REFUND });

/** Build the fee list for one "-to-india" route from its own option names. */
function indiaFees(origin, optionTypes) {
  const [d30a, d30b, y1, y5, biz, med, att] = INDIA_FEES[origin];
  const out = [];
  const add = (type, amount, note, n, source) => out.push({ appliesTo: type, amount, note, ...refundFor(n), verifiedOn: ON, source });

  for (const t of optionTypes) {
    if (/e-?tourist/i.test(t) && /30[\s-]?day/i.test(t)) {
      add(t, d30a === d30b ? usd(d30a) : `${usd(d30a)} or ${usd(d30b)}`,
        d30a === d30b ? 'single entry, 30 days' : 'India prices this by season: April–June and July–March', d30a, S.indiaTourist);
    } else if (/e-?tourist/i.test(t) && /1[\s-]?year|1 Year/i.test(t)) {
      add(t, usd(y1), 'multiple entry, valid 1 year', y1, S.indiaTourist);
    } else if (/e-?tourist/i.test(t) && /5[\s-]?year|5 Years/i.test(t)) {
      add(t, usd(y5), 'multiple entry, valid 5 years', y5, S.indiaTourist);
    } else if (/e-?business/i.test(t)) {
      add(t, usd(biz), 'e-Business Visa', biz, S.indiaOther);
    } else if (/e-?medical attendant/i.test(t)) {
      add(t, usd(att), 'e-Medical Attendant Visa', att, S.indiaOther);
    } else if (/e-?medical/i.test(t)) {
      add(t, usd(med), 'e-Medical Visa', med, S.indiaOther);
    }
    // e-Conference and embassy/regular visas are deliberately left unpriced:
    // the published schedule does not give a figure we have read for them.
  }
  return out;
}

const BATCH = {};
for (const origin of Object.keys(INDIA_FEES)) BATCH[`${origin}-to-india`] = 'INDIA';

BATCH['united-states-to-new-zealand'] = [
  {
    appliesTo: 'NZeTA for Tourism', amount: 'From NZD $17',
    note: 'plus the NZD $100 International Visitor Levy. Valid 2 years; Immigration NZ quotes a "from" price',
    refundable: null,
    refundableNote: 'Immigration NZ does not refund the NZD $100 levy even if the request is declined',
    verifiedOn: ON, source: S.nzeta,
  },
];

BATCH['india-to-canada'] = [
  {
    appliesTo: 'Temporary Resident Visa (Visitor Visa)', amount: 'From CAN$100',
    note: 'the Government of Canada quotes a "starting from" price; biometrics are charged separately',
    refundable: null, verifiedOn: ON, source: S.canada,
  },
];

BATCH['india-to-australia'] = [
  {
    appliesTo: 'Visitor visa (subclass 600) - Tourist Stream', amount: 'From AUD 250',
    note: 'stays of up to 12 months; concessions apply in limited circumstances',
    refundable: null, verifiedOn: ON, source: S.australia,
  },
];

BATCH['india-to-qatar'] = [
  {
    appliesTo: 'Free tourist visa on arrival', amount: 'Free',
    note: 'Qatar issues Indian nationals a free on-arrival tourist visa for up to 30 days',
    refundable: null, refundableNote: NOTHING_TO_REFUND, verifiedOn: ON, source: S.qatar,
  },
];

let changed = 0;
for (const [slug, spec] of Object.entries(BATCH)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const data = res.data.data;
  const types = (data.visaOptions || []).map((o) => o.type);
  const fees = spec === 'INDIA' ? indiaFees(slug.replace('-to-india', ''), types) : spec;

  const typeSet = new Set(types);
  const orphans = fees.filter((f) => !typeSet.has(f.appliesTo));
  if (orphans.length) {
    console.error(`  ! ${slug}: ${orphans.length} fee(s) match no visa option — SKIPPED`);
    orphans.forEach((o) => console.error(`      wanted "${o.appliesTo}"\n      page has: ${types.join(' | ')}`));
    continue;
  }
  if (!fees.length) { console.error(`  ! ${slug}: nothing matched, skipped`); continue; }

  const unpriced = types.filter((t) => !fees.some((f) => f.appliesTo === t));
  console.log(`${slug}${unpriced.length ? `   (left to the official source: ${unpriced.join(', ')})` : ''}`);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(18)} ${f.appliesTo}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(BATCH).length} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
