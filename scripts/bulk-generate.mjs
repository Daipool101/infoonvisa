// Bulk-generate popular corridors through the LIVE site (uses Vertex on the
// edge). Gov-sourced pages auto-publish and enter the sitemap.
//   node scripts/bulk-generate.mjs
// Sequential + polite delay so we don't trip rate limiting. Skips cached routes.
const SITE = 'https://infoonvisa.com';

// High-traffic tourism corridors, weighted to India-origin (large audience) and
// US/UK/CA/AU-origin (higher ad value). Existing routes are skipped automatically.
const ROUTES = [
  // US origin
  'united-states-to-thailand', 'united-states-to-united-kingdom', 'united-states-to-india',
  'united-states-to-italy', 'united-states-to-spain', 'united-states-to-mexico',
  'united-states-to-singapore', 'united-states-to-turkey',
  // UK origin
  'united-kingdom-to-france', 'united-kingdom-to-spain', 'united-kingdom-to-india',
  'united-kingdom-to-japan', 'united-kingdom-to-italy', 'united-kingdom-to-united-arab-emirates',
  // India origin
  'india-to-united-states', 'india-to-france', 'india-to-germany', 'india-to-australia',
  'india-to-canada', 'india-to-malaysia', 'india-to-turkey', 'india-to-vietnam',
  'india-to-indonesia', 'india-to-nepal', 'india-to-maldives', 'india-to-saudi-arabia',
  'india-to-qatar', 'india-to-china',
  // Canada / Australia origin
  'canada-to-united-states', 'canada-to-india', 'australia-to-japan', 'australia-to-thailand',
  'australia-to-indonesia',
  // Regional / intra-Asia
  'china-to-japan', 'philippines-to-japan', 'singapore-to-japan', 'germany-to-spain',
];

const headers = (slug) => ({
  Origin: SITE,
  Referer: `${SITE}/${slug}`,
  'Content-Type': 'application/json',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, cached = 0, failed = 0;
const failures = [];

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
    else if (json.ok) { ok++; console.log(`${label} — GENERATED ✓ (${secs}s)`); }
    else { failed++; failures.push(slug); console.log(`${label} — FAILED: ${json.error || res.status} (${secs}s)`); }
  } catch (e) {
    failed++; failures.push(slug);
    console.log(`${label} — ERROR: ${e.message}`);
  }
  await sleep(1500); // polite gap between requests
}

console.log(`\n===== DONE =====`);
console.log(`Generated: ${ok} | Already cached: ${cached} | Failed: ${failed}`);
if (failures.length) console.log(`Failed routes: ${failures.join(', ')}`);
