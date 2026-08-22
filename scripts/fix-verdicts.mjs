// Hand-authored corrections for pages whose ENTRY RULES changed after the page
// was generated. Each was verified against the official source named below on
// 2026-08-20. Not AI-generated: a verdict is the page's central claim and sits
// in the title, H1 and structured data, so it is written by hand or not at all.
//
//   node scripts/fix-verdicts.mjs           # dry run
//   node scripts/fix-verdicts.mjs --write   # apply
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const WRITE = process.argv.includes('--write');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ETA_SOURCE = {
  label: 'UK Government — apply for an Electronic Travel Authorisation',
  url: 'https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta',
};

// gov.uk: "You usually need an ETA rather than a visa if you're from Europe, the
// USA, Australia, Canada or certain other countries." An ETA costs £20.
const ukEta = (demonym, country) => ({
  verdict: 'eta',
  verdictHeadline: `${demonym} citizens need a UK Electronic Travel Authorisation (ETA) before travelling to the United Kingdom.`,
  summary: `${demonym} citizens do not need a visa for short visits to the United Kingdom, but they must now obtain an Electronic Travel Authorisation (ETA) before they travel. An ETA costs £20, is normally valid for two years or until your passport expires, and covers multiple visits of up to 6 months each. An ETA is not a visa and does not guarantee entry — a Border Force officer still decides admission on arrival.`,
  officialSource: ETA_SOURCE,
  firstOption: {
    type: 'Electronic Travel Authorisation (ETA)',
    validity: '2 years, or until your passport expires — whichever comes first',
    maxStay: '6 months per visit',
    entries: 'Multiple',
    eligibility: `Best for tourism, visiting family or friends, short-term study and permitted business activities. Required for ${demonym} citizens travelling without a visa.`,
  },
  applySteps: [
    { text: 'Apply for your ETA online or in the UK ETA app before you travel. You will need your passport, a photo, and a payment card.', link: ETA_SOURCE },
    { text: 'Most decisions arrive within minutes, but allow at least three working days in case yours is referred for extra checks.' },
    { text: 'Your ETA is linked to your passport electronically — there is nothing to print, though keeping the confirmation is sensible.' },
    { text: 'Travel with the same passport you applied with, and be ready to show proof of onward travel, funds and accommodation to the Border Force officer.' },
  ],
});

const CORRECTIONS = {
  // Verified: https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta
  'canada-to-united-kingdom': ukEta('Canadian', 'Canada'),
  'united-states-to-united-kingdom': ukEta('American', 'the United States'),

  // Verified: https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa
  // "Ordinary passport holders are exempted from visa up to 90 days in any
  // 180-day period." The e-Visa fee no longer applies to ordinary US passports.
  'united-states-to-turkey': {
    verdict: 'visa_free',
    verdictHeadline: 'American citizens can enter Türkiye visa-free for up to 90 days in any 180-day period.',
    summary:
      'Ordinary United States passport holders are exempt from the visa requirement for Türkiye and may stay up to 90 days within any 180-day period for tourism or business. The e-Visa that Americans previously had to buy is no longer required. Holders of official (non-ordinary) US passports still need a visa, and anyone intending to work, study or stay longer than 90 days must apply for the appropriate permit.',
    officialSource: {
      label: 'Republic of Türkiye Ministry of Foreign Affairs — visa information for foreigners',
      url: 'https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa',
    },
    firstOption: {
      type: 'Visa exemption (ordinary passport)',
      validity: 'No application required',
      maxStay: '90 days in any 180-day period',
      entries: 'Multiple, within the 90/180 limit',
      eligibility: 'Best for tourism and business visits on an ordinary US passport. Not for work, study or long stays.',
    },
    applySteps: [
      { text: 'Check that your passport is an ordinary (blue) US passport and valid for at least 60 days beyond your intended departure from Türkiye.' },
      { text: 'No visa application and no e-Visa fee is needed — book your travel as normal.' },
      { text: 'Count your days carefully: the limit is 90 days within any rolling 180-day period, not per entry.' },
      { text: 'At the border, be ready to show onward travel, accommodation details and proof of funds.' },
    ],
  },
};

// Options withdrawn by the authority: keep the page from advertising a visa
// category that no longer exists.
// Verified: https://www.in.emb-japan.go.jp/itpr_en/Visa.html — "Transit visa is abolished."
const REMOVE_OPTIONS = {
  'india-to-japan': /transit/i,
  'russia-to-japan': /transit/i,
  'china-to-japan': /transit/i,
};

const { data: rows, error } = await db.from('corridors').select('id,slug,data,status,generated_at');
if (error) { console.error(error.message); process.exit(1); }

let changed = 0;
const updates = [];

for (const r of rows) {
  const c = CORRECTIONS[r.slug];
  const removeRe = REMOVE_OPTIONS[r.slug];
  if (!c && !removeRe) continue;
  const d = { ...r.data };
  const notes = [];

  if (c) {
    notes.push(`verdict ${d.verdict} -> ${c.verdict}`);
    d.verdict = c.verdict;
    d.verdictHeadline = c.verdictHeadline;
    d.summary = c.summary;
    d.officialSource = { ...c.officialSource };
    // Keep the official source in the citation list too.
    d.sources = [{ ...c.officialSource }, ...(d.sources || []).filter((s) => s.url !== c.officialSource.url)].slice(0, 4);
    d.visaOptions = [{ ...c.firstOption }, ...(d.visaOptions || []).slice(1)];
    d.applySteps = c.applySteps;
  }

  if (removeRe) {
    const before = (d.visaOptions || []).length;
    d.visaOptions = (d.visaOptions || []).filter((o) => !removeRe.test(o.type || ''));
    const dropped = before - d.visaOptions.length;
    if (dropped) notes.push(`removed ${dropped} withdrawn visa option(s) matching ${removeRe}`);
    // Any FAQ promising a transit visa would now contradict the page.
    const faqBefore = (d.faq || []).length;
    d.faq = (d.faq || []).filter((f) => !/transit visa/i.test(f.q));
    if ((d.faq || []).length !== faqBefore) notes.push(`removed ${faqBefore - d.faq.length} transit-visa FAQ`);
  }

  if (!notes.length) continue;
  changed++;
  console.log(`~ ${r.slug}`);
  notes.forEach((n) => console.log(`    ${n}`));
  if (c) console.log(`    headline: ${c.verdictHeadline}`);
  // generated_at drives sitemap lastmod, so a corrected page must report today.
  updates.push({ id: r.id, data: d, verdict: d.verdict, generated_at: new Date().toISOString(), sources: d.sources });
}

console.log(`\n${changed} page(s) to correct`);
if (!WRITE) { console.log('\nDRY RUN — nothing written. Add --write to apply.'); process.exit(0); }

let ok = 0;
for (const u of updates) {
  const { error: e } = await db.from('corridors')
    .update({ data: u.data, verdict: u.verdict, generated_at: u.generated_at, sources: u.sources })
    .eq('id', u.id);
  if (e) console.error(`  write failed ${u.id}: ${e.message}`); else ok++;
}
console.log(`Wrote ${ok}/${updates.length} pages.`);
