// Weekly visa-news research, drafted into the blog's own format.
//
// Runs in GitHub Actions, not in the Worker. Cloudflare Workers are built to
// answer a request in under a second and enforce CPU and subrequest limits; a
// fifteen-minute research job is cut off partway through and looks like it
// simply stopped. Here there is no time limit, and accuracy matters far more
// than speed.
//
// Two passes, for the same reason src/lib/gemini.ts has two:
//
//   1. RESEARCH — tools on (urlContext + googleSearch), prose out. Finds what
//      changed this week and where it says so.
//   2. DRAFT — tools off, schema on, input is pass 1's notes and nothing else.
//      It may rearrange what research found; it cannot add from its own
//      knowledge.
//
// They cannot be one call: grounding and a strict responseSchema are mutually
// exclusive in a single request.
//
// The evidence gate is imported from src/lib/evidence.ts rather than
// reimplemented, so what counts as a government source cannot drift between the
// corridor pipeline and this one. Node reads the TypeScript directly via
// --experimental-strip-types; see the workflow.
//
//   node --experimental-strip-types scripts/blog-research.mjs --dry-run
//   node --experimental-strip-types scripts/blog-research.mjs --trigger schedule
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { KeyPool, PoolExhaustedError, textOf, retrievedUrls, searchTitles } from './lib-blog-keys.mjs';
import { classifySource } from '../src/lib/evidence.ts';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const TRIGGER = args.includes('--trigger') ? args[args.indexOf('--trigger') + 1] : 'manual';
const MAX_DRAFTS = 4;

const ROOT = new URL('../', import.meta.url);
const BLOG_DIR = new URL('src/content/blog/', ROOT);
const IMG_DIR = new URL('public/images/', ROOT);

// ── environment ─────────────────────────────────────────────────────────────
const env = { ...process.env };
try {
  for (const l of readFileSync(new URL('.dev.vars', ROOT), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
} catch { /* CI has no .dev.vars — real env vars are used */ }

const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── what the drafts are allowed to reference ────────────────────────────────
const TAGS = [
  'visa-basics', 'guides', 'travel-planning', 'application-tips', 'checklist',
  'passport', 'processing-time', 'proof-of-funds', 'documents', 'visa-documents',
  'refusal', 'visa-rejection', 'schengen', 'europe', 'travel-insurance',
  'visa-interview', 'visa-news', 'policy-update',
];
const STATIC_PAGES = ['/', '/countries', '/about', '/contact', '/privacy', '/terms', '/blog'];

const covers = readdirSync(IMG_DIR).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
const existingSlugs = new Set(readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));

const { data: corridorRows, error: cErr } = await db
  .from('corridors').select('slug,from_country,to_country').eq('status', 'verified');
if (cErr) { console.error('cannot read corridors:', cErr.message); process.exit(1); }
const corridorSlugs = new Set((corridorRows ?? []).map((r) => r.slug));
const originSlugs = new Set((corridorRows ?? []).map((r) => r.slug.split('-to-')[0]));

const kebab = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70).replace(/-$/, '');

const windowFrom = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
const windowTo = new Date().toISOString().slice(0, 10);

// ── run record, opened before any work ──────────────────────────────────────
// Created at the start rather than the end: a run that dies halfway must still
// leave a trace. A job that vanishes silently is the failure this project keeps
// having to fix.
let runId = null;
if (!DRY) {
  const { data, error } = await db.from('blog_runs')
    .insert({ trigger: TRIGGER, window_from: windowFrom, window_to: windowTo })
    .select('id').single();
  if (error) { console.error('cannot open run record:', error.message); process.exit(1); }
  runId = data.id;
}
const finish = async (fields) => {
  if (DRY || !runId) return;
  await db.from('blog_runs').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', runId);
};

console.log(`Blog research — ${windowFrom} to ${windowTo}${DRY ? '  (DRY RUN)' : ''}`);

const pool = new KeyPool(db);
try {
  const n = await pool.load();
  console.log(`  ${n} API key(s) in the pool\n`);
} catch (e) {
  console.error(e.message);
  await finish({ status: 'failed', error: e.message });
  process.exit(1);
}

