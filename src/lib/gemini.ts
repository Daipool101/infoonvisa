import { GoogleGenAI, Type } from '@google/genai';
import type { AppEnv } from './supabase';
import type { CorridorData } from './corridor';
import type { Country } from './countries';
import { sanitizeCorridorLinks, OFFICIAL_PORTALS } from './links';
import { buildEvidence, type Evidence } from './evidence';

// ─────────────────────────────────────────────────────────────────────────────
// Generation runs in TWO passes, and the reason is the whole story of this file.
//
// It used to be one call: a prompt, a JSON schema, no tools. The prompt told
// the model to "only state visa facts you can attribute to an official
// government source" and to put those URLs in `sources`. But the model had no
// way to open a website. It was being asked for footnotes with no library
// card, and it could not refuse — so it recalled a URL that looked right and
// wrote prose that sounded sourced. The citation was a guess in a citation's
// clothes, and we then checked only that the URL loaded.
//
// That is how India→Saudi Arabia went live saying Indians may use the tourist
// e-Visa. They may not; India is not on Saudi Arabia's published list. The
// model was not hallucinating from nothing — the internet is full of "Indians
// can get a Saudi e-visa", because it is true for the many Indians holding a
// used US visa, which is an exception written into Article 6(2) of the Tourist
// Visa Regulations. Ten thousand travel-agency pages repeating the exception
// outweigh one ministry PDF stating the rule. Recall is weighted by frequency;
// it has no idea who is authoritative.
//
// PASS 1 — RESEARCH. Tools on: urlContext to fetch the destination's official
// portal directly, googleSearch for everything else. Plain prose out, no
// schema. The model reads actual pages and reports what they say. The API
// tells us which URLs it really retrieved, and that list — not the model's
// prose about its sources — is what we keep as evidence.
//
// PASS 2 — STRUCTURE. Tools off. Input is pass 1's text and nothing else. It
// may only rearrange what pass 1 found, so it has nothing to invent from.
//
// Splitting them is not only about honesty: search grounding and a strict
// responseSchema cannot be combined in one call, which is very likely why
// grounding was never switched on in the first place.
// ─────────────────────────────────────────────────────────────────────────────

// Strict response schema mirroring blocks A–G. Forces structured JSON output.
// Exported so the Vertex REST path can reuse the exact same schema.
export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ['visa_free', 'voa', 'evisa', 'eta', 'embassy'] },
    verdictHeadline: { type: Type.STRING },
    summary: { type: Type.STRING },
    maxStayDays: { type: Type.INTEGER },
    processingTime: { type: Type.STRING },
    officialSource: {
      type: Type.OBJECT,
      properties: { label: { type: Type.STRING }, url: { type: Type.STRING } },
      required: ['label', 'url'],
    },
    visaOptions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          validity: { type: Type.STRING },
          maxStay: { type: Type.STRING },
          entries: { type: Type.STRING },
          eligibility: { type: Type.STRING },
        },
        required: ['type'],
      },
    },
    documents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { label: { type: Type.STRING }, note: { type: Type.STRING } },
        required: ['label'],
      },
    },
    applySteps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          link: {
            type: Type.OBJECT,
            properties: { label: { type: Type.STRING }, url: { type: Type.STRING } },
          },
        },
        required: ['text'],
      },
    },
    tips: { type: Type.ARRAY, items: { type: Type.STRING } },
    bestTimeToVisit: { type: Type.STRING },
    topPlaces: { type: Type.ARRAY, items: { type: Type.STRING } },
    faq: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { q: { type: Type.STRING }, a: { type: Type.STRING } },
        required: ['q', 'a'],
      },
    },
    rejectionReasons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { reason: { type: Type.STRING }, avoid: { type: Type.STRING } },
        required: ['reason', 'avoid'],
      },
    },
    sources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { label: { type: Type.STRING }, url: { type: Type.STRING } },
        required: ['label', 'url'],
      },
    },
  },
  required: ['verdict', 'verdictHeadline', 'summary', 'officialSource', 'visaOptions', 'documents', 'applySteps', 'tips', 'faq', 'rejectionReasons', 'sources'],
};

