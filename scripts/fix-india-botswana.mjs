// india-to-botswana, rewritten to what Botswana's own e-Visa portal says.
//
// This page could not be researched the normal way. evisa.gov.bw is a
// JavaScript application that returns zero words to anything but a browser, and
// every other Botswana government host (gov.bw, mofaic.gov.bw, mlha.gov.bw)
// refused to answer at all. So the generated page rested on 14 sources, none of
// them governmental, and the publish gate correctly held it.
//
// Read in a real browser on 20 Nov 2026 instead:
//
//   evisa.gov.bw/#/          "Do I need a Visa?"  India -> "Visa required"
//   evisa.gov.bw/#/appterms  Visa Application Terms:
//       GENERAL  passport "left validity of at least six months and more with
//                at least three or more unused pages"; photo JPG <= 30Kb;
//                supporting documents in English as ONE PDF <= 5Mb; copies
//                certified; VISA/MasterCard enabled for online payment
//       TOURISTS tour plan or travel schedule, flight bookings, hotel/lodge
//                confirmation, return ticket;
//                300 Pula single entry up to 1 month,
//                500 Pula multiple entry up to 3 months
//       NOTES    "Visa fee is non-refundable"
//   evisa.gov.bw/#/req_passport  colour scan of the bio page, PDF <= 1MB
//
// What the generated page got WRONG, against that:
//
//   - "Generally issued for a single entry. Official confirmation for
//     multiple-entry tourist visas was not found on government pages."
//     The government page lists a multiple-entry tourist visa and its price.
//     The model could not find it because it never reached the page, then
//     wrote the gap up as though the gap were a finding.
//
// What it said that NO government page supports, so it is removed rather than
// softened:
//
//   - "25-30 working days (some sources indicate 7-14 days)". "Some sources"
//     is visa-agent copy; the portal publishes no processing time.
//   - "Apply in person at the High Commission in New Delhi or the Honorary
//     Consulate in Mumbai." Not on the portal; the portal is an online system.
//   - "It cannot be extended within Botswana." Not on the portal either way.
//
// Priced at the same time, because the fee sits on the same government page
// as the facts above and is as well sourced as anything on this site.
//
//   node scripts/fix-india-botswana.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ON = '2026-11-20';
const PORTAL = { url: 'https://evisa.gov.bw/', label: 'Botswana e-Visa — official portal' };
const TERMS = { url: 'https://evisa.gov.bw/#/appterms', label: 'Botswana e-Visa — Visa Application Terms' };
const CHECKER = { url: 'https://evisa.gov.bw/#/needvisa', label: 'Botswana e-Visa — Do I need a visa?' };

const SINGLE = 'Tourist visa — single entry';
const MULTI = 'Tourist visa — multiple entry';