// ── PASS 1 — research ───────────────────────────────────────────────────────
// Which countries the site actually writes about. Without this the research
// drifts to whatever immigration news ranks highest, which is US employment and
// investor law written by law firms for corporate clients — the first dry run
// came back with EB-5 investor fees and H.R.1 adjustments, neither of which any
// reader of this site has ever wanted.
const topDestinations = Object.entries(
  (corridorRows ?? []).reduce((acc, r) => {
    const d = r.slug.split('-to-')[1];
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {})
).sort((a, b) => b[1] - a[1]).map(([d]) => d.replace(/-/g, ' '));

const topOrigins = Object.entries(
  (corridorRows ?? []).reduce((acc, r) => {
    const o = r.slug.split('-to-')[0];
    acc[o] = (acc[o] ?? 0) + 1;
    return acc;
  }, {})
).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o]) => o.replace(/-/g, ' '));

const researchPrompt = `Find TOURIST and SHORT-STAY visa developments announced between ${windowFrom} and ${windowTo}.

WHO THIS IS FOR
InfoOnVisa answers one question for ordinary travellers: "do I need a visa to go there,
and how do I get it?" Its readers are tourists and people visiting family, holding
ordinary passports. They are not companies, investors, students or migrants.

IN SCOPE
Tourist and visitor visas, visa-free arrangements, visas on arrival, e-visas, electronic
travel authorisations (ETA/ESTA/ETIAS-style), transit visas, and the fees, eligibility
lists, passport-validity rules and entry requirements attached to them.

OUT OF SCOPE — do not report these, however prominent
Employment and work visas, investor or "golden visa" programmes (EB-5 and equivalents),
student visas, permanent residence, citizenship, asylum, and corporate immigration
compliance. Law firms and mobility vendors publish constantly about these and they
dominate search results; none of it is what this site is about. Only include such a change
if it directly alters what an ordinary tourist must do.

COUNTRIES THAT MATTER MOST
The site covers these destinations: ${topDestinations.join(', ')}.
Its readers travel mainly on these passports: ${topOrigins.join(', ')}.
A change affecting one of those is worth far more than a change affecting a country the
site does not cover. Prefer them, but do not force it — a genuinely significant change
elsewhere still counts.

WHAT COUNTS AS A SOURCE
A claim about a RULE must come from a government page: an immigration department, a
foreign ministry, an e-visa portal, an embassy, an official gazette, or published
regulations. Reputable news agencies may tell you a change happened; they may not be the
basis for what the rule IS. Open the government page and read it.

Never base a statement on: visa agencies, commercial "e-visa" sites, travel agents,
airlines, insurers, comparison sites, blogs, forums, or encyclopaedias. They rank highly,
they look authoritative, they are frequently out of date, and they are selling something.

TRAPS — every one of these has produced a published error on this site
1. An exception is not the rule. If a route is open only to people holding another
   country's visa or a residence permit, the rule for an ordinary passport is the OTHER
   route. Most of the web says Indians can get a Saudi e-Visa; the regulations say they
   cannot unless they hold a used US, UK or Schengen visa.
2. "Free of charge" usually belongs to someone else. The UAE consulate page carries that
   phrase three times and never for British or American ordinary passports — those
   sentences are about Chinese nationals, Russian nationals and diplomatic passports.
3. Free is not visa-free. Qatar issues a visa on arrival at no charge. It is still a visa,
   with conditions attached.
4. An "e-visa" is not always an online application. Japan's eVISA for India and China
   still requires in-person submission at a visa centre; only the sticker became
   electronic. Indonesia's product is named "Electronic Visa on Arrival".
5. Check the column. Fee and entitlement tables split by passport type (ordinary /
   official / diplomatic) and by nationality.
6. Check the effective date. A rule announced now may start later, and the thing that
   changed may be the date rather than the rule.

URLS — IMPORTANT
Give the publisher's own address, for example https://ec.europa.eu/... or
https://www.mofa.go.jp/... . Never give a vertexaisearch.cloud.google.com redirect: those
are internal search plumbing, they expire, and they tell a reader nothing about who
published the page.

Report up to 6 developments, most significant first. Use EXACTLY this format, repeated:

STORY
HEADLINE: <one line, plain, no hype>
WHAT CHANGED: <2-4 sentences, specific>
WHO IT AFFECTS: <which nationalities travelling to which country>
EFFECTIVE: <date or "already in force" or "not yet stated">
GOVERNMENT SOURCE: <the single government URL you read this on, or NONE>
SUPPORTING: <other URLs, comma separated, or NONE>
UNCONFIRMED: <anything you could not settle on a government page, or "none">
END

If nothing verifiable happened in this window, output exactly: NOTHING FOUND`;

