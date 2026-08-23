// Check every Schengen-destination page against Regulation (EU) 2018/1806.
//
// The regulation is the single legal source for who needs a Schengen visa, so
// one document settles every European destination we cover instead of chasing
// 15 national consulate sites that each publish it differently. Annex I lists
// nationals who must hold a visa; Annex II lists those exempt for stays up to
// 90 days in any 180.
//
// Source: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32018R1806
// Read 2026-08-23.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The 29 Schengen states, in our slug form.
const SCHENGEN = new Set([
  'austria', 'belgium', 'bulgaria', 'croatia', 'czech-republic', 'denmark', 'estonia', 'finland',
  'france', 'germany', 'greece', 'hungary', 'iceland', 'italy', 'latvia', 'liechtenstein',
  'lithuania', 'luxembourg', 'malta', 'netherlands', 'norway', 'poland', 'portugal', 'romania',
  'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland',
]);

// Annex II — exempt for short stays. EU/EEA nationals are added because free
// movement puts them beyond the visa question entirely.
const VISA_EXEMPT = new Set([
  ...SCHENGEN,
  'ireland', 'united-kingdom', // UK nationals are visa-exempt post-Brexit
  'united-states', 'canada', 'australia', 'new-zealand', 'japan', 'south-korea', 'singapore',
  'hong-kong', 'macao', 'taiwan', 'israel', 'united-arab-emirates', 'brazil', 'mexico', 'chile',
  'argentina', 'uruguay', 'paraguay', 'peru', 'colombia', 'costa-rica', 'panama', 'guatemala',
  'honduras', 'el-salvador', 'nicaragua', 'venezuela', 'bahamas', 'barbados', 'trinidad-and-tobago',
  'saint-kitts-and-nevis', 'saint-lucia', 'antigua-and-barbuda', 'dominica', 'grenada',
  'georgia', 'moldova', 'ukraine', 'albania', 'serbia', 'montenegro', 'north-macedonia',
  'bosnia-and-herzegovina', 'mauritius', 'seychelles', 'brunei', 'malaysia', 'monaco',
  'san-marino', 'andorra', 'vatican-city', 'timor-leste', 'samoa', 'tonga', 'vanuatu',
  'kiribati', 'marshall-islands', 'micronesia', 'nauru', 'palau', 'solomon-islands', 'tuvalu',
]);

// Annex I — must hold a visa. Only the ones we actually have pages for need naming.
const VISA_REQUIRED = new Set([
  'india', 'china', 'russia', 'nigeria', 'pakistan', 'egypt', 'morocco', 'sri-lanka',
  'philippines', 'indonesia', 'turkey', 'thailand', 'vietnam', 'bangladesh', 'nepal',
  'saudi-arabia', 'qatar', 'oman', 'bahrain', 'jordan', 'lebanon', 'iraq', 'iran',
  'kenya', 'tanzania', 'south-africa', 'ghana', 'algeria', 'tunisia', 'mongolia',
  'kazakhstan', 'uzbekistan', 'azerbaijan', 'armenia', 'belarus', 'bhutan', 'maldives',
  'cambodia', 'laos', 'myanmar', 'jamaica', 'guyana', 'suriname', 'bolivia', 'ecuador',
]);

const res = await db.from('corridors').select('slug,verdict,data,status,search_count');
if (res.error) { console.error(res.error.message); process.exit(1); }
const rows = (res.data || []).filter((r) => r.status === 'verified');

const pages = rows.filter((r) => SCHENGEN.has(r.slug.split('-to-')[1]));
console.log(`${pages.length} pages have a Schengen destination.\n`);

const ok = [];
const mismatch = [];
const unknown = [];

for (const r of pages) {
  const [from, to] = r.slug.split('-to-');
  const expectFree = VISA_EXEMPT.has(from);
  const expectVisa = VISA_REQUIRED.has(from);
  if (!expectFree && !expectVisa) { unknown.push({ ...r, from, to }); continue; }
  // A Schengen visa is applied for at a consulate or visa centre, so "embassy"
  // is the verdict we expect for Annex I nationals.
  const expected = expectFree ? 'visa_free' : 'embassy';
  if (r.verdict === expected) ok.push({ slug: r.slug, verdict: r.verdict });
  else mismatch.push({ slug: r.slug, was: r.verdict, expected, traffic: r.search_count || 0, from });
}

console.log(`matches the regulation : ${ok.length}`);
console.log(`DISAGREES             : ${mismatch.length}`);
console.log(`origin not classified : ${unknown.length}\n`);

if (mismatch.length) {
  console.log('pages that disagree with Regulation (EU) 2018/1806:');
  mismatch.sort((a, b) => b.traffic - a.traffic)
    .forEach((m) => console.log(`  ${m.slug.padEnd(36)} says ${m.was.padEnd(10)} regulation implies ${m.expected}  (${m.from} is Annex ${m.expected === 'visa_free' ? 'II' : 'I'})`));
}
if (unknown.length) {
  console.log('\norigins I have not classified — check individually:');
  unknown.forEach((u) => console.log(`  ${u.slug.padEnd(36)} ${u.verdict}  (origin: ${u.from})`));
}
