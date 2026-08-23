// Record the outcome of a verdict-audit batch.
//
// Two states matter and must not be blurred: a destination confirmed against an
// official document, and one where the official source could not be read. The
// second is not a failure to hide — those pages stay unverified and go on a list
// for someone with better access (local language, phone, embassy contact).
//
//   node scripts/audit-record.mjs --verified japan,singapore --note "mofa.go.jp list"
//   node scripts/audit-record.mjs --unverified thailand --note "7 official sources unreachable"
//   node scripts/audit-record.mjs --export     # write the manual-check list to disk
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const VERIFIED = (flag('--verified') || '').split(',').filter(Boolean);
const UNVERIFIED = (flag('--unverified') || '').split(',').filter(Boolean);
const NOTE = flag('--note') || '';
const EXPORT = args.includes('--export');

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const res = await db.from('corridors').select('id,slug,verdict,data,status,search_count');
if (res.error) { console.error(res.error.message); process.exit(1); }
const rows = (res.data || []).filter((r) => r.status === 'verified');
const today = new Date().toISOString();

for (const dest of VERIFIED) {
  const pages = rows.filter((r) => r.slug.endsWith(`-to-${dest}`));
  let n = 0;
  for (const r of pages) {
    const data = { ...r.data, verdictCheckedOn: today };
    if (NOTE) data.verdictCheckSource = NOTE;
    delete data.verdictCheckAttempted; // resolved
    delete data.verdictCheckNote;
    const { error } = await db.from('corridors').update({ data }).eq('id', r.id);
    if (!error) n++;
  }
  console.log(`verified  ${dest.padEnd(24)} ${n}/${pages.length} pages stamped`);
}

for (const dest of UNVERIFIED) {
  const pages = rows.filter((r) => r.slug.endsWith(`-to-${dest}`));
  for (const r of pages) {
    await db.from('corridors')
      .update({ data: { ...r.data, verdictCheckAttempted: today, verdictCheckNote: NOTE } })
      .eq('id', r.id);
  }
  console.log(`UNVERIFIED ${dest.padEnd(23)} ${pages.length} pages flagged for manual check`);
}

if (EXPORT) {
  const fresh = await db.from('corridors').select('slug,verdict,data,status,search_count');
  const live = (fresh.data || []).filter((r) => r.status === 'verified');
  const stuck = live
    .filter((r) => r.data?.verdictCheckAttempted && !r.data?.verdictCheckedOn)
    .sort((a, b) => (b.search_count || 0) - (a.search_count || 0));
  const lines = [
    '# Routes I could not verify — please check manually',
    '',
    'For each of these I tried the destination\'s official government sources and could not',
    'read a usable answer. The verdict shown is what the page currently claims; it is NOT',
    'confirmed. Please check against an official source and send me what you find.',
    '',
    '| Route | Page currently says | Searches | Why I could not verify |',
    '| --- | --- | --- | --- |',
    ...stuck.map((r) => `| https://infoonvisa.com/${r.slug} | ${r.verdict} | ${r.search_count || 0} | ${r.data.verdictCheckNote || ''} |`),
    '',
    `${stuck.length} routes awaiting manual verification, as of ${today.slice(0, 10)}.`,
  ];
  const out = 'C:/Users/Akash/Downloads/verify-manually.md';
  writeFileSync(out, lines.join('\n'));
  console.log(`\nWrote ${stuck.length} routes to ${out}`);
}

// Progress summary
const after = await db.from('corridors').select('slug,data,status');
const live = (after.data || []).filter((r) => r.status === 'verified');
const done = live.filter((r) => r.data?.verdictCheckedOn).length;
const stuck = live.filter((r) => r.data?.verdictCheckAttempted && !r.data?.verdictCheckedOn).length;
console.log(`\nprogress: ${done}/${live.length} pages verified, ${stuck} awaiting manual check, ${live.length - done - stuck} not yet attempted`);