let research;
try {
  research = await pool.call({
    prompt: researchPrompt,
    tools: [{ urlContext: {} }, { googleSearch: {} }],
    label: 'research',
  });
} catch (e) {
  const msg = e instanceof PoolExhaustedError ? e.message : `research failed: ${e.message}`;
  console.error(`\n${msg}`);
  await finish({ status: 'failed', error: msg, api_calls: pool.totalCalls, keys_used: pool.usage() });
  process.exit(1);
}

const researchText = textOf(research);
const evidence = [
  ...retrievedUrls(research).map((u) => classifySource(u, 'url')),
  ...searchTitles(research).map((t) => classifySource(t, 'search')),
];
const seenEv = new Set();
const sources = evidence.filter((s) => !seenEv.has(s.title) && seenEv.add(s.title));
const govCount = sources.filter((s) => s.government).length;

console.log(`\n  sources opened: ${sources.length} (${govCount} government)`);
sources.forEach((s) => console.log(`    ${s.government ? '[gov]' : '     '} ${s.title}`));

// ── parse the stories ───────────────────────────────────────────────────────
const field = (block, key) => {
  const m = block.match(new RegExp(`^[*#>\\-\\s]*${key}\\**\\s*:\\s*\\**\\s*(.+)$`, 'im'));
  return m ? m[1].replace(/\*+/g, '').trim() : '';
};
const stories = researchText.includes('NOTHING FOUND')
  ? []
  : researchText.split(/^\s*STORY\s*$/im).slice(1).map((b) => ({
      headline: field(b, 'HEADLINE'),
      what: field(b, 'WHAT CHANGED'),
      who: field(b, 'WHO IT AFFECTS'),
      effective: field(b, 'EFFECTIVE'),
      gov: field(b, 'GOVERNMENT SOURCE'),
      supporting: field(b, 'SUPPORTING'),
      unconfirmed: field(b, 'UNCONFIRMED'),
      raw: b.split(/^\s*END\s*$/im)[0].trim(),
    })).filter((s) => s.headline);

console.log(`\n  stories reported: ${stories.length}`);

// A story with no government page behind it does not become a post. Producing
// nothing is a correct outcome; producing something unsourced is not.
//
// Two separate checks, and the second one matters more. The first asks whether
// the cited URL LOOKS governmental. The second asks whether it is a page the
// API says it actually FETCHED — because a model can name a ministry it never
// opened, and in the first dry run it did exactly that: two stories cited
// government URLs while four of the five pages actually retrieved were
// immigration law firms. A citation nothing opened is not evidence.
const fetchedHosts = new Set(
  sources.map((x) => {
    try { return new URL(x.url ?? `https://${x.title}`).hostname.replace(/^www\./, ''); }
    catch { return String(x.title).replace(/^www\./, ''); }
  })
);
const wasFetched = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    // Host match, not exact URL: grounding reports bare domains, and a ministry
    // page reached through search is still a page that was read.
    return [...fetchedHosts].some((f) => h === f || h.endsWith(`.${f}`) || f.endsWith(`.${h}`));
  } catch { return false; }
};

// Grounding hands the model redirect stubs on vertexaisearch.cloud.google.com
// rather than real addresses, and the model cites what it was given. A stub is
// useless twice over: it hides whether the page is governmental, and it expires,
// so one published in a post becomes a dead link within days. Resolve it to the
// address it actually points at, once, and work with that.
const resolveStub = async (url) => {
  if (!/vertexaisearch\.cloud\.google\.com/.test(url ?? '')) return url;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    return res.url || url;
  } catch {
    return url;
  }
};
for (const st of stories) {
  const real = await resolveStub(st.gov);
  if (real !== st.gov) {
    console.log(`    resolved redirect -> ${real.slice(0, 80)}`);
    st.gov = real;
  }
}

