import type { AppEnv, } from './supabase';
import type { CorridorData } from './corridor';
import type { Country } from './countries';
import { buildResearchPrompt, buildStructurePrompt, RESPONSE_SCHEMA, type GenerationResult } from './gemini';
import { buildEvidence } from './evidence';
import { sanitizeCorridorLinks } from './links';

// Vertex AI generation for Cloudflare Workers.
// Unlike the AI Studio API, Vertex is NOT caller-location restricted, so it works
// from Cloudflare's edge. Auth uses a Google service account (JWT -> OAuth token)
// signed with Web Crypto (available in the Workers runtime).

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function parseSaKey(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : atob(raw); // accept raw JSON or base64
  return JSON.parse(text) as ServiceAccount;
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

// Cache the access token across requests in the same isolate.
let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return json.access_token;
}

export async function generateCorridorVertex(
  env: AppEnv,
  from: Country,
  to: Country
): Promise<GenerationResult> {
  if (!env.GCP_SA_KEY || !env.GCP_PROJECT_ID) {
    return { data: null, error: 'vertex not configured' };
  }
  try {
    const sa = parseSaKey(env.GCP_SA_KEY);
    const token = await getAccessToken(sa);
    const location = env.GCP_LOCATION || 'us-central1';
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${env.GCP_PROJECT_ID}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const call = async (prompt: string, cfg: Record<string, unknown>, tools?: unknown[]) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(tools ? { tools } : {}),
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192, ...cfg },
        }),
      });
      if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as any;
    };

    // PASS 1 — research. Tools on, no schema: search grounding and a strict
    // responseSchema cannot be combined in one request, which is the reason
    // this is two calls rather than one. See the note at the top of gemini.ts.
    const textOf = (r: any): string =>
      (r?.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => p?.text)
        .filter(Boolean)
        .join('\n');

    // Pass 1 occasionally returns HTTP 200, finishReason STOP and no text at
    // all — seen on united-states->bahamas, which answered in 3s with 141
    // thinking tokens and zero output, then generated normally on the next
    // attempt. One empty response was enough to fail the whole route, and the
    // reader saw "this guide is on the way" for a route that works.
    //
    // So: one retry, and only for a genuinely empty body. A real error still
    // throws out of `call`, and a route that is simply hard still fails — this
    // buys a second roll of the dice on an outcome that carries no information,
    // at the cost of one extra request on the rare occasions it happens.
    let r1 = await call(buildResearchPrompt(from, to), { temperature: 0 }, [
      { urlContext: {} },
      { googleSearch: {} },
    ]);
    if (!textOf(r1)) {
      console.warn(`empty research response for ${from.slug}->${to.slug}, retrying once`);
      r1 = await call(buildResearchPrompt(from, to), { temperature: 0 }, [
        { urlContext: {} },
        { googleSearch: {} },
      ]);
    }
    const research = textOf(r1);
    if (!research) return { data: null, error: 'empty research response from vertex (twice)' };

    // Taken from the API's own accounting of what it fetched, never from the
    // model's prose about which ministries it consulted.
    const cand = r1?.candidates?.[0];
    const retrieved: string[] = (cand?.urlContextMetadata?.urlMetadata ?? [])
      .filter((m: any) => String(m?.urlRetrievalStatus ?? '').includes('SUCCESS'))
      .map((m: any) => m.retrievedUrl)
      .filter(Boolean);
    const searched: string[] = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c: any) => c?.web?.title)
      .filter(Boolean);
    const evidence = buildEvidence(retrieved, searched);

    // PASS 2 — structure. Tools off, schema on. Input is pass 1's prose plus the
    // URLs the API confirmed were fetched: the prose alone frequently names
    // sites without their addresses, and then there is nothing legitimate for
    // this pass to cite. See buildStructurePrompt for the full account.
    const r2 = await call(buildStructurePrompt(from, to, research, retrieved), {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    });
    const text: string | undefined = r2?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { data: null, error: 'empty structuring response from vertex', evidence, research };

    const parsed = JSON.parse(text) as CorridorData;
    // No pre-check on officialSource here — see the note in gemini.ts. The
    // model returns "" when the notes gave it no page it is willing to cite,
    // and sanitizeCorridorLinks below is what repairs that (curated portal, or
    // the first source that verifies). Judging before the repair rejected live
    // routes that had a perfectly good source sitting in `sources`.
    //
    // Model-written URLs rot; verify and repair them before the page is saved.
    const { data: clean, report } = await sanitizeCorridorLinks(parsed, to.slug);
    if (report.rewritten || report.dropped) {
      console.log(`links ${from.slug}->${to.slug}: ${report.rewritten} fixed, ${report.dropped} dropped`);
    }
    if (!clean.officialSource?.url) return { data: null, error: 'no working official source', evidence, research };
    (clean as any).evidence = evidence;
    return { data: clean, evidence, research };
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 300);
    console.error('Vertex generation failed:', msg);
    return { data: null, error: msg };
  }
}
