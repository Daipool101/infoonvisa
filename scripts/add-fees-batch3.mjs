// Visa fees, phase 2 — batch 3 of 10 routes.
//
// The Schengen fee is the highest-leverage number on the whole site: it is set
// by EU law, not by each country, so one legal text prices eight destination
// pages at once and they cannot drift apart.
//
// Source: Regulation (EC) No 810/2009 (the Visa Code), consolidated text as at
// 11 June 2024, Article 16 — read on eur-lex.europa.eu 2026-09-13:
//   "Applicants shall pay a visa fee of EUR 90."
//   "Children from the age of six years and below the age of 12 years shall pay
//    a visa fee of EUR 45."
//   "the visa fee shall not be refundable except in the cases referred to in
//    Articles 18(2) and 19(3)"
// Children under six are exempt. The amount was raised from EUR 80 by Commission
// Delegated Regulation (EU) 2024/1415 with effect from 11 June 2024.
//
// Deliberately NOT priced here: the Airport Transit Visa (Type A) row that sits
// on most of these pages. The Visa Code plainly covers airport transit, but
// Article 16 as read speaks of "applicants" without naming Type A, and the rule
// on this project is that an unread line is an unpublished number. Those rows
// keep pointing at the official source.
//
//   node scripts/add-fees-batch3.mjs --dry-run
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
  visaCode: { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02009R0810-20240611', label: 'the EU Visa Code, Article 16' },
  ukVisit: { url: 'https://www.gov.uk/standard-visitor/apply-standard-visitor-visa', label: 'GOV.UK' },
  japan: { url: 'https://www.mofa.go.jp/j_info/visit/visa/procedure/pagewe_000001_00391.html', label: "Japan's Ministry of Foreign Affairs" },
};

const SCHENGEN_NOTE = 'Set by EU law, the same in every Schengen country. €45 for children aged 6–11; free under 6';
const SCHENGEN_REFUND = 'No — the Visa Code states the visa fee "shall not be refundable"';
const schengen = (type) => ({
  appliesTo: type,
  amount: '€90',
  note: SCHENGEN_NOTE,
  refundable: false,
  refundableNote: SCHENGEN_REFUND,
  verifiedOn: ON,
  source: S.visaCode,
});

// Every short-stay C row on a Schengen page takes the same fee, because the
// fee attaches to the application, not to the reason for travelling. Matching on
// the literal type strings keeps that explicit — if a page renames an option,
// the fee stops matching and the row falls back rather than guessing.
const C_ROWS = {
  'india-to-germany': ['Schengen Tourist Visa (Short Stay C-Visa)', 'Schengen Business Visa (Short Stay C-Visa)', 'Schengen Visiting Family/Friends Visa (Short Stay C-Visa)'],
  'india-to-italy': ["Schengen Tourist Visa (Short Stay 'C') - Single Entry", "Schengen Tourist Visa (Short Stay 'C') - Multiple Entry", "Schengen Business Visa (Short Stay 'C')", "Schengen Visa for Visiting Family/Friends (Short Stay 'C')"],
  'india-to-france': ['Short-stay Schengen Visa (Tourism)', 'Short-stay Schengen Visa (Visiting Family/Friends)', 'Short-stay Schengen Visa (Business)'],
  'india-to-spain': ['Schengen Tourist Visa (Type C)', 'Schengen Business Visa (Type C)', 'Schengen Visa for Visiting Family/Friends (Type C)'],
  'india-to-switzerland': ['Schengen Tourist Visa (Type C)', 'Schengen Business Visa (Type C)', 'Schengen Visit Family/Friends Visa (Type C)'],
  'india-to-poland': ['Schengen Tourist Visa (Type C)', 'Schengen Business Visa (Type C)', 'Schengen Visiting Family/Friends Visa (Type C)'],
  'india-to-iceland': ['Schengen Tourist Visa (Type C)', 'Schengen Business Visa (Type C)', 'Schengen Visiting Family/Friends Visa (Type C)'],
  'india-to-netherlands': ['Schengen Tourist Visa (Short Stay Type C)', 'Schengen Business Visa (Short Stay Type C)', 'Schengen Visiting Family/Friends Visa (Short Stay Type C)'],
};

const BATCH = Object.fromEntries(Object.entries(C_ROWS).map(([slug, types]) => [slug, types.map(schengen)]));

// "You will not get a refund of the application fee if you get a shorter visa
// or if your application is refused."
BATCH['nigeria-to-united-kingdom'] = [
  { appliesTo: 'Standard Visitor Visa', amount: '£135', note: 'up to 6 months', refundable: false, refundableNote: 'No — GOV.UK states the fee is not refunded if you get a shorter visa or your application is refused', verifiedOn: ON, source: S.ukVisit },
  { appliesTo: 'Long-term Standard Visitor Visa', amount: '£506 / £903 / £1,128', note: '2, 5 and 10 years — each visit still limited to 6 months', refundable: false, refundableNote: 'No — GOV.UK states the fee is not refunded if you get a shorter visa or your application is refused', verifiedOn: ON, source: S.ukVisit },
];

// Japan's amended consular fee order, in force from 1 July 2026. Only the rows
// whose entry count the page states are priced: a "visiting relatives" or
// "business" row could be issued as either single or multiple entry, and
// guessing which would put the wrong one of two very different numbers on it.
const JAPAN_NOT_CHARGED = 'The fee is only charged if the visa is issued — no visa, no fee';
BATCH['philippines-to-japan'] = [
  { appliesTo: 'Embassy Visa (Temporary Visitor - Single Entry for Tourism)', amount: 'about ¥15,000', note: 'single entry, from 1 July 2026; collected in local currency', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan },
  { appliesTo: 'Embassy Visa (Temporary Visitor - Multiple Entry for Tourism)', amount: 'about ¥30,000', note: 'multiple entry, from 1 July 2026; collected in local currency', refundable: null, refundableNote: JAPAN_NOT_CHARGED, verifiedOn: ON, source: S.japan },
];

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
  console.log(`${slug}  (${fees.length} priced${unpriced.length ? `, ${unpriced.length} left to the official source: ${unpriced.join(', ')}` : ''})`);
  fees.forEach((f) => console.log(`    ${f.amount.padEnd(20)} ${f.appliesTo}`));

  if (!DRY) {
    const upd = await db.from('corridors').update({ data: { ...data, fees } }).eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed}/${Object.keys(BATCH).length} route(s) ${DRY ? 'would get' : 'now have'} a verified fee.`);
if (DRY) console.log('DRY RUN — nothing written.');