// Embassies, which isGovernmentUrl cannot know about.
//
// A country's own embassy abroad is a government source — MEMORY.md names the
// "embassy mirror" as the most useful technique on this project, because the
// main ministry portal is so often bot-walled while a small mission site
// republishes the same text in the open. But embassies sit on ordinary national
// domains: the Cambodian embassy in Germany is kambodscha-botschaft.de, and no
// pattern of .gov-shaped domains will ever match it.
//
// So this allowance exists HERE and not in src/lib/evidence.ts. Corridor pages
// keep the strict gate unchanged; only the blog, where a story is dropped
// entirely rather than published wrongly, accepts the wider net. It is still
// narrow: the host must name an embassy or consulate in one of the common
// languages, must not be one of the domains that are never evidence, and must
// not contain "visa" — real missions do not put it in their domain, and the
// agencies that impersonate them almost always do.
const EMBASSY_HOST =
  /(^|[.\-])(embassy|embassies|embajada|ambassade|ambasciata|ambasada|botschaft|consulate|consulado|konsulat|mission)([.\-]|$)/i;
const AGENCY_HOST = /visa|evisa|permit|apply|travel|tour/i;

const looksLikeMission = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return EMBASSY_HOST.test(h) && !AGENCY_HOST.test(h);
  } catch { return false; }
};

const usable = stories.filter((s) => {
  const named = s.gov && !/^none$/i.test(s.gov);
  const mission = named && looksLikeMission(s.gov);
  const governmental = named && (classifySource(s.gov, 'url').government || mission);
  const opened = governmental && wasFetched(s.gov);
  console.log(`    ${opened ? (mission ? 'KEEP* ' : 'KEEP  ') : 'DROP  '}${s.headline.slice(0, 72)}`);
  if (opened && mission) console.log(`           (accepted as an embassy/consulate: ${new URL(s.gov).hostname})`);
  if (!named) console.log('           (no government source cited)');
  else if (!governmental) console.log(`           (cited source is not a government page: ${s.gov.slice(0, 60)})`);
  else if (!opened) console.log(`           (cited ${s.gov.slice(0, 60)} but never opened it — citation without evidence)`);
  return opened;
}).slice(0, MAX_DRAFTS);

if (!usable.length) {
  console.log('\nNo story this week rests on a government page. Writing nothing.');
  await finish({
    status: 'empty', stories_found: stories.length, api_calls: pool.totalCalls,
    keys_used: pool.usage(), gov_sources: govCount,
    note: 'Research ran, but no development could be traced to a government page.',
  });
  process.exit(0);
}

// ── PASS 2 — draft ──────────────────────────────────────────────────────────
const linkHints = [...corridorSlugs].slice(0, 400).join(', ');
const blogHints = [...existingSlugs].join(', ');

