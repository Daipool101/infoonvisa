// Generate the highest-volume US-origin corridors through the LIVE endpoint, so
// they go through the same Vertex path, link verification and auto-publish gate
// as any visitor-triggered page.
//
// Bing's AI report is the reason for the US focus: 445 of 806 corridor-page
// citations come from US-origin routes, against 185 for India — the AI demand
// is US-heavy while the site is India-heavy (39 India routes to 17 US).
//
//   node scripts/generate-us-routes.mjs            # generate
//   node scripts/generate-us-routes.mjs --dry-run  # list only
const SITE = 'https://infoonvisa.com';

// Ordered by real US outbound travel volume: Caribbean and Latin America first
// (the biggest US destinations after Mexico and Canada, both already covered),
// then the European classics, then longer-haul.
const ROUTES = [
  'united-states-to-dominican-republic',
  'united-states-to-bahamas',
  'united-states-to-jamaica',
  'united-states-to-costa-rica',
  'united-states-to-colombia',
  'united-states-to-ireland',
  'united-states-to-netherlands',
  'united-states-to-greece',
  'united-states-to-portugal',
  'united-states-to-switzerland',
  'united-states-to-brazil',
  'united-states-to-philippines',
  'united-states-to-indonesia',
  'united-states-to-peru',
  'united-states-to-argentina',
  'united-states-to-egypt',
  'united-states-to-morocco',
  'united-states-to-south-africa',
  'united-states-to-israel',
  'united-states-to-new-zealand',
];

const DRY = process.argv.includes('--dry-run');
if (DRY) {
  console.log(`${ROUTES.length} routes would be generated:`);
  ROUTES.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${SITE}/${r}`));
  process.exit(0);
}

const headers = (slug) => ({
  Origin: SITE,
  Referer: `${SITE}/${slug}`,
  'Content-Type': 'application/json',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, cached = 0, failed = 0;
const failures = [];
const generated = [];

for (let i = 0; i < ROUTES.length; i++) {
  const slug = ROUTES[i];
  const label = `[${i + 1}/${ROUTES.length}] ${slug}`;
  try {
    const t0 = Date.now();
    const res = await fetch(`${SITE}/api/generate`, {
      method: 'POST',
      headers: headers(slug),
      body: JSON.stringify({ slug }),
    });
    const json = await res.json().catch(() => ({}));
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (json.ok && json.cached) { cached++; console.log(`${label} — already cached (${secs}s)`); }
    else if (json.ok) { ok++; generated.push(slug); console.log(`${label} — GENERATED ✓ (${secs}s)`); }
    else { failed++; failures.push(slug); console.log(`${label} — FAILED: ${json.error || res.status} (${secs}s)`); }
  } catch (e) {
    failed++; failures.push(slug);
    console.log(`${label} — ERROR: ${e.message}`);
  }
  await sleep(2000); // polite gap; generation is the expensive part, not this
}

console.log(`\n===== DONE =====`);
console.log(`Generated: ${ok} | Already cached: ${cached} | Failed: ${failed}`);
if (failures.length) console.log(`Failed: ${failures.join(', ')}`);
if (generated.length) {
  console.log(`\nSubmit the new pages to Bing with:`);
  console.log(`  node scripts/indexnow.mjs ${generated.map((s) => `${SITE}/${s}`).join(' ')}`);
}
