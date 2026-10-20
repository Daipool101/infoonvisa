// Diagnose a failing corridor generation. Reports only; writes nothing.
//
// /api/generate deliberately does not leak backend error text to callers — it
// returns a flat `generation_failed` and logs the detail server-side. That is
// right for the public endpoint and useless when the Worker logs are not to
// hand, so this runs the same two passes from Node and prints the accounting
// production throws away: finishReason, thinking vs output tokens, and which
// of the five failure points would have fired.
//
//   node --experimental-strip-types scripts/diagnose-generate.mjs india fiji
//
// GEMINI_MODEL in the environment overrides the one in .dev.vars, so the same
// route can be compared across models without editing anything.

import { loadEnv, vertexGenerate, textOf, retrievedUrls, searchTitles } from './lib-vertex.mjs';
import { buildResearchPrompt, buildStructurePrompt, RESPONSE_SCHEMA } from '../src/lib/gemini.ts';
import { COUNTRIES } from '../src/lib/countries.ts';
import { buildEvidence, evidenceIsPublishable } from '../src/lib/evidence.ts';
import { sanitizeCorridorLinks } from '../src/lib/links.ts';

const env = loadEnv(new URL('../.dev.vars', import.meta.url));
if (process.env.GEMINI_MODEL) env.GEMINI_MODEL = process.env.GEMINI_MODEL;

const find = (s) => COUNTRIES.find((c) => c.slug === s);
const from = find(process.argv[2] ?? 'india');
const to = find(process.argv[3] ?? 'fiji');
if (!from || !to) {
  console.error('Unknown country slug. Usage: diagnose-generate.mjs <from-slug> <to-slug>');
  process.exit(1);
}

const report = (label, json, secs) => {
  const c = json?.candidates?.[0] ?? {};
  const u = json?.usageMetadata ?? {};
  const text = textOf(json);
  console.log(
    `${label}  ${secs}s  finish=${c.finishReason}  prompt=${u.promptTokenCount ?? 0}` +
      `  thinking=${u.thoughtsTokenCount ?? 0}  output=${u.candidatesTokenCount ?? 0}  text=${text.length}`
  );
  if (!text) console.log(`   no text came back. candidate: ${JSON.stringify(c).slice(0, 400)}`);
  return text;
};

const timed = async (fn) => {
  const t0 = Date.now();
  const out = await fn();
  return [out, ((Date.now() - t0) / 1000).toFixed(1)];
};

console.log(`model=${env.GEMINI_MODEL || 'gemini-2.5-flash'}  route=${from.slug} -> ${to.slug}\n`);

const [r1, s1] = await timed(() =>
  vertexGenerate(env, {
    prompt: buildResearchPrompt(from, to),
    tools: [{ urlContext: {} }, { googleSearch: {} }],
    config: { temperature: 0 },
  })
);
const research = report('pass 1 research ', r1, s1);
if (!research) { console.log('\nFAILS AT: empty research response from vertex'); process.exit(0); }

const evidence = buildEvidence(retrievedUrls(r1), searchTitles(r1));
console.log(`   retrieved=${retrievedUrls(r1).length}  searched=${searchTitles(r1).length}`);

const [r2, s2] = await timed(() =>
  vertexGenerate(env, {
    prompt: buildStructurePrompt(from, to, research, retrievedUrls(r1)),
    config: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  })
);
const structured = report('pass 2 structure', r2, s2);
if (!structured) { console.log('\nFAILS AT: empty structuring response from vertex'); process.exit(0); }

let parsed;
try {
  parsed = JSON.parse(structured);
} catch (e) {
  console.log(`\nFAILS AT: JSON.parse — ${e.message}`);
  console.log('tail:', structured.slice(-300));
  process.exit(0);
}
console.log(`\nmodel said: verdict=${parsed.verdict}  sources=${parsed.sources?.length ?? 0}  officialSource="${parsed.officialSource?.url ?? ''}"`);
(parsed.sources ?? []).forEach((s, i) => console.log(`   source[${i}] ${s.url}`));
console.log('   research notes mention these URLs:');
[...new Set(research.match(/https?:\/\/[^\s)\]"']+/g) ?? [])].forEach((u) => console.log(`     ${u}`));

const { data: clean, report: linkReport } = await sanitizeCorridorLinks(parsed, to.slug);
console.log(`links: ${linkReport.rewritten} rewritten, ${linkReport.dropped} dropped`);
if (!clean.officialSource?.url) {
  console.log('FAILS AT: no working official source (link check dropped it)');
  process.exit(0);
}

const status = evidenceIsPublishable(evidence, clean.officialSource, from.iso, to.iso)
  ? 'verified (goes live)'
  : 'pending_review (held for a human)';
console.log(`\nWOULD SUCCEED`);
console.log(`  officialSource : ${clean.officialSource.url}`);
console.log(`  gov sources    : ${evidence.governmentCount} of ${evidence.sources.length}`);
console.log(`  status         : ${status}`);