const draftPrompt = (story) => `Write one blog post for InfoOnVisa from the research notes below.

THE ONE RULE: every fact in the post must already appear in the notes. You are writing up
what was found, not researching. If the notes do not settle something, say so in the post
("the fee has not been published yet") rather than filling the gap. Never invent a figure,
a date or a statistic.

RESEARCH NOTES
──────────────
${story.raw}
──────────────

HOUSE STYLE — match it closely
- 600 to 1,100 words. Existing posts average about 745. Do not pad.
- Open with what changed and who it affects. No throat-clearing, no "In today's world".
- "##" for sections. Never "#" — the title is the H1. "###" rarely.
- Short paragraphs. Plain words. Second person ("you").
- Bold the one thing in a paragraph that matters, sparingly.
- No emoji as section markers. No "In conclusion".
- Write like a knowledgeable person talking, not like a content mill.

LINKS
- Link the government source inline, as a normal markdown link, where the fact appears.
- Internal links are expected. Corridor pages are "/<origin>-to-<destination>", for
  example /india-to-japan. ONLY these slugs exist: ${linkHints}
- Blog posts are "/blog/<slug>". ONLY these exist: ${blogHints}
- Other pages: ${STATIC_PAGES.join(', ')}
- Never write an internal link that is not in those lists. A broken internal link is worse
  than no link.

FOUND IN SEARCH
- The TITLE is what appears in Google. Put the country and what changed at the FRONT,
  in the words someone would actually type: "Cambodia ends sticker visas: what travellers
  need to know", not "A New Era for Cambodian Travel". Aim for 50-60 characters so it is
  not cut off. No clickbait, no colons used for drama, no "Everything you need to know".
- The DESCRIPTION is the snippet under that title. One complete sentence, 140-160
  characters, that answers the question rather than teasing it. Someone must be able to
  read it alone and know whether this affects them.
- Put the answer in the FIRST PARAGRAPH — what changed, who it affects, from when.
  Google lifts that paragraph into featured snippets and AI overviews, and a reader who
  only sees that much should already have what they came for.
- Write "##" headings as the questions people type: "Who does this affect?",
  "When does it start?", "Do I need to do anything?" — not "Background" or "Overview".

QUOTED BY AI ASSISTANTS
This site is read by ChatGPT, Claude, Perplexity and Google's AI overviews — robots.txt
welcomes all of them by name. They quote sentences, not pages, and a sentence only
survives being lifted out of its paragraph if it carries its own context.

- Attribute inline, in the sentence: "Cambodia's Ministry of Foreign Affairs says the
  sticker visa ends on 1 November 2026" — not "the ministry says it ends soon", and not a
  claim whose source is three paragraphs away.
- Date every claim explicitly. "From 1 November 2026", never "soon", "recently" or
  "later this year". A sentence with a real date is quotable a year from now; one with
  "recently" is wrong the moment it is quoted.
- Name the specifics: the country, the visa type, the fee with its currency, the number of
  days. An assistant cannot cite "a modest increase".
- Never write a sentence that only makes sense after the one before it.

Return JSON only:
{
  "title": "...",            // 50-60 chars, country and change at the front
  "description": "...",      // ONE sentence, 140-160 chars; this is the Google snippet
  "tags": ["...", "..."],    // 2-4, ONLY from: ${TAGS.join(', ')}
  "coverHint": "japan",      // the country this is about, lowercase, one word
  "body": "..."              // markdown, no frontmatter, no H1
}`;

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    coverHint: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['title', 'description', 'tags', 'body'],
};

