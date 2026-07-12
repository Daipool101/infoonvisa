import { GoogleGenAI, Type } from '@google/genai';
import type { AppEnv } from './supabase';
import type { CorridorData } from './corridor';
import type { Country } from './countries';

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
  required: ['verdict', 'verdictHeadline', 'summary', 'officialSource', 'visaOptions', 'documents', 'applySteps', 'faq', 'rejectionReasons', 'sources'],
};

export function buildPrompt(from: Country, to: Country): string {
  return `You are a meticulous visa-information researcher. Produce a structured guide for a
citizen of ${from.name} (passport: ${from.name}) travelling to ${to.name} for TOURISM.

HARD RULES — accuracy over completeness:
- Only state visa facts you can attribute to an official government / e-visa source. Put those
  official URLs in "sources" and the single most authoritative one in "officialSource".
- DO NOT invent or guess fees. Omit fee numbers entirely.
- If a fact is uncertain, prefer a conservative statement and advise verifying on the official site.
- "verdict" must reflect the MAIN requirement for an ORDINARY ${from.name} tourist passport.
- "verdictHeadline" is one clear sentence, e.g. "${from.name} citizens need an e-Visa before travelling to ${to.name}."
- "visaOptions" MUST list EVERY visa category realistically available to a ${from.name} citizen for
  ${to.name} — e.g. tourist (single & multiple entry), e-Visa/VOA where applicable, transit,
  business/commercial, and visiting-relatives. Give each its own entry with type, validity, maxStay,
  entries and "eligibility" (a short "best for…" description). Do NOT collapse them into one.
- "documents" lists only what actually applies (passport validity rule, photo, proof of funds,
  return ticket, accommodation, etc.).
- "applySteps" are concrete numbered actions; include the official application URL where relevant.
- "faq" = 4-6 genuinely useful corridor-specific questions (extensions, transit, working, etc.).
- "tips" = 3-4 short practical entry/safety/customs tips for ${to.name}.
- "rejectionReasons" = 4-6 of the most common reasons a ${from.name} citizen's ${to.name} tourist
  visa application gets REFUSED (e.g. weak proof of funds, unclear travel purpose, incomplete or
  inconsistent documents, weak ties to home country, previous overstays/refusals, invalid passport
  validity). For each, give a short concrete "avoid" tip on how the applicant can prevent it.
  Keep it general guidance — never guarantee approval.
- Be concise and factual. No marketing language.`;
}

export interface GenerationResult {
  data: CorridorData | null;
  error?: string;
}

export async function generateCorridor(
  env: AppEnv,
  from: Country,
  to: Country
): Promise<GenerationResult> {
  if (!env.GEMINI_API_KEY) return { data: null, error: 'missing GEMINI_API_KEY' };
  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: buildPrompt(from, to),
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as any,
        temperature: 0.2,
        // Safety cap: normal output is ~4k tokens; 8192 gives 2x headroom while
        // bounding any runaway response so a single call can't balloon the bill.
        maxOutputTokens: 8192,
      },
    });
    const text = res.text;
    if (!text) return { data: null, error: 'empty response from model' };
    const parsed = JSON.parse(text) as CorridorData;
    // Minimum quality gate: must carry at least one official source.
    if (!parsed.sources?.length || !parsed.officialSource?.url) {
      return { data: null, error: 'no official source in response' };
    }
    return { data: parsed };
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 300);
    console.error('Gemini generation failed:', msg);
    return { data: null, error: msg };
  }
}
