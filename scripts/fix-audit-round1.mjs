// The four corrections that survived checking, out of fourteen the regeneration
// audit flagged. Ten did not survive, and that ratio is the finding.
//
// Every one of these was verified by opening the government's own page, not by
// trusting the audit. The audit's job is to say where to look.
//
// ── CHANGED ──────────────────────────────────────────────────────────────────
//
// india-to-israel   embassy -> evisa. Israel's Population and Immigration
//   Authority: "UPDATE ON | 25/06/2025 eVisa-B2 — Indian and Sri Lankan
//   passport holders residing in India and Sri Lanka can now apply for a B2
//   visa directly on the official website." Found while DISPROVING a different
//   Israel flag, which is the second time this week a wrong answer has led to
//   a right one.
//
// india-to-south-africa  embassy -> evisa. South Africa's eVisa covers India;
//   the government's own news service quotes the President launching it in 14
//   countries "including China, India, Kenya and Nigeria", and the Department
//   of Home Affairs runs it at ehome.dha.gov.za. The eVisa carries a real
//   restriction — arrival must be at one of four named airports — so that goes
//   in the option name rather than in prose nobody reads.
//   Also fixes a standing rule this page was breaking: it named a visa-centre
//   contractor in its summary. Pages describe what a traveller must do, not who
//   the government has contracted to do it.
//
// india-to-sri-lanka  evisa -> eta. A badge-only fix: the page's own headline
//   and options already say ETA throughout. Sri Lanka's notice of 25.05.2026
//   calls it "tourist visa (ETA)" and lists India at number 13, free of charge
//   for 30 days. Only the stored verdict disagreed with the page it was on.
//
// brazil-to-egypt  voa -> evisa. This one is a PRECAUTION, not a proven error,
//   and it should be read as such. Egypt's own e-Visa portal says a foreign
//   national "generally must first obtain an e-Visa" and lists Brazil among
//   the eligible nationalities — verified. Egypt's visa-on-arrival list could
//   not be read: it sits behind an accordion that does not render, and the
//   embassy page confirms only that a visa on arrival exists and that since
//   1 September 2026 it is issued as an electronic QR code rather than a
//   sticker. So the page leads with the route that is verified and always
//   works, and keeps the visa-on-arrival option. If the two are swapped and we
//   are wrong, a reader buys a $25 e-Visa they did not strictly need; if they
//   are left as they were and we are wrong, a reader is refused boarding.
//
// ── CHECKED AND LEFT ALONE ───────────────────────────────────────────────────
// Recorded in audit-accepted.json with the evidence, so no future run re-opens
// them: both Saudi routes, us-to-israel, india-to-bhutan, india-to-mauritius,
// india-to-turkey, china-to-japan, both Indonesia routes, and india-to-belarus
// (which is unverified rather than settled — Belarus's ministry will not load).
//
//   node scripts/fix-audit-round1.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const S = {
  israel: { url: 'https://israel-entry.piba.gov.il/', label: 'Israel Population and Immigration Authority' },
  za: { url: 'https://ehome.dha.gov.za/epermit/', label: 'South African Department of Home Affairs — eVisa' },
  lk: { url: 'https://www.immigration.gov.lk/content/files/visa/Free%20Tourist%20Visas%20for%20Nationals%20of%2040%20Selected%20Countries.pdf', label: 'Sri Lanka Department of Immigration and Emigration — notice of 25.05.2026' },
  eg: { url: 'https://visa2egypt.gov.eg/eVisa/FAQ', label: 'Egypt e-Visa Portal (Ministry of Interior)' },
};