/** Pages we hand the model directly, so it does not depend on what search ranks. */
export function seedUrls(from: Country, to: Country): string[] {
  const urls: string[] = [];
  const dest = OFFICIAL_PORTALS[to.slug];
  if (dest) urls.push(dest.url);
  // The origin's own foreign ministry is the single most under-used source in
  // this project: gov.uk settled the UAE question when the UAE's own site
  // would not load, because a government's travel advice for its own citizens
  // is written for exactly the corridor we are describing.
  const origin = OFFICIAL_PORTALS[from.slug];
  if (origin) urls.push(origin.url);
  return urls;
}

export function buildResearchPrompt(from: Country, to: Country): string {
  const seeds = seedUrls(from, to);
  return `Research the visa rules for a citizen of ${from.name} holding an ORDINARY ${from.name}
passport, travelling to ${to.name} for TOURISM. Today's date matters: report the rules in force now.

${seeds.length ? `START by opening these pages and reading them:\n${seeds.map((u) => `  - ${u}`).join('\n')}\n` : ''}
Then search for whatever they do not answer.

WHAT COUNTS AS A SOURCE
Only pages published by a government: the destination's immigration service,
foreign ministry, e-visa portal, embassies, official gazette or regulations —
or the traveller's OWN government's travel advice, which is often clearer about
a specific nationality than the destination's site is.

These do NOT count, no matter how confident or how highly ranked they are, and
you must not base any statement on them: visa agencies and "e-visa" commercial
sites, travel agents, airlines, insurance companies, newspapers, blogs, forums,
Wikipedia. They are frequently out of date and they are selling something.

THE TRAP TO AVOID
An exception that applies to many travellers is not the rule. If a route is
open only to people holding some other country's visa, or a residence permit,
or who bought a package, then the rule for an ordinary passport is the OTHER
route, and the exception must be described as an exception with its condition
attached. Saudi Arabia is the worked example: most of the web says Indians can
get a Saudi e-Visa, and the regulations say they cannot unless they hold a used
US, UK or Schengen visa. State the rule first, then the exception.

ALSO CHECK, because these are where this project has been wrong before:
- Whether a named nationality appears on an eligibility LIST, rather than
  assuming a general rule covers it. Open the list and look.
- Which COLUMN a figure sits in. Fee and entitlement tables are usually split
  by passport type (ordinary / official / diplomatic) and by nationality.
- Whether the rule CHANGED recently, or changes on a known future date.
- Passport validity: state the destination's actual requirement, not "six
  months" as a default.

REPORT, in plain prose, no JSON:
1. VERDICT — one of visa_free / voa / evisa / eta / embassy, for an ordinary
   passport, and one sentence saying why.
2. Each visa category realistically available, with validity, maximum stay,
   entries, and who each is for. Include conditional routes with the condition.
3. Maximum stay in days, processing time, documents, how and where to apply.
4. For EVERY statement above: which page you read it on, and what it said.
5. WHAT YOU COULD NOT CONFIRM on a government page. Be explicit. It is far more
   useful to say "the fee is not published" than to supply a number.

Do not state a fee unless you read it on a government page in this session.`;
}

export function buildStructurePrompt(from: Country, to: Country, research: string): string {
  return `Turn the research notes below into the required JSON for a visa guide:
a citizen of ${from.name} travelling to ${to.name} for tourism.

THE ONE RULE: every fact in your JSON must already appear in the notes. You are
rearranging, not researching. If the notes do not settle something, leave the
field out or say plainly that it is not published on the official source. Do
NOT fill a gap from your own knowledge — your knowledge is what these notes
were commissioned to replace.

- "verdict" is the verdict the notes give, and must describe the MAIN route for
  an ORDINARY passport. If the notes say a route is conditional, the verdict is
  the unconditional route, and the conditional one becomes a visa option whose
  NAME carries the condition, e.g. "Tourist e-Visa (only with a used US, UK or
  Schengen visa)".
- Call travellers "${from.demonym} citizens" — never "${from.name} citizens",
  never "citizens of ${from.name}".
- "verdictHeadline": one clear sentence.
- "visaOptions": every category the notes describe, each with type, validity,
  maxStay, entries and a short "best for..." eligibility line. Never collapse
  them into one.
- "officialSource" and "sources": ONLY URLs that appear in the notes as pages
  actually read. Never construct a URL to look specific, and never append
  visa-centre or locale path codes.
- "faq": 8-10 questions phrased the way a traveller would type them ("My
  passport expires in 5 months — can I still apply?"). Answer in 2-4 plain
  sentences, using only the notes. Where the notes do not settle it, say what
  the requirement is and send the reader to the official source.
- "tips": 3-4 practical entry/customs tips for ${to.name}.
- "rejectionReasons": 4-6 common refusal reasons with a concrete "avoid" tip.
  General guidance only — never guarantee approval.
- No fee figures anywhere unless the notes quote one from a government page.
- Concise and factual. No marketing language.

RESEARCH NOTES
──────────────
${research}`;
}

