// india-to-indonesia said "e-Visa required" while the other three Indonesia
// pages said "Visa on arrival" — for the same country, the same product and
// the same Rp 500,000 fee.
//
// Found by the regeneration audit, which is the one thing it has done that
// reading a single page never could: it compared our pages against a fresh
// reading and surfaced a contradiction BETWEEN our own pages. Nobody checking
// india-to-indonesia on its own would have seen anything wrong with it.
//
// Settled on Indonesia's own visa selector (evisa.imigrasi.go.id/web/visa-selection)
// on 3 Oct 2026. Choosing INDIA → "General, Family, or Social" → "Tourism,
// Family Visit, and Transit" returns, in this order:
//
//   B1 - Tourist (Visa On Arrival)          <- first, and the answer
//   C1 - Tourist Single Entry Visitor Visa - 60 Days
//   D1 - Tourist Multiple Entry Visa (5 / 2 / 1 Years)
//
// So Indians get a visa on arrival, exactly like Australians, the Swiss and
// Americans. The page's own content already said so — its options list the VoA
// and the e-VOA at Rp 500,000 — and only the stored verdict disagreed with the
// page it was sitting on.
//
// The headline is reordered to match the other three. "Can obtain an e-Visa or
// Visa on Arrival" leads with the wrong one: the e-VOA is the same visa applied
// for in advance, and Indonesia's own name for the product is "Electronic Visa
// on Arrival". A reader should be told they can simply arrive, then that they
// may do it online if they prefer.
//
//   node scripts/fix-india-indonesia-verdict.mjs --dry-run
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SRC = {
  url: 'https://evisa.imigrasi.go.id/web/visa-selection',
  label: 'Indonesian Directorate General of Immigration — visa selector',
};
const HEADLINE = 'Indian citizens can obtain a Visa on Arrival (VOA) or an e-VOA for tourism in Indonesia.';

const res = await db.from('corridors').select('id,data').eq('slug', 'india-to-indonesia').single();
if (res.error) { console.error(res.error.message); process.exit(1); }
const before = res.data.data;
const data = { ...before };

const changes = [];
const note = (field, was, now) => changes.push({
  id: `${Date.now().toString(36)}-${field}-${changes.length}`,
  at: new Date().toISOString(), by: 'aksjai101@gmail.com', field, before: was ?? null, after: now ?? null,
});

if (before.verdict !== 'voa') { note('verdict', before.verdict, 'voa'); data.verdict = 'voa'; }
if (before.verdictHeadline !== HEADLINE) { note('verdictHeadline', before.verdictHeadline, HEADLINE); data.verdictHeadline = HEADLINE; }

// Lead with the option the verdict now names. The three sibling pages all put
// the on-arrival route first, and the first row is what a reader reads.
const opts = [...(before.visaOptions || [])];
const voaIdx = opts.findIndex((o) => /^visa on arrival/i.test(o.type));
if (voaIdx > 0) {
  const reordered = [opts[voaIdx], ...opts.filter((_, i) => i !== voaIdx)];
  note('visaOptions', before.visaOptions, reordered);
  data.visaOptions = reordered;
}

if (!(data.sources || []).some((s) => s.url === SRC.url)) data.sources = [...(data.sources || []), SRC];

if (!changes.length) {
  console.log('nothing to change');
} else {
  data.changeLog = [...changes, ...(Array.isArray(before.changeLog) ? before.changeLog : [])].slice(0, 40);
  for (const c of changes) {
    const show = (v) => (Array.isArray(v) ? v.map((o) => o.type).join(' | ') : String(v ?? '').slice(0, 100));
    console.log(`${c.field}:\n  was: ${show(c.before)}\n  now: ${show(c.after)}`);
  }
  if (!DRY) {
    // verdict lives in a column AND in data — both, always.
    const upd = await db.from('corridors')
      .update({ verdict: data.verdict, max_stay_days: data.maxStayDays ?? null, sources: data.sources, data })
      .eq('id', res.data.id);
    if (upd.error) { console.error(upd.error.message); process.exit(1); }
    console.log('\nSaved.');
  } else {
    console.log('\nDRY RUN — nothing written.');
  }
}