const PLAN = {
  'india-to-israel': {
    verdict: 'evisa',
    verdictHeadline: 'Indian citizens can apply online for an Israeli eVisa-B2, or at an embassy.',
    summary:
      'Indian citizens need a visa for Israel, and since 25 June 2025 they no longer have to start at an embassy. ' +
      'Israel’s Population and Immigration Authority runs an eVisa-B2 open to Indian passport holders resident in India, applied for and issued entirely online. ' +
      'The embassy route remains open and is still the way in for anyone the online system does not cover. ' +
      'Separately, note that since 1 January 2025 every traveller to Israel must hold either a visa or an ETA-IL before starting their journey — the eVisa-B2 satisfies that requirement, so there is nothing else to obtain.',
    source: S.israel,
    options: (old) => [
      {
        type: 'eVisa-B2 (Tourism, applied for online)',
        validity: 'As granted; the B/2 is Israel’s visitor visa',
        maxStay: 'Up to 90 days per visit, at the border officer’s discretion',
        entries: 'As granted',
        eligibility: 'Best for Indian passport holders who are resident in India — Israel opened this route to India and Sri Lanka on 25 June 2025.',
      },
      ...old,
    ],
  },

  'india-to-south-africa': {
    verdict: 'evisa',
    verdictHeadline: 'Indian citizens can apply online for a South African eVisa.',
    summary:
      'Indian citizens need a visa for South Africa, and India is one of the countries the Department of Home Affairs has opened its eVisa system to, so the application can be made and paid for online rather than in person. ' +
      'The eVisa carries one condition worth checking before you book: it is valid only if you land at O. R. Tambo, Cape Town, Lanseria or King Shaka. ' +
      'Arriving anywhere else, or applying for anything the eVisa does not cover, means the ordinary visitor’s visa through a South African mission. ' +
      'South Africa does not publish a fee: its own guidance says the charge is set locally, changes annually and should be confirmed with the office you apply through.',
    source: S.za,
    options: (old) => [
      {
        type: 'Visitor’s eVisa (Tourism, applied for online)',
        validity: 'As granted',
        maxStay: 'Up to 90 days',
        entries: 'Single entry',
        eligibility: 'Best for Indian citizens flying into O. R. Tambo, Cape Town, Lanseria or King Shaka — the eVisa is only valid at those four airports.',
      },
      ...old,
    ],
  },

  'india-to-sri-lanka': {
    verdict: 'eta',
    // Headline and options already said ETA. Only the stored verdict disagreed
    // with the page it was sitting on, so nothing else here changes.
    source: S.lk,
  },

  'brazil-to-egypt': {
    verdict: 'evisa',
    verdictHeadline: 'Brazilian citizens should get an Egyptian e-Visa before travelling.',
    summary:
      'Egypt’s official e-Visa portal says a foreign national wishing to enter Egypt “generally must first obtain an e-Visa”, and Brazil is on its list of eligible nationalities. ' +
      'Apply at least seven days before departure; a single-entry tourist e-Visa is US$30 and a multiple-entry one US$65. ' +
      'Egypt does also issue visas on arrival at its airports — since 1 September 2026 as an electronic QR code rather than a sticker — but the list of nationalities that route is open to is not published in a form we could read, and an airline can refuse boarding to a passenger without a visa. ' +
      'Getting the e-Visa first removes that risk.',
    source: S.eg,
  },
};

let changed = 0;
for (const [slug, plan] of Object.entries(PLAN)) {
  const res = await db.from('corridors').select('id,data').eq('slug', slug).single();
  if (res.error) { console.error(`  ! ${slug}: ${res.error.message}`); continue; }
  const before = res.data.data;
  const data = { ...before };

  const changes = [];
  const note = (field, was, now) => changes.push({
    id: `${Date.now().toString(36)}-${field}-${changes.length}`,
    at: new Date().toISOString(), by: 'aksjai101@gmail.com', field, before: was ?? null, after: now ?? null,
  });

  if (plan.verdict && before.verdict !== plan.verdict) {
    note('verdict', before.verdict, plan.verdict);
    data.verdict = plan.verdict;
  }
  if (plan.verdictHeadline && before.verdictHeadline !== plan.verdictHeadline) {
    note('verdictHeadline', before.verdictHeadline, plan.verdictHeadline);
    data.verdictHeadline = plan.verdictHeadline;
  }
  if (plan.summary && before.summary !== plan.summary) {
    note('summary', before.summary, plan.summary);
    data.summary = plan.summary;
  }
  if (plan.options) {
    const next = plan.options(before.visaOptions || []);
    if (JSON.stringify(before.visaOptions) !== JSON.stringify(next)) {
      note('visaOptions', before.visaOptions, next);
      data.visaOptions = next;
    }
  }
  if (plan.source && !(data.sources || []).some((s) => s.url === plan.source.url)) {
    data.sources = [...(data.sources || []), plan.source];
  }

  if (!changes.length) { console.log(`${slug}: nothing to change`); continue; }
  data.changeLog = [...changes, ...(Array.isArray(before.changeLog) ? before.changeLog : [])].slice(0, 40);

  console.log(`\n===== ${slug}`);
  for (const c of changes) {
    const show = (v) => (Array.isArray(v) ? `${v.length} options` : String(v ?? '').slice(0, 90));
    console.log(`  ${c.field}:  ${show(c.before)}  ->  ${show(c.after)}`);
  }

  if (!DRY) {
    // verdict lives in a column AND in data; max_stay_days and sources too.
    const upd = await db.from('corridors')
      .update({ verdict: data.verdict, max_stay_days: data.maxStayDays ?? null, sources: data.sources, data })
      .eq('id', res.data.id);
    if (upd.error) { console.error(`  ! ${slug}: ${upd.error.message}`); continue; }
  }
  changed++;
}

console.log(`\n${changed} page(s) ${DRY ? 'would be' : ''} corrected.`);
if (DRY) console.log('DRY RUN — nothing written.');
