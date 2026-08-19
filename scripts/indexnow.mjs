// Notify search engines (Bing, Yandex, Seznam, Naver) that URLs changed, via
// IndexNow. Unlike Google, this accepts thousands of URLs in one call and acts
// within minutes — worth using because Bing is where the site actually ranks.
//
// The key is public by design: IndexNow verifies ownership by fetching
// https://infoonvisa.com/<key>.txt, so the file lives in public/.
//
//   node scripts/indexnow.mjs                 # every URL in both sitemaps
//   node scripts/indexnow.mjs --file list.txt # a specific list, one URL per line
//   node scripts/indexnow.mjs <url> [<url>…]  # ad-hoc URLs
//   node scripts/indexnow.mjs --dry-run       # show what would be sent
const KEY = 'a62d09a38dbf478d814ae3dbf091fc68';
const HOST = 'infoonvisa.com';
const SITE = `https://${HOST}`;
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const fileIdx = args.indexOf('--file');

async function fromSitemaps() {
  const maps = [`${SITE}/sitemap-0.xml`, `${SITE}/sitemap-corridors.xml`];
  const urls = new Set();
  for (const m of maps) {
    const res = await fetch(m);
    if (!res.ok) { console.error(`  ! could not read ${m} (${res.status})`); continue; }
    const xml = await res.text();
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(match[1].trim());
  }
  return [...urls];
}

let urls;
if (fileIdx !== -1) {
  const { readFileSync } = await import('node:fs');
  urls = readFileSync(args[fileIdx + 1], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
} else {
  const explicit = args.filter((a) => a.startsWith('http'));
  urls = explicit.length ? explicit : await fromSitemaps();
}

// IndexNow rejects the whole batch if any URL is on another host.
urls = urls.filter((u) => {
  try { return new URL(u).host === HOST; } catch { return false; }
});
if (!urls.length) { console.error('No URLs to submit.'); process.exit(1); }

console.log(`Submitting ${urls.length} URLs for ${HOST}`);
console.log(`  key file: ${KEY_LOCATION}`);
if (DRY) {
  urls.slice(0, 10).forEach((u) => console.log(`    ${u}`));
  if (urls.length > 10) console.log(`    … and ${urls.length - 10} more`);
  console.log('\nDRY RUN — nothing submitted.');
  process.exit(0);
}

// Confirm the key file is reachable first: without it every submission is
// silently ignored, and IndexNow still answers 200.
const keyCheck = await fetch(KEY_LOCATION);
const keyBody = keyCheck.ok ? (await keyCheck.text()).trim() : '';
if (!keyCheck.ok || keyBody !== KEY) {
  console.error(`\nKey file not serving correctly (${keyCheck.status}, body "${keyBody.slice(0, 40)}").`);
  console.error('Deploy public/' + KEY + '.txt before submitting.');
  process.exit(1);
}
console.log('  key file verified ✓');

// 10,000 URLs per request is the documented ceiling; batch well under it.
const BATCH = 1000;
let sent = 0;
for (let i = 0; i < urls.length; i += BATCH) {
  const urlList = urls.slice(i, i + BATCH);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  const text = await res.text();
  // 200 = accepted, 202 = accepted but key still validating.
  if (res.status === 200 || res.status === 202) {
    sent += urlList.length;
    console.log(`  batch ${i / BATCH + 1}: ${urlList.length} URLs -> ${res.status} ${res.status === 202 ? '(accepted, key validating)' : 'OK'}`);
  } else {
    console.error(`  batch ${i / BATCH + 1}: FAILED ${res.status} ${text.slice(0, 200)}`);
  }
}
console.log(`\nSubmitted ${sent}/${urls.length} URLs.`);
