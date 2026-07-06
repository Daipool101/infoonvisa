// Pushes the 3 Vertex secrets from .dev.vars onto the deployed Worker.
// Run AFTER `npx wrangler login`.  Run: node scripts/push-vertex-secrets.mjs
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CONFIG = 'dist/server/wrangler.json';
const KEYS = ['GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_SA_KEY'];

const env = {};
for (const line of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

for (const k of KEYS) {
  const val = env[k];
  if (!val) { console.error(`Missing ${k} in .dev.vars`); process.exit(1); }
  console.log(`Setting secret ${k}${k === 'GCP_SA_KEY' ? ' (base64 key)' : ` = ${val}`} ...`);
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', k, '--config', CONFIG], {
    input: val, stdio: ['pipe', 'inherit', 'inherit'], shell: true,
  });
  if (r.status !== 0) { console.error(`Failed on ${k}`); process.exit(1); }
}
console.log('\n✅ All 3 Vertex secrets set on the Worker.');