export interface GenerationResult {
  data: CorridorData | null;
  error?: string;
  /** What the research pass actually retrieved. Absent if research failed. */
  evidence?: Evidence;
  /** The raw research prose, kept so a human can audit what shaped the page. */
  research?: string;
}

/** Pass 1: read real pages. Returns prose plus the list of what was retrieved. */
export async function researchCorridor(
  env: AppEnv,
  from: Country,
  to: Country
): Promise<{ text: string; evidence: Evidence } | { error: string }> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: buildResearchPrompt(from, to),
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }],
      temperature: 0,
      maxOutputTokens: 8192,
    },
  });
  const text = res.text;
  if (!text) return { error: 'empty research response' };

  const cand = res.candidates?.[0] as any;
  // These two lists come from the API, not from the model's prose. That is the
  // point: the model cannot claim to have read a ministry it never opened.
  const retrieved: string[] = (cand?.urlContextMetadata?.urlMetadata ?? [])
    .filter((m: any) => String(m?.urlRetrievalStatus ?? '').includes('SUCCESS'))
    .map((m: any) => m.retrievedUrl)
    .filter(Boolean);
  const searched: string[] = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c: any) => c?.web?.title)
    .filter(Boolean);

  return { text, evidence: buildEvidence(retrieved, searched) };
}

/** Pass 2: shape the research into the page's JSON. No tools, nothing to invent from. */
export async function structureCorridor(
  env: AppEnv,
  from: Country,
  to: Country,
  research: string
): Promise<{ data: CorridorData } | { error: string }> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: buildStructurePrompt(from, to, research),
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as any,
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });
  const text = res.text;
  if (!text) return { error: 'empty structuring response' };
  try {
    return { data: JSON.parse(text) as CorridorData };
  } catch (e: any) {
    return { error: `unparsable JSON: ${String(e?.message).slice(0, 120)}` };
  }
}

export async function generateCorridor(
  env: AppEnv,
  from: Country,
  to: Country
): Promise<GenerationResult> {
  if (!env.GEMINI_API_KEY) return { data: null, error: 'missing GEMINI_API_KEY' };
  try {
    const researched = await researchCorridor(env, from, to);
    if ('error' in researched) return { data: null, error: researched.error };

    const structured = await structureCorridor(env, from, to, researched.text);
    if ('error' in structured) {
      return { data: null, error: structured.error, evidence: researched.evidence, research: researched.text };
    }

    const parsed = structured.data;
    if (!parsed.sources?.length || !parsed.officialSource?.url) {
      return { data: null, error: 'no official source in response', evidence: researched.evidence, research: researched.text };
    }
    const { data: clean } = await sanitizeCorridorLinks(parsed, to.slug);
    if (!clean.officialSource?.url) {
      return { data: null, error: 'no working official source', evidence: researched.evidence, research: researched.text };
    }
    // The evidence travels with the page. The dashboard shows it, and the
    // publish gate reads it — a page can no longer go live on a source the
    // model merely named.
    (clean as any).evidence = researched.evidence;
    return { data: clean, evidence: researched.evidence, research: researched.text };
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 300);
    console.error('Gemini generation failed:', msg);
    return { data: null, error: msg };
  }
}
