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
  // Verified: https://www.imi.gov.my/index.php/en/main-services/visa/visa-requirement-by-country/
  // Malaysia's Immigration Department: "India citizen: visa exempts until 31st
  // December 2026." The page was selling an e-visa that is not needed. The
  // exemption is dated, so the page says so rather than implying permanence.
  'india-to-malaysia': {
    verdict: 'visa_free',
    verdictHeadline: 'Indian citizens can enter Malaysia visa-free until 31 December 2026.',
    summary:
      'Malaysia has exempted Indian passport holders from its visa requirement for tourism, and the exemption currently runs to 31 December 2026. No visa or e-visa application is needed for a short visit while it is in force. You must still complete the Malaysia Digital Arrival Card before you travel, and carry a return ticket, accommodation details and proof of funds. Because the exemption is granted for a fixed period rather than permanently, check the Immigration Department before booking travel beyond that date.',
    officialSource: {
      label: 'Immigration Department of Malaysia — visa requirement by country',
      url: 'https://www.imi.gov.my/index.php/en/main-services/visa/visa-requirement-by-country/',
    },
    firstOption: {
      type: 'Visa exemption (to 31 December 2026)',
      validity: 'No application required while the exemption lasts',
      maxStay: 'Short tourist stay as granted on arrival',
      entries: 'Multiple',
      eligibility: 'Best for tourism and short visits on an Indian passport, for arrivals up to 31 December 2026.',
    },
    applySteps: [
      { text: 'Check your passport has at least six months validity left.' },
      { text: 'No visa or e-visa is required for arrivals up to 31 December 2026 — do not pay a third-party site for one.' },
      { text: 'Complete the Malaysia Digital Arrival Card online within three days of travel. It is free on the official portal.' },
      { text: 'Carry a return or onward ticket, accommodation details and proof of funds for the immigration officer.' },
      { text: 'Re-check the Immigration Department page if you are travelling in 2027 or later, when the exemption may have lapsed.' },
    ],
  },

  // Verified: https://evisa.gov.ph/page/policy
  // "Indian nationals may enter the Philippines without a visa for a
  // non-extendible and non-convertible period of 14 days for tourism and
  // business purposes." The page demanded an embassy visa.
  'india-to-philippines': {
    verdict: 'visa_free',
    verdictHeadline: 'Indian citizens can enter the Philippines visa-free for 14 days — or 30 days with a US, UK, Schengen or similar visa.',
    summary:
      'Indian passport holders may enter the Philippines without a visa for a non-extendible, non-convertible 14 days for tourism or business. Indians who hold a valid American, Japanese, Australian, Canadian, Schengen, Singapore or UK visa get 30 days instead, also non-extendible. You need a passport valid at least six months, a confirmed return or onward ticket, proof of accommodation and sufficient funds. Neither period can be extended or converted once you are in the country, so anyone planning to work, study or stay longer must apply for the appropriate visa before travelling.',
    officialSource: {
      label: 'Republic of the Philippines — official eVisa portal, visa policy',
      url: 'https://evisa.gov.ph/page/policy',
    },
    firstOption: {
      type: 'Visa-free entry (14 days)',
      validity: 'No application required',
      maxStay: '14 days, non-extendible — 30 days if you hold a US, UK, Schengen, Japanese, Australian, Canadian or Singapore visa',
      entries: 'Single stay per arrival',
      eligibility: 'Best for short tourism or business trips. Not convertible to another visa once you have entered.',
    },
    applySteps: [
      { text: 'Check your passport is valid for at least six months beyond arrival.' },
      { text: 'No visa application is needed for a stay of 14 days or less — there is nothing to pay.' },
      { text: 'If you hold a valid US, UK, Schengen, Japanese, Australian, Canadian or Singapore visa, carry it: it raises your visa-free stay to 30 days.' },
      { text: 'Carry a confirmed return or onward ticket, hotel booking and proof of funds. Immigration officers do ask for these.' },
      { text: 'Plan to leave within the period granted — it cannot be extended or converted inside the Philippines.' },
    ],
  },

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

  // Verified 2026-09-12 against Qatar's Ministry of Interior, General
  // Directorate of Passports, "On Arrival Visas", which lists as its own entry:
  // "Free on-Arrival Tourist Visa for a maximum of (30) days (Pakistani, Indian
  // and Thai nationalities)".
  //
  // The page was sending Indians to buy a Hayya entry permit and claimed the
  // visa on arrival was available only to those already holding a UK, US,
  // Canadian, Australian, New Zealand, Schengen or GCC visa or residence
  // permit. MOI lists the Indian entitlement separately from the GCC-resident
  // line and from the 43- and 39-country lists, with no such qualifier — so the
  // gate was wrong, and it pushed people into a paid application they do not
  // need. The conditions kept below (passport validity, return ticket,
  // confirmed accommodation, funds) are the standard on-arrival requirements
  // MOI applies; they are conditions of the free visa, not a different route.
  'india-to-qatar': {
    verdict: 'voa',
    verdictHeadline: 'Indian citizens can get a free visa on arrival in Qatar for up to 30 days.',
    summary:
      'Qatar grants Indian passport holders a free tourist visa on arrival for a maximum of 30 days — the Ministry of Interior lists Indian nationality by name among the on-arrival visas it issues at no charge. You do not need to buy an entry permit before you fly, and it does not depend on already holding a UK, US, Schengen or GCC visa. You will be asked at immigration for a passport valid for at least six months, a confirmed return or onward ticket, confirmed accommodation for your stay and enough money to cover it, so have those ready. Registering your trip on the Hayya platform before you travel is still possible and some travellers prefer the reassurance of an approval in hand, but for a short holiday it is not a requirement.',
    officialSource: {
      label: 'Qatar Ministry of Interior — General Directorate of Passports, On Arrival Visas',
      url: 'https://portal.moi.gov.qa/wps/portal/MOIInternet/departmentcommittees/ganationalborderexpatriateaffairs/?1dmy&urile=wcm%3apath%3a%2Fwcmlib-internet-en%2Fsa-departmentcommittee%2Fgeneraladministrationofnationalitybordersandexpatriateaffairs%2F937038a1-7068-4e28-9743-afcf845c3706',
    },
    firstOption: {
      type: 'Free tourist visa on arrival',
      validity: 'Issued at the airport on arrival — no advance application',
      maxStay: '30 days',
      entries: 'Single',
      eligibility: 'Indian passport holders travelling for tourism, with a confirmed return ticket, confirmed accommodation and funds for the stay. Not for work or study.',
    },
    applySteps: [
      { text: 'Check your passport is valid for at least six months from the day you arrive in Qatar.' },
      { text: 'Book a confirmed return or onward ticket and confirmed accommodation for the whole stay — immigration officers ask to see both.' },
      { text: 'Carry evidence that you can cover your stay, such as recent bank statements or an international credit card.' },
      { text: 'On arrival at Hamad International Airport, go to the immigration counter and present your passport with those documents. The visa is stamped free of charge for up to 30 days.' },
      { text: 'If you would rather travel with an approval already granted, you can register on the Hayya platform before departure instead.', link: { label: 'Hayya Platform', url: 'https://hayya.qa/' } },
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
  // The old, wrongly gated visa-on-arrival row. The corrected row above replaces
  // it; leaving both would show two contradictory on-arrival rules side by side.
  'india-to-qatar': /^Tourist Visa on Arrival/i,
};

// Answers that were true about the Hayya route but, now that the verdict says
// the visa is free on arrival, would answer the wrong question. Keyed by slug,
// then by the question text they belong to.
const FAQ_REWRITES = {
  'india-to-qatar': {
    "I'm travelling to Qatar next week, is that enough time to get an e-Visa?":
      'You almost certainly do not need one. Indian passport holders are issued a free tourist visa on arrival in Qatar for up to 30 days, so a week is ample — there is no application to wait on. Spend the time instead on the things immigration will ask to see: a passport valid for at least six months, a confirmed return ticket and confirmed accommodation. If you would still rather travel with an approval in hand, the Hayya platform is open to you, but it is not a requirement for a short holiday.',
    'How much money do I need to show in my bank account for a Qatar e-Visa?':
      'Qatar does not publish a fixed amount. Because Indian citizens are issued the visa free on arrival rather than applying in advance, the check happens at the immigration counter: you should be able to show you can cover your stay, typically through recent bank statements or an international credit card. Carry your accommodation booking and return ticket alongside them — an officer is more interested in a coherent, funded trip than in a particular balance.',
    'I am self-employed, what documents do I need to show for my Qatar e-Visa?':
      'Self-employment is not an obstacle here. Indian citizens receive the tourist visa free on arrival, so there is no advance application in which to prove your professional status. Bring what supports a normal tourist entry: your passport, confirmed return ticket, confirmed accommodation, and evidence you can fund the trip, such as recent bank statements. If you choose to register on the Hayya platform before travelling instead, business registration documents and tax returns are the usual way to evidence self-employed income.',
    'My passport expires in 5 months - can I still apply for Qatar?':
      'Renew it first. Qatar expects a passport valid for at least six months from the date you arrive, and this is checked at the immigration counter where your free visa on arrival is issued — so a passport with five months left can see you refused entry after you have already flown. That is a worse position than being turned down for an application at home. Renew the passport, then travel.',
  },
};

// Rebuilding an object literal reorders its keys, so a plain JSON.stringify
// comparison reports a difference where the content is identical. Sort keys.
const stable = (v) => JSON.stringify(v, (_k, x) =>
  (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
    : x);

const { data: rows, error } = await db.from('corridors').select('id,slug,data,status,generated_at');
if (error) { console.error(error.message); process.exit(1); }

let changed = 0;
const updates = [];

for (const r of rows) {
  const c = CORRECTIONS[r.slug];
  const removeRe = REMOVE_OPTIONS[r.slug];
  const faqFix = FAQ_REWRITES[r.slug];
  if (!c && !removeRe && !faqFix) continue;
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

  if (faqFix) {
    let n = 0;
    d.faq = (d.faq || []).map((f) => {
      const a = faqFix[(f.q || '').trim()];
      if (!a) return f;
      n++;
      return { ...f, a };
    });
    // A question listed here but not found means the FAQ was reworded upstream
    // and the rewrite silently did nothing — say so rather than pass quietly.
    const missing = Object.keys(faqFix).filter((q) => !(d.faq || []).some((f) => (f.q || '').trim() === q));
    if (n) notes.push(`rewrote ${n} FAQ answer(s)`);
    if (missing.length) notes.push(`WARNING: ${missing.length} FAQ question(s) not found: ${missing.join(' / ')}`);
  }

  // Corrections are idempotent, so re-running would re-write pages that already
  // hold the corrected text. That is harmless in the database but not in the
  // sitemap: generated_at drives lastmod, and bumping it on an unchanged page
  // tells crawlers to come back for nothing. Only write what genuinely differs.
  if (!notes.length || stable(d) === stable(r.data)) continue;
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
