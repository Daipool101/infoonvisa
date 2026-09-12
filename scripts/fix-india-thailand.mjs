// Correct india-to-thailand ahead of Thailand's 15 September 2026 rule change.
//
// The page tells Indian travellers to get a Visa on Arrival for a 15-day stay.
// From 15 September 2026 that advice is not merely out of date, it points at a
// service that no longer exists: Thailand is abolishing India's VoA and moving
// Indian nationals into the 30-day visa exemption instead. A reader following
// the old page would queue at a VoA desk that will turn them away, having
// prepared an application form, a photograph and a fee for nothing, when they
// could have walked straight through.
//
// The VoA framing is not confined to the verdict — it runs through the FAQ, the
// documents list, the tips and the rejection reasons, each restating it in its
// own words. All of them have to move together or the page contradicts itself.
//
// Source: Government Public Relations Department, "Thailand Revises Visa Policy
// for 65 Countries & Territories", thailand.prd.go.th, read 2026-09-12:
//   "Thailand will withdraw the current 60-day visa exemption for 93 countries
//    and territories."
//   "citizens of 59 countries and territories will be granted visa-free entry
//    for tourism purposes for stays up to 30 days. This entitlement includes six
//    countries – India, Croatia, Bulgaria, Cyprus, Malta, and the Maldives"
//   "Visa-on-Arrival (VoA) at designated checkpoints will be available for
//    nationals of Azerbaijan, Belarus, and Serbia. India's VoA will be removed
//    to eliminate the overlapping visa privilege."
//   "Travelers who entered Thailand before the new measures come into force will
//    continue to be allowed to remain in the country for the remainder of their
//    stay permitted under the previous regulations."
// Royal Gazette publication 31 August 2026; the drafts "take effect 15 days
// after their publication" = 15 September 2026.
//
// The old page quoted 10,000 THB per person as the funds requirement for a VoA.
// That figure belonged to the VoA process and this change does not confirm what
// applies to a visa-exempt arrival, so it is replaced with the general
// requirement rather than carried across unverified.
//
//   node scripts/fix-india-thailand.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SLUG = 'india-to-thailand';
const SRC = 'https://thailand.prd.go.th/en/content/category/detail/id/2078/iid/522327';

const res = await db.from('corridors').select('id,verdict,data').eq('slug', SLUG).single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const d = { ...res.data.data };

d.verdict = 'visa_free';   // data.verdict is what the pages render
d.maxStayDays = 30;
d.verdictHeadline = 'Indian citizens can enter Thailand visa-free for tourism for up to 30 days.';

d.summary =
  'From 15 September 2026 Indian citizens enter Thailand without a visa for tourist stays of up to 30 days. ' +
  'Thailand abolished the Visa on Arrival for Indian nationals on the same date, so there is no longer a VoA counter ' +
  'to join, no form to fill in on arrival and no arrival fee — you are admitted on your passport. Anyone already in ' +
  'Thailand on an earlier permission keeps the stay they were granted. Every arrival must also complete the Thailand ' +
  'Digital Arrival Card (TDAC), which is free and separate from any visa.';

// Match on the option type only. An earlier version of this script filtered on
// the whole option, which silently deleted the single-entry Tourist Visa
// because its eligibility text compared itself to the VoA.
d.visaOptions = [
  {
    type: 'Visa Exemption (Tourism)',
    entries: 'Multiple Entry',
    maxStay: '30 days per entry',
    validity: 'Granted on arrival; no application and no fee',
    eligibility:
      "Indian passport holders travelling for tourism. In force from 15 September 2026, when India joined Thailand's 30-day visa exemption list.",
  },
  ...(d.visaOptions || [])
    .filter((o) => !/visa on arrival|\(voa\)/i.test(o.type || ''))
    .map((o) => ({ ...o, eligibility: (o.eligibility || '').replace(/allowing a longer stay than VOA/gi, 'allowing a longer stay than the 30-day visa exemption') })),
];

d.documents = [
  { label: 'Passport', note: 'Must be valid for at least 6 months beyond the intended date of entry into Thailand.' },
  { label: 'Thailand Digital Arrival Card (TDAC)', note: 'Complete it online before you travel. It is free and required of every arrival.' },
  { label: 'Confirmed Return or Onward Journey Ticket', note: 'Proof of a flight showing you will leave Thailand within the allowed stay period.' },
  { label: 'Proof of Accommodation', note: 'Confirmed hotel booking or a letter from a host in Thailand with their contact details.' },
  { label: 'Proof of Adequate Finances', note: 'Thai immigration officers may ask you to show funds covering your stay. Check the current amount with the Royal Thai Embassy before you travel.' },
];

d.applySteps = [
  { text: 'Check your passport is valid for at least six months from the date you enter Thailand.' },
  { text: 'Book a return or onward ticket — immigration officers ask to see proof you will leave.' },
  { text: 'Complete the Thailand Digital Arrival Card (TDAC) online before you travel. It is free and separate from any visa.' },
  { text: 'Fly to Thailand. There is no visa to apply for and no Visa on Arrival counter to join.' },
  { text: 'Present your passport at immigration; you will be admitted for up to 30 days.' },
  { text: 'For longer than 30 days, apply for a Tourist Visa (TR) before you travel, or extend once in Thailand at an immigration office.' },
];

