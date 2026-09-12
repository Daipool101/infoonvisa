// Visa fees, phase 2 — batch 1 of 10 routes.
//
// Every amount below was read on the destination government's own page, by us,
// on the date recorded against it. Nothing here is an estimate, a range or a
// figure carried over from a travel blog: a wrong fee is worse than no fee,
// because a reader budgets against it. Routes whose fee we could not read stay
// as they are and keep pointing at the official source.
//
// Deliberately absent, per the agreed rules:
//   · no service or visa-centre fee line, and no provider names
//   · no "approximately", no converted amounts — the currency the government
//     charges in is the one shown, because that is what the reader pays
//   · `refundable: null` where the official page is silent. Saying "usually
//     non-refundable" would be us guessing about the reader's money.
//
//   node scripts/add-fees.mjs --dry-run
//   node scripts/add-fees.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ON = '2026-09-12';

// ---- the sources, each read directly ----
const S = {
  indonesia: { url: 'https://www.imigrasi.go.id/berita/2022/07/20/how-to-get-visa-on-arrival-in-indonesia?lang=en-US', label: 'the Directorate General of Immigration' },
  egypt: { url: 'https://visa2egypt.gov.eg/eVisa/FAQ', label: 'the Egypt e-Visa Portal' },
  azerbaijan: { url: 'https://www.mfa.gov.az/en/category/visa/asan-visa', label: "Azerbaijan's Ministry of Foreign Affairs" },
  israel: { url: 'https://israel-entry.piba.gov.il/learn-about', label: 'the Israel Population and Immigration Authority' },
  australia: { url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601', label: 'the Department of Home Affairs' },
};

// appliesTo matches visaOption.type exactly, or '*' for every option on the page.
const BATCH = {
  // "Visa on Arrival costs Rp 500.000, according to Government Regulation
  // No. 28 of 2019." Indonesia charges the same to every VoA nationality, so
  // one figure covers all four routes.
  'india-to-indonesia': [
    { appliesTo: 'e-VOA (Electronic Visa on Arrival)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
    { appliesTo: 'Visa on Arrival (VoA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
  ],
  'united-states-to-indonesia': [
    { appliesTo: 'Visa on Arrival (VOA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
    { appliesTo: 'Electronic Visa on Arrival (e-VOA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
  ],
  'australia-to-indonesia': [
    { appliesTo: 'Visa on Arrival (VOA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
    { appliesTo: 'e-Visa on Arrival (e-VOA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
  ],
  'switzerland-to-indonesia': [
    { appliesTo: 'Visa on Arrival (VOA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
    { appliesTo: 'Electronic Visa on Arrival (e-VOA)', amount: 'Rp 500,000', note: '30 days, extendable once', refundable: null, verifiedOn: ON, source: S.indonesia },
  ],

  // Egypt publishes a two-row table: "Single entry visa (Tourism) 30$",
  // "Multiple entries visa (Tourism) 65$". The amounts attach to the matching
  // option only — a single-entry fee on a multiple-entry row would be the exact
  // kind of wrong number this work exists to avoid.
  'india-to-egypt': 'EGYPT',
  'united-states-to-egypt': 'EGYPT',
  'new-zealand-to-egypt': 'EGYPT',

  // "E-visa is issued within 3 (three) working days, it will be valid for 30
  // days and the fee for it is 20$." Urgent service: "within 3 hours and the
  // fee is $60."
  'india-to-azerbaijan': [
    { appliesTo: 'Standard e-Visa (ASAN Visa)', amount: 'US$20', note: 'issued within 3 working days', refundable: null, verifiedOn: ON, source: S.azerbaijan },
    { appliesTo: 'Urgent e-Visa (ASAN Visa)', amount: 'US$60', note: 'issued within 3 hours', refundable: null, verifiedOn: ON, source: S.azerbaijan },
  ],

  // "Cost 25 NIS — Application fee (You cannot get a refund after you apply)".
  // The only route in this batch where refundability is stated outright.
  // Scoped to the ETA-IL row: the B/2 visitor visa is a different product with
  // a different fee we have not read.
  'united-states-to-israel': [
    { appliesTo: 'ETA-IL (Electronic Travel Authorization)', amount: '25 NIS', note: 'per application', refundable: false, verifiedOn: ON, source: S.israel },
  ],

  // "There is a service charge of AUD20 to use the Australian ETA app. There is
  // no other charge payable for an ETA." Worth stating plainly, because readers
  // expect a visa fee on top and there is none. Emphatically NOT applied to the
  // subclass 600 row on the same page, which costs an order of magnitude more.
  'united-states-to-australia': [
    { appliesTo: 'Electronic Travel Authority (ETA) (subclass 601)', amount: 'AUD 20', note: 'app service charge — there is no separate ETA fee', refundable: null, verifiedOn: ON, source: S.australia },
  ],
};

// Egypt's fees are per entry-type, so they are matched against whatever the page
// actually calls its options rather than hard-coded per route.
function egyptFees(options) {
  const out = [];
  for (const o of options) {
    const t = o.type || '';
    if (!/e-?visa/i.test(t)) continue;
    const multiple = /multiple/i.test(t);
    out.push({
      appliesTo: t,
      amount: multiple ? 'US$65' : 'US$30',
      note: multiple ? 'Multiple entries, tourism' : 'Single entry, tourism',
      refundable: null,
      verifiedOn: ON,
      source: S.egypt,
    });
  }
  return out;
}

let changed = 0;
for (const [slug, spec] of Object.entries(BATCH)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const data = res.data.data;
  const fees = spec === 'EGYPT' ? egyptFees(data.visaOptions || []) : spec;

  if (!fees.length) { console.error(`  ! ${slug}: no matching visa option, skipped`); continue; }

  // A fee that matches no option would render nowhere — catch it here rather
  // than shipping a page that silently drops the amount.
  const types = new Set((data.visaOptions || []).map((o) => o.type));
  const orphans = fees.filter((f) => f.appliesTo !== '*' && !types.has(f.appliesTo));
  if (orphans.length) {
    console.error(`  ! ${slug}: ${orphans.length} fee(s) match no visa option — skipped`);
    orphans.forEach((o) => console.error(`      wanted "${o.appliesTo}"; page has: ${[...types].join(' | ')}`));
    continue;
  }

  console.log(`${slug}`);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(14)} ${f.appliesTo === '*' ? '(all options)' : f.appliesTo} — refundable: ${f.refundable === null ? 'not stated' : f.refundable}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