const written = [];
for (const story of usable) {
  console.log(`\n  drafting: ${story.headline.slice(0, 70)}`);
  let out;
  try {
    out = await pool.call({
      prompt: draftPrompt(story),
      config: { responseMimeType: 'application/json', responseSchema: DRAFT_SCHEMA, temperature: 0.3 },
      label: 'draft',
    });
  } catch (e) {
    if (e instanceof PoolExhaustedError) {
      console.error(`\n  ${e.message}`);
      console.error('  Stopping here. Drafts already written are kept.');
      break;
    }
    console.error(`  ! ${e.message}`);
    continue;
  }

  let post;
  try { post = JSON.parse(textOf(out)); } catch { console.error('  ! unparsable draft, skipped'); continue; }

  const slug = kebab(post.title);
  if (!slug) { console.error('  ! empty slug, skipped'); continue; }
  if (existingSlugs.has(slug)) { console.error(`  ! ${slug}.md already exists — skipped, never overwritten`); continue; }

  // ── validation ────────────────────────────────────────────────────────────
  const problems = [];

  // Internal links. A link that 404s is worse than plain text, so an unknown
  // one is unwrapped to its label rather than shipped or silently deleted.
  let body = post.body.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (match, text, href) => {
    const clean = href.replace(/\/$/, '') || '/';
    const ok =
      STATIC_PAGES.includes(clean) ||
      corridorSlugs.has(clean.slice(1)) ||
      (clean.startsWith('/blog/') && existingSlugs.has(clean.slice(6))) ||
      (clean.startsWith('/from/') && originSlugs.has(clean.slice(6)));
    if (ok) return match;
    problems.push(`removed dead internal link ${clean}`);
    return text;
  });

  // An external link to a grounding stub expires. Point it at the real page, or
  // unwrap it to plain text — never publish a URL that will rot.
  body = body.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, text, href) => {
    if (!/vertexaisearch\.cloud\.google\.com/.test(href)) return match;
    if (story.gov && !/vertexaisearch/.test(story.gov)) return `[${text}](${story.gov})`;
    problems.push('unwrapped a Google redirect link');
    return text;
  });

  const tags = (post.tags ?? []).filter((t) => TAGS.includes(t)).slice(0, 4);
  if (!tags.length) { tags.push('visa-news'); problems.push('no valid tags returned — defaulted to visa-news'); }

  const hint = (post.coverHint ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const cover = covers.find((f) => hint && f.toLowerCase().startsWith(hint)) ?? null;
  if (!cover && hint) problems.push(`no cover image for "${hint}" — field omitted`);

  // The title and description ARE the search result. Too long and Google
  // truncates them mid-word; too short and the snippet says nothing. Reported
  // rather than rewritten — the wording is the model's job, the warning is ours.
  const titleLen = (post.title ?? '').length;
  if (titleLen > 65) problems.push(`title ${titleLen} chars — Google will truncate it`);
  if (titleLen < 30) problems.push(`title only ${titleLen} chars — likely too vague to rank`);
  const descLen = (post.description ?? '').length;
  if (descLen > 165) problems.push(`description ${descLen} chars — the snippet will be cut`);
  if (descLen < 110) problems.push(`description only ${descLen} chars — wasting the snippet`);

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 450) problems.push(`short: ${words} words`);
  if (words > 1400) problems.push(`long: ${words} words`);

  const esc = (s) => String(s).replace(/"/g, '\\"');
  const frontmatter = [
    '---',
    `title: "${esc(post.title)}"`,
    `description: "${esc(post.description)}"`,
    `pubDate: ${windowTo}`,
    'author: InfoOnVisa',
    `tags: [${tags.map((t) => `"${t}"`).join(', ')}]`,
    ...(cover ? [`cover: "/images/${cover}"`] : []),
    `readMins: ${Math.max(1, Math.round(words / 200))}`,
    // Never anything but true. Drafts are excluded from the blog list, carry
    // noindex, are kept out of the sitemap and show a draft banner — so this
    // reaching main is safe, and only a human switching it off publishes.
    'draft: true',
    '---',
    '',
  ].join('\n');

  const file = new URL(`${slug}.md`, BLOG_DIR);
  console.log(`    ${slug}.md — ${words} words, tags: ${tags.join(', ')}${cover ? `, cover: ${cover}` : ''}`);
  problems.forEach((p) => console.log(`      note: ${p}`));

  if (!DRY) {
    writeFileSync(file, frontmatter + body.trim() + '\n', 'utf8');
    existingSlugs.add(slug);
    await db.from('blog_drafts').insert({
      run_id: runId, slug, title: post.title, words, tags,
      sources: [...sources, classifySource(story.gov, 'url')],
      gov_sources: govCount, committed: false,
    });
  }
  written.push({ slug, title: post.title, words });
}

// ── done ────────────────────────────────────────────────────────────────────
console.log(`\n${written.length} draft(s) ${DRY ? 'would be' : ''} written · ${pool.totalCalls} API call(s)`);
pool.usage().forEach((u) => console.log(`  ${u.label}: ${u.calls}`));

await finish({
  status: written.length ? 'ok' : 'empty',
  stories_found: stories.length,
  drafts_written: written.length,
  api_calls: pool.totalCalls,
  keys_used: pool.usage(),
  gov_sources: govCount,
  note: written.length ? null : 'Research ran but no draft survived validation.',
});

if (DRY) console.log('\nDRY RUN — nothing written to disk or to the database.');

// Tell the workflow whether there is anything to commit.
if (process.env.GITHUB_OUTPUT && !DRY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `drafts=${written.length}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `titles=${written.map((w) => w.title).join(' · ')}\n`);
}