const corrected = {
  summary:
    "Indian citizens need a visa for Botswana and apply online through Botswana's official e-Visa portal. " +
    'Tourists can choose a single-entry visa for up to 1 month or a multiple-entry visa for up to 3 months.',
  maxStayDays: 90,
  processingTime: "Not published on Botswana's official e-Visa portal. Apply well before you travel.",
  visaOptions: [
    {
      type: SINGLE,
      entries: 'Single entry',
      maxStay: 'Up to 1 month',
      validity: 'Up to 1 month',
      eligibility: 'Best for a single trip of a month or less.',
    },
    {
      type: MULTI,
      entries: 'Multiple entry',
      maxStay: 'Up to 3 months',
      validity: 'Up to 3 months',
      eligibility: 'Best if you will leave and re-enter Botswana, or stay longer than a month.',
    },
  ],
  documents: [
    { label: 'Valid Indian passport', note: 'At least six months of validity left and at least three unused pages. Upload a colour scan of the photo page as a PDF of 1 MB or less.' },
    { label: 'Recent photo', note: 'JPG format, no larger than 30 KB.' },
    { label: 'Tour plan or travel schedule' },
    { label: 'Flight bookings and a return ticket' },
    { label: 'Hotel or lodge booking confirmation' },
    { label: 'Visa or MasterCard', note: 'Enabled for online payment.' },
  ],
  applySteps: [
    { text: 'Confirm you need a visa using the official checker. For India it returns "Visa required".', link: CHECKER },
    { text: "Start a new application on Botswana's official e-Visa portal.", link: PORTAL },
    { text: 'Upload your passport photo page, your photo and your supporting documents. Supporting documents must be in English, certified, and combined into ONE PDF of 5 MB or less.' },
    { text: 'Pay the fee online by Visa or MasterCard. The fee is non-refundable, and paying does not guarantee approval.' },
    { text: 'Track your application with "Check Status" on the same portal.' },
  ],
  faq: [
    { q: 'Do Indian citizens need a visa to travel to Botswana?', a: "Yes. Botswana's official e-Visa checker lists India as \"Visa required\". You apply online through the official e-Visa portal." },
    { q: 'What type of visa should I apply for tourism in Botswana?', a: 'A tourist visa, applied for online. You choose single entry for up to 1 month, or multiple entry for up to 3 months.' },
    { q: 'How long can I stay in Botswana on a tourist visa?', a: 'Up to 1 month on a single-entry tourist visa, or up to 3 months on a multiple-entry one.' },
    { q: 'Is the Botswana tourist visa single or multiple entry?', a: 'Both are offered. Single entry costs 300 Botswana Pula and covers up to 1 month. Multiple entry costs 500 Pula and covers up to 3 months.' },
    { q: 'How much is a Botswana tourist visa for Indians?', a: '300 Botswana Pula for single entry (up to 1 month) or 500 Pula for multiple entry (up to 3 months), paid online by Visa or MasterCard. The fee is non-refundable.' },
    { q: 'How long does a Botswana e-Visa take to process?', a: "Botswana's official e-Visa portal does not publish a processing time. Apply well before you travel, and treat any fixed timeline quoted by agents as unofficial." },
    { q: 'Can I extend my Botswana tourist visa while I am there?', a: "The official e-Visa portal does not cover extensions. Choose the option that covers your whole trip rather than relying on extending it in Botswana." },
    { q: 'What are the passport requirements for a Botswana visa?', a: 'Your passport needs at least six months of validity left and at least three unused pages. You upload a clear colour scan of the photo page as a PDF of 1 MB or less.' },
    { q: 'What documents do I need for a Botswana tourist visa?', a: 'A tour plan or travel schedule, flight bookings, a hotel or lodge confirmation and a return ticket, plus your passport scan and photo. Supporting documents must be in English, certified, and uploaded together as one PDF of 5 MB or less.' },
  ],
  fees: [
    { appliesTo: SINGLE, amount: 'BWP 300', note: 'up to 1 month', refundable: false, verifiedOn: ON, source: TERMS },
    { appliesTo: MULTI, amount: 'BWP 500', note: 'up to 3 months', refundable: false, verifiedOn: ON, source: TERMS },
  ],
  officialSource: PORTAL,
  sources: [PORTAL, TERMS, CHECKER],
};

const res = await db.from('corridors').select('id,status,data').eq('slug', 'india-to-botswana').single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const before = res.data.data;

// Every fee must name an option on the page, and no two options may share a
// name — the same two guards the fee batches use.
const types = corrected.visaOptions.map((o) => o.type);
if (new Set(types).size !== types.length) { console.error('duplicate option names'); process.exit(1); }
const orphan = corrected.fees.find((f) => !types.includes(f.appliesTo));
if (orphan) { console.error(`fee for "${orphan.appliesTo}" matches no option`); process.exit(1); }

// Postgres jsonb does not keep key order, so a plain JSON.stringify comparison
// reports every object as changed on the second run and the change log fills
// with no-op entries. Same fix as canonical() in src/lib/admin-edit.ts.
const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);

const changes = [];
const data = { ...before };
for (const [field, now] of Object.entries(corrected)) {
  if (canonical(before[field]) === canonical(now)) continue;
  changes.push({
    id: `${Date.now().toString(36)}-${field}-${changes.length}`,
    at: new Date().toISOString(), by: 'aksjai101@gmail.com', field, before: before[field] ?? null, after: now,
  });
  data[field] = now;
}

if (!changes.length) {
  console.log('nothing to change');
  process.exit(0);
}
data.changeLog = [...changes, ...(Array.isArray(before.changeLog) ? before.changeLog : [])].slice(0, 40);

console.log(`india-to-botswana  [${res.data.status}]  ${changes.length} field(s):`);
changes.forEach((c) => console.log(`  - ${c.field}`));
console.log('\noptions and fees:');
corrected.fees.forEach((f) => console.log(`  ${f.amount.padEnd(8)} ${f.appliesTo}  (${f.note}, non-refundable)`));

if (DRY) {
  console.log('\nDRY RUN — nothing written.');
} else {
  // verdict, max stay and sources live in columns AND in data — both, always.
  const upd = await db.from('corridors')
    .update({ verdict: data.verdict, max_stay_days: data.maxStayDays ?? null, sources: data.sources, data })
    .eq('id', res.data.id);
  if (upd.error) { console.error(upd.error.message); process.exit(1); }
  console.log('\nSaved. Status unchanged — approve separately once read on the live page.');
}
