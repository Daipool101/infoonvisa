// Add "real situation" FAQs to stored corridor pages.
//
// Existing pages answer the general questions (transit, extension, working).
// People describing a situation to an AI assistant ask different ones: passport
// expiring soon, a previous refusal, how much money to show, applying at short
// notice, being self-employed, travelling with children. This appends those.
//
// SAFETY: only `data.faq` is read and written. The verdict, summary, documents,
// applySteps, sources and officialSource are copied through untouched, and a
// full backup of every page it changes is written to disk before anything is
// saved, so a bad run can be reverted with restore-faq-backup.mjs.
//
//   node scripts/add-situational-faqs.mjs --only india-to-japan,india-to-china
//   node scripts/add-situational-faqs.mjs --limit 2          # pilot, dry run
//   node scripts/add-situational-faqs.mjs --limit 2 --write  # apply
//   node scripts/add-situational-faqs.mjs --write            # everything
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const LIMIT = Number(flag('--limit')) || null;
const ONLY = (flag('--only') || '').split(',').filter(Boolean);

const env = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// countries.ts rows: ['IN', 'India', 'india', 'Indian'],
const COUNTRY = {};
const ROW = /\['([A-Z]{2})',\s*'((?:[^'\\]|\\.)*)',\s*'([^']+)',\s*'((?:[^'\\]|\\.)*)'\]/g;
for (const m of readFileSync(new URL('../src/lib/countries.ts', import.meta.url), 'utf8').matchAll(ROW)) {
  COUNTRY[m[3]] = { name: m[2].replace(/\\'/g, "'"), demonym: m[4].replace(/\\'/g, "'") };
}

// ---- Vertex AI auth (service account -> OAuth token) ----
const sa = JSON.parse(env.GCP_SA_KEY.trim().startsWith('{') ? env.GCP_SA_KEY : Buffer.from(env.GCP_SA_KEY, 'base64').toString());
const b64url = (s) => Buffer.from(s).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign('RSA-SHA256').update(input).sign(sa.private_key).toString('base64url');
  const res = await fetch(claims.aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${input}.${sig}`,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    faq: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { q: { type: 'STRING' }, a: { type: 'STRING' } }, required: ['q', 'a'] },
    },
  },
  required: ['faq'],
};

const VERDICT_CONTEXT = {
  visa_free: 'This route is VISA-FREE for short tourist stays. There is no visa application, so do NOT ask about application documents, bank balance for a visa, or processing time. Focus instead on: length of stay limits, passport validity, proof required AT THE BORDER, re-entry after a side trip, overstaying, and what immigration may ask.',
  voa: 'This route uses a VISA ON ARRIVAL. Focus on what must be ready on arrival, what can go wrong at the airport, passport validity, and whether it can be arranged in advance.',
  evisa: 'This route uses an E-VISA applied for online before travel.',
  eta: 'This route needs a TRAVEL AUTHORISATION (ETA) applied for online — it is not a full visa.',
  embassy: 'This route needs a visa obtained from an embassy/consulate or visa centre before travel.',
};

function buildPrompt(from, to, existing, verdict, headline) {
  return `You write visa FAQs for travellers. Corridor: a ${from.demonym} citizen travelling to ${to.name} for TOURISM.

THE ANSWER FOR THIS ROUTE: ${headline}
${VERDICT_CONTEXT[verdict] || ''}

Write EXACTLY 5 new FAQ entries covering the SITUATIONS people describe when they ask an
assistant for help. Every question must make sense for the route described above.
Choose the 5 most relevant to this corridor from:
- passport expiring soon / not enough validity
- a previous visa refusal, for this country or another
- how much money or bank balance to show, and what proof is accepted
- applying at short notice / whether there is enough time before the trip
- being self-employed, a student, retired, or between jobs
- travelling with children, a spouse, or elderly parents
- needing multiple entries, or re-entering after a side trip
- what happens if plans change after the visa is issued

HARD RULES:
- Phrase "q" exactly as a traveller would type it, first person, e.g.
  "My passport expires in 5 months - can I still apply for ${to.name}?"
- ONE concrete situation per question. Never write a question containing alternatives with
  slashes such as "I am self-employed/a student/retired" or "with my children/spouse/parents" —
  that is not how a real person writes. Pick ONE and commit to it.
- "a" is 2-4 plain sentences. Answer the situation directly in the FIRST sentence.
- NEVER invent a specific fee, bank balance or figure. If the exact number is not certain,
  describe the requirement and tell the reader to confirm it on the official source.
- Be specific to ${from.demonym} applicants going to ${to.name}, not generic visa advice.
- Never promise approval. No marketing language.
- Do NOT repeat or rephrase any of these questions the page already answers:
${existing.map((q) => `  - ${q}`).join('\n')}`;
}

const MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';
const LOCATION = env.GCP_LOCATION || 'us-central1';
const URL_ = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${env.GCP_PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

async function askForFaqs(token, from, to, existing, verdict, headline) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(from, to, existing, verdict, headline) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty response');
  return JSON.parse(text).faq || [];
}

// A figure the model was told not to invent — flag it rather than publish it.
const INVENTED_FIGURE = /(?:USD|EUR|GBP|INR|₹|\$|€|£)\s?\d|(\b\d[\d,]{2,}\b\s*(?:rupees|dollars|euros|pounds))/i;

const { data: rows, error } = await db.from('corridors').select('id, slug, data');
if (error) { console.error('DB error:', error.message); process.exit(1); }

let todo = rows.filter((r) => !r.data?.situationalFaqsAdded);
if (ONLY.length) todo = rows.filter((r) => ONLY.includes(r.slug));
if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`${rows.length} corridors; ${todo.length} to process${WRITE ? '' : '  (DRY RUN)'}\n`);

const token = await accessToken();
const updates = [];
const backup = [];
let flagged = 0;

for (let i = 0; i < todo.length; i++) {
  const r = todo[i];
  const [fromSlug, toSlug] = r.slug.split('-to-');
  const from = COUNTRY[fromSlug], to = COUNTRY[toSlug];
  if (!from || !to) { console.log(`?? ${r.slug}: unknown country, skipped`); continue; }
  const existing = (r.data.faq || []).map((f) => f.q);

  try {
    const added = await askForFaqs(token, from, to, existing, r.data.verdict, r.data.verdictHeadline || '');
    const clean = added.filter((f) => f?.q && f?.a);
    if (!clean.length) { console.log(`!! ${r.slug}: model returned nothing, skipped`); continue; }

    console.log(`[${i + 1}/${todo.length}] ${r.slug}  (+${clean.length})`);
    for (const f of clean) {
      const warn = INVENTED_FIGURE.test(f.a) ? '  <-- CHECK: contains a figure' : '';
      console.log(`   Q: ${f.q}${warn}`);
      console.log(`   A: ${f.a}\n`);
      if (warn) flagged++;
    }
    backup.push({ id: r.id, slug: r.slug, faq: r.data.faq || [] });
    updates.push({ id: r.id, data: { ...r.data, faq: [...(r.data.faq || []), ...clean], situationalFaqsAdded: true } });
  } catch (e) {
    console.log(`!! ${r.slug}: ${e.message}`);
  }
  await new Promise((s) => setTimeout(s, 400)); // be polite to the API
}

console.log(`\n${updates.length} pages would gain questions; ${flagged} answers contain a figure worth checking.`);

if (!WRITE) { console.log('\nDRY RUN — nothing written. Add --write to apply.'); process.exit(0); }

mkdirSync(new URL('../.faq-backups/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = new URL(`../.faq-backups/faq-${stamp}.json`, import.meta.url);
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`Backup of previous FAQs: .faq-backups/faq-${stamp}.json`);

let ok = 0;
for (const u of updates) {
  const { error: e } = await db.from('corridors').update({ data: u.data }).eq('id', u.id);
  if (e) console.error(`  write failed ${u.id}: ${e.message}`); else ok++;
}
console.log(`Wrote ${ok}/${updates.length} pages.`);
