// Visa fees, phase 2 — batch 4. Nine routes, not ten.
//
// Vietnam, Türkiye and Georgia were all in the shortlist and all three came out
// again. Vietnam publishes no fee on any readable page; Türkiye's official
// country fee schedule is stamped "AS OF 1 MAY 2014" and predates several
// policy changes; Georgia's portal shows nothing until you start an
// application. Ten routes with one guess among them would be worth less than
// nine with none, so the batch ships short.
//
// Two findings worth the reader's attention:
//
//   ESTA is now 40 USD, up from 21 on 30 September 2025, and it is charged in
//   two parts — 10 USD from everyone at application, 30 USD only if you are
//   approved. So a refused ESTA costs 10 USD, not 40. The same official page
//   carries a heading reading "Charged more than US $40 for ESTA?", which tells
//   you how common the overcharging is.
//
//   Sri Lanka made the tourist ETA free for 40 nationalities including India
//   from 25 May 2026 — a fee that used to be 20 to 50 USD is now nothing.
//
// Korea's fee is set per nationality: the standard is 40/90 USD, with an
// "Adjusted" table (Ghana, Russia, USA, Vietnam, Senegal, Azerbaijan…) and an
// exempt list. India appears in neither, so the standard rate applies — the
// same absence-is-the-answer reading used for Indonesia's VoA list.
//
//   node scripts/add-fees-batch4.mjs --dry-run
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
  sriLanka: { url: 'https://www.eta.gov.lk/slvisa/visainfo/fees.jsp?locale=en_US', label: 'the Sri Lanka ETA portal' },
  russia: { url: 'https://warsaw.kdmid.ru/en/russian-visa/On%20the%20issuance%20of%20unified%20electronic%20visas/', label: "Russia's Consular Department" },
  usMrv: { url: 'https://mk.usembassy.gov/visas/important-visa-information/', label: 'the U.S. Department of State' },
  esta: { url: 'https://uk.usembassy.gov/cbps-electronic-system-for-travel-authorization-esta/', label: 'U.S. Customs and Border Protection' },
  egypt: { url: 'https://visa2egypt.gov.eg/eVisa/FAQ', label: 'the Egypt e-Visa Portal' },
  japan: { url: 'https://www.mofa.go.jp/j_info/visit/visa/procedure/pagewe_000001_00391.html', label: "Japan's Ministry of Foreign Affairs" },
  korea: { url: 'https://overseas.mofa.go.kr/us-en/brd/m_4502/view.do?seq=715889&page=1', label: 'the Embassy of the Republic of Korea' },
  singapore: { url: 'https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa_requirements/visa-detail-page/india', label: "Singapore's Immigration & Checkpoints Authority" },
};

const US_MRV_NOTE = 'No — the fee is non-refundable and cannot be transferred to another country. It stays valid for 365 days from purchase';
const usMrv = (t, note) => ({ appliesTo: t, amount: 'US$185', note, refundable: false, refundableNote: US_MRV_NOTE, verifiedOn: ON, source: S.usMrv });
const esta = (t) => ({
  appliesTo: t, amount: 'US$40',
  note: 'US$10 charged to everyone at application, US$30 more only if you are approved — a refusal costs US$10',
  refundable: null,
  refundableNote: 'The US$30 authorisation fee is only charged if your application is approved',
  verifiedOn: ON, source: S.esta,
});
const JAPAN_NOT_CHARGED = 'The fee is only charged if the visa is issued — no visa, no fee';

const BATCH = {
  // "nationals of 40 countries are eligible to obtain tourist visa (ETA)
  // free-of-charge for a period of 30 days", India named, from 25 May 2026.
  'india-to-sri-lanka': [
    { appliesTo: 'Tourist ETA', amount: 'Free', note: '30 days, double entry — free for Indian nationals since 25 May 2026', refundable: null, refundableNote: 'Nothing to refund — there is no fee', verifiedOn: ON, source: S.sriLanka },
  ],

  // "about 52 USD" including consular fee, bank commission and verification.
  'india-to-russia': [
    { appliesTo: 'Unified Electronic Visa (e-Visa)', amount: 'about US$52', note: 'total including bank and processing charges; valid 120 days, 30-day stay', refundable: null, verifiedOn: ON, source: S.russia },
  ],

  'india-to-united-states': [
    usMrv('B-1/B-2 Visitor Visa (Tourism, Business, Medical Treatment)', 'the MRV application fee, paid whether or not the visa is granted'),
    usMrv('C-1 Transit Visa', 'the MRV application fee, paid whether or not the visa is granted'),
  ],
  'united-kingdom-to-united-states': [esta('ESTA (Visa Waiver Program)'), usMrv('B-2 Tourist Visa', 'only if you need a visa instead of an ESTA')],
  'finland-to-united-states': [esta('ESTA (Visa Waiver Program)'), usMrv('B-2 Tourist Visa', 'only if you need a visa instead of an ESTA')],

  // Brazil is on Egypt's e-visa eligibility list. The VoA row is left alone —
  // Egypt publishes no nationality list for visa on arrival.
  'brazil-to-egypt': [
    { appliesTo: 'Tourist e-Visa (Single Entry)', amount: 'US$30', note: 'Single entry, tourism', refundable: null, verifiedOn: ON, source: S.egypt },
    { appliesTo: 'Tourist e-Visa (Multiple Entry)', amount: 'US$65', note: 'Multiple entries, tourism', refundable: null, verifiedOn: ON, source: S.egypt },
  ],

  'belize-to-japan': [
    { appliesTo: 'Temporary Visitor Visa (Single Entry)', amount: 'about ¥15,000', note: 'single entry, from 1 July 2026; collected in local currency', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan },
    { appliesTo: 'Temporary Visitor Visa (Multiple Entry)', amount: 'about ¥30,000', note: 'multiple entry, from 1 July 2026; collected in local currency', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan },
  ],

  // Standard rates: India is in neither the adjusted nor the exempt table.
  // The business and transit rows are left alone — the schedule prices by
  // entries and length of stay, not by visa sub-type, so mapping them would be
  // a guess.
  'india-to-south-korea': [
    { appliesTo: 'Tourist Visa (C-3-9) - Single Entry', amount: 'US$40', note: 'single entry, stay of 90 days or less', refundable: null, verifiedOn: ON, source: S.korea },
    { appliesTo: 'Tourist Visa (C-3-9) - Multiple Entry', amount: 'US$90', note: 'multiple entry', refundable: null, verifiedOn: ON, source: S.korea },
  ],

  // "A S$30 non-refundable processing fee is payable online" — from ICA's own
  // India page, so this is the rate for Indian applicants specifically.
  'india-to-singapore': [
    { appliesTo: 'e-Visa (Social Visit Pass - Single Entry)', amount: 'S$30', note: 'processing fee, charged per application', refundable: false, refundableNote: 'No — ICA states the S$30 processing fee is non-refundable', verifiedOn: ON, source: S.singapore },
    { appliesTo: 'e-Visa (Social Visit Pass - Multiple Entry)', amount: 'S$30', note: 'processing fee, charged per application', refundable: false, refundableNote: 'No — ICA states the S$30 processing fee is non-refundable', verifiedOn: ON, source: S.singapore },
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

  const unpriced = [...types].filter((t) => !fees.some((f) => f.appliesTo === t));
  console.log(`${slug}${unpriced.length ? `   (left to the official source: ${unpriced.join(', ')})` : ''}`);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(16)} ${f.appliesTo}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(BATCH).length} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
