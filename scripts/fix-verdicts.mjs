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
  // Verified: https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/facts.html
  // "U.S. citizens are exempt from the eTA requirement and must carry proper
  // identification such as a valid U.S. passport." The page demanded an eTA.
  'united-states-to-canada': {
    verdict: 'visa_free',
    verdictHeadline: 'American citizens do not need a visa or an eTA to visit Canada — a valid US passport is enough.',
    summary:
      'American citizens are exempt from both the visitor visa and the electronic travel authorisation (eTA) for Canada. You need proper identification, normally a valid US passport, and you are admitted for up to six months at the discretion of the border services officer. Lawful permanent residents of the United States are also eTA-exempt but must carry their green card together with a passport from their country of nationality.',
    officialSource: {
      label: 'Government of Canada — about the eTA (exemptions)',
      url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/facts.html',
    },
    firstOption: {
      type: 'Visitor entry (no visa or eTA required)',
      validity: 'No application required',
      maxStay: 'Usually up to 6 months, set by the officer on arrival',
      entries: 'Multiple',
      eligibility: 'Best for tourism, family visits and business trips on a US passport.',
    },
    applySteps: [
      { text: 'Carry a valid US passport. Other documents such as a birth certificate are not sufficient for air travel.' },
      { text: 'Do not apply or pay for an eTA — US citizens are exempt, and sites charging for one are not official.' },
      { text: 'Be ready to show onward travel, funds and where you will stay if the officer asks.' },
      { text: 'Ask for a longer stay to be recorded on arrival if you plan to remain beyond six months.' },
    ],
  },

  // Verified: https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa
  // "Ordinary passport holders who travel for touristic purposes are exempt from
  // visas for up to 90 days in any 180 day period." The page sold them an e-Visa.
  'united-kingdom-to-turkey': {
    verdict: 'visa_free',
    verdictHeadline: 'British citizens can enter Türkiye visa-free for up to 90 days in any 180-day period.',
    summary:
      'British ordinary passport holders travelling for tourism are exempt from the visa requirement for Türkiye and may stay up to 90 days within any 180-day period. The e-Visa that British travellers used to buy is no longer needed. Holders of British National (Overseas), British Subject or British Protected Person passports are not covered by the exemption and must obtain a visa from a Turkish mission.',
    officialSource: {
      label: 'Republic of Türkiye Ministry of Foreign Affairs — visa information for foreigners',
      url: 'https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa',
    },
    firstOption: {
      type: 'Visa exemption (ordinary British passport)',
      validity: 'No application required',
      maxStay: '90 days in any 180-day period',
      entries: 'Multiple, within the 90/180 limit',
      eligibility: 'Best for tourism on an ordinary British passport. Not for work, study or stays beyond 90 days.',
    },
    applySteps: [
      { text: 'Check you hold an ordinary British passport — BN(O), British Subject and British Protected Person holders still need a visa.' },
      { text: 'No visa or e-Visa is required, so there is nothing to apply for and nothing to pay.' },
      { text: 'Track your days: the limit is 90 within any rolling 180-day period, not per entry.' },
      { text: 'Carry proof of onward travel and accommodation in case the border officer asks.' },
    ],
  },

  // Verified: https://overseas.mofa.go.kr/us-en/brd/m_4502/view.do?seq=715890
  // "The countries/regions that are currently exempt from K-ETA (including the
  // U.S.A) are subject to this extension… From January 1, 2026 to December 31,
  // 2026." So an American needs no K-ETA today — the page demanded one. The
  // exemption is dated, so the page says when it ends rather than implying
  // it is permanent.
  'united-states-to-south-korea': {
    verdict: 'visa_free',
    verdictHeadline:
      'American citizens can visit South Korea visa-free for up to 90 days, and are exempt from K-ETA until 31 December 2026.',
    summary:
      'American citizens do not need a visa for tourism in South Korea and may stay up to 90 days. They are also temporarily exempt from the K-ETA travel authorisation: the Ministry of Justice has extended that exemption to 31 December 2026, so no K-ETA is required for arrivals before then. Applying for a K-ETA anyway is optional and carries a fee, but it lets you skip the paper arrival card. Check the official notice before you travel, as the exemption is renewed year by year rather than being permanent.',
    officialSource: {
      label: 'Embassy of the Republic of Korea in the USA — K-ETA exemption notice',
      url: 'https://overseas.mofa.go.kr/us-en/brd/m_4502/view.do?seq=715890',
    },
    firstOption: {
      type: 'Visa exemption (K-ETA waived to 31 Dec 2026)',
      validity: 'No application required while the exemption lasts',
      maxStay: '90 days',
      entries: 'Multiple',
      eligibility:
        'Best for tourism and short visits on an ordinary US passport. A K-ETA is optional until 31 December 2026 and expected to be required again afterwards.',
    },
    applySteps: [
      { text: 'Check your passport is valid for the whole of your stay in South Korea.' },
      { text: 'No visa and no K-ETA is needed for arrivals up to 31 December 2026 — you may travel without applying for anything.' },
      {
        text: 'Optional: apply for a K-ETA anyway if you would rather skip the paper arrival card on the plane. A fee applies.',
        link: { label: 'Official K-ETA portal', url: 'https://www.k-eta.go.kr/portal/apply/index.do' },
      },
      { text: 'Re-check the official notice close to your travel date — the exemption is extended a year at a time, not granted permanently.' },
    ],
  },

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