// Rewrite every answer built around the VoA, and lead with the question a
// reader who has heard about the change will actually ask.
const REWRITES = [
  [/How much money do I need to show at the airport for my Visa on Arrival/i, {
    q: 'How much money do I need to show at the airport in Thailand?',
    a: 'Thai immigration officers can ask any arriving visitor to show funds covering their stay, and may ask to see cash or a recent bank statement. The published amount has changed over the years, so check the current figure with the Royal Thai Embassy before you fly.',
  }],
  [/is it too late to get a visa/i, {
    q: "I'm traveling to Thailand next week, is it too late to get a visa?",
    a: 'There is nothing to get. Indian citizens enter Thailand visa-free for up to 30 days, so you can travel at short notice. Do complete the Thailand Digital Arrival Card online before you go.',
  }],
  [/I am self-employed, what documents/i, {
    q: 'I am self-employed, what documents do I need?',
    a: 'The same as any other visitor: a passport valid six months beyond entry, a return or onward ticket, proof of accommodation and enough money for your stay. Because you have no employer letter, bank statements covering the last few months are the clearest evidence of funds.',
  }],
  [/traveling to Thailand with my child/i, {
    q: "I'm traveling to Thailand with my child, are there any special requirements for them?",
    a: 'Each traveller, including a child, needs their own valid passport and their own Thailand Digital Arrival Card. Children are admitted under the same 30-day visa exemption; there is no arrival form or fee.',
  }],
  [/visa refused for another country before/i, {
    q: 'I had a visa refused for another country before, will this affect my entry to Thailand?',
    a: 'A refusal by another country does not bar you from Thailand. Immigration officers at the Thai border still assess every arrival, so carry your return ticket, accommodation booking and proof of funds.',
  }],
  [/Can I extend my Visa on Arrival or Tourist Visa/i, {
    q: 'Can I extend my stay in Thailand?',
    a: 'Yes, you can apply at an Immigration Office in Thailand before your current permission expires. Extensions are granted at the discretion of the immigration officer and a fee applies.',
  }],
  [/Am I allowed to work in Thailand with a Tourist Visa or Visa on Arrival/i, {
    q: 'Am I allowed to work in Thailand as a tourist?',
    a: 'No. Neither visa-free entry nor a Tourist Visa permits employment or any paid work in Thailand. Working without the correct visa and a work permit is an offence.',
  }],
  [/requirements for transiting through Thailand/i, {
    q: 'What are the requirements for transiting through Thailand?',
    a: "If you stay inside the airport's international transit area and never pass through immigration, you need nothing. If your layover takes you through immigration — to change airports, collect luggage or leave the terminal — you are admitted under the same 30-day visa exemption as any other Indian visitor, so there is no transit visa to arrange.",
  }],
];

let faq = (d.faq || []).map((item) => {
  for (const [re, replacement] of REWRITES) if (re.test(item.q)) return replacement;
  return item;
});
faq.unshift(
  {
    q: 'Do Indian citizens need a visa for Thailand?',
    a: 'No. From 15 September 2026 Indian passport holders enter Thailand visa-free for tourist stays of up to 30 days. Thailand removed India\'s Visa on Arrival on the same date, describing it as an overlapping privilege.',
  },
  {
    q: 'I was told Indians get a Visa on Arrival for Thailand — is that still true?',
    a: 'Not since 15 September 2026. The Visa on Arrival for Indian nationals was abolished when India was added to the 30-day visa exemption list, so there is no VoA counter to join, no form to complete on arrival and no fee. You are admitted on your passport.',
  },
  {
    q: 'What happened to the 60-day visa-free stay?',
    a: 'Thailand withdrew the 60-day visa exemption from all 93 countries and territories that had it, effective 15 September 2026. The tourist exemption is now 30 days. If you entered Thailand before that date you keep the stay you were originally granted.',
  }
);
d.faq = faq;

d.tips = (d.tips || []).map((t) =>
  t.replace(/\(or VOA stamp\)/gi, '(or entry stamp)').replace(/visa \(or entry stamp\)/gi, 'entry stamp')
);

d.rejectionReasons = (d.rejectionReasons || []).map((r) =>
  /insufficient funds/i.test(r.reason)
    ? { ...r, avoid: 'Carry evidence that you can cover your stay — cash or a recent bank statement. Check the current required amount with the Royal Thai Embassy before you travel.' }
    : r
);

const official = { url: SRC, label: 'Government Public Relations Department, Thailand — revised visa measures 2026' };
d.officialSource = official;
d.sources = [official, ...(d.sources || []).filter((s) => s.url !== SRC)].slice(0, 4);

console.log(`${SLUG}: ${res.data.verdict}/${res.data.data.verdict} -> visa_free`);
console.log(`  maxStayDays: ${res.data.data.maxStayDays} -> ${d.maxStayDays}`);
console.log(`  options    : ${d.visaOptions.map((o) => o.type).join(' | ')}`);
console.log(`  faq        : ${d.faq.length} questions`);

// Every surviving mention must be one that explains the change, not one that
// still instructs the reader to use the VoA.
const mentions = [
  ...d.faq.flatMap((f) => [f.q, f.a]),
  ...(d.tips || []),
  ...(d.documents || []).map((x) => `${x.label} ${x.note}`),
  ...(d.rejectionReasons || []).map((x) => `${x.reason} ${x.avoid}`),
  ...d.visaOptions.map((o) => `${o.type} ${o.eligibility}`),
  d.summary,
].filter((t) => /visa on arrival|\bvoa\b/i.test(t));
console.log(`  surviving VoA mentions: ${mentions.length}`);
mentions.forEach((m) => console.log(`    · ${m.slice(0, 110)}…`));

if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }
const upd = await db.from('corridors')
  .update({ verdict: 'visa_free', data: { ...d, verdictCheckedOn: new Date().toISOString(), verdictCheckSource: `${SRC}, read 2026-09-12` } })
  .eq('id', res.data.id);
if (upd.error) { console.error(upd.error.message); process.exit(1); }
console.log('\nUpdated.');
