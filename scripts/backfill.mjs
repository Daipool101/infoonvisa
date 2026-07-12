// One-time backfill: force-regenerate every corridor so it gets the new
// "rejection reasons" section (and trimmed tips). Goes through the LIVE endpoint
// (canonical code, Vertex) with the secret REGEN_KEY. Skips pages that already
// have rejectionReasons. saveCorridor preserves each page's existing status.
//   node scripts/backfill.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2];
}
const KEY = (env.REGEN_KEY || '').trim();
if (!KEY) { console.error('Missing REGEN_KEY in .dev.vars'); process.exit(1); }
const SITE = 'https://infoonvisa.com';
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await db.from('corridors').select('slug, data');
if (error) { console.error('DB error:', error.message); process.exit(1); }

const todo = rows.filter((r) => !(r.data?.rejectionReasons?.length));
console.log(`${rows.length} total pages; ${rows.length - todo.length} already done; ${todo.length} to backfill.\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fail = 0;
const failed = [];
for (let i = 0; i < todo.length; i++) {
  const slug = todo[i].slug;
  const label = `[${i + 1}/${todo.length}] ${slug}`;
  try {
    const t0 = Date.now();
    const res = await fetch(`${SITE}/api/generate`, {
      method: 'POST',
      headers: {
        Origin: SITE, Referer: `${SITE}/${slug}`,
        'x-regen-key': KEY, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug, force: true }),
    });
    const j = await res.json().catch(() => ({}));
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    if (j.ok) { ok++; console.log(`${label} — OK (${s}s)`); }
    else { fail++; failed.push(slug); console.log(`${label} — FAIL: ${j.error || res.status} (${s}s)`); }
  } catch (e) { fail++; failed.push(slug); console.log(`${label} — ERROR: ${e.message}`); }
  await sleep(1500);
}
console.log(`\n===== BACKFILL DONE =====`);
console.log(`OK: ${ok} | Failed: ${fail}`);
if (failed.length) console.log(`Failed: ${failed.join(', ')}`);
