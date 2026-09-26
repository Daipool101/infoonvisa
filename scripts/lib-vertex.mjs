// Calling Vertex AI from a script, with the same service account the site uses.
//
// This exists because of a wall the free Gemini API key hits almost at once:
//
//   quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
//   quotaValue: 20
//
// Twenty requests PER DAY. Auditing 128 pages against that would take a week
// and the failures arrive as a 429 in the middle of a run, so half a batch
// silently reports nothing.
//
// Vertex is the right path anyway: it is what the deployed site already uses
// (the AI Studio key is caller-location restricted and does not work from
// Cloudflare's edge at all), it bills per use rather than capping per day, and
// the credentials are already configured. A script that researches differently
// from production is auditing the wrong thing.
//
// Auth is a service-account JWT exchanged for an OAuth token, mirroring
// src/lib/vertex.ts. Node 22 has Web Crypto on globalThis, so the signing code
// is the same in both places.
import { readFileSync } from 'node:fs';

export function loadEnv(url) {
  const env = {};
  for (const l of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const b64urlStr = (s) => Buffer.from(s, 'utf8').toString('base64url');

function parseSaKey(raw) {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

function pemToDer(pem) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(Buffer.from(body, 'base64'));
}

let cached = null;

export async function getAccessToken(env) {
  const sa = parseSaKey(env.GCP_SA_KEY);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const signingInput =
    `${b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.` +
    `${b64urlStr(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri, iat: now, exp: now + 3600,
    }))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  cached = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return json.access_token;
}

/**
 * One grounded generateContent call, with retry on the errors that are worth
 * retrying and none of the ones that are not.
 *
 * A 429 here means "slow down", not "stop" — the API even tells you for how
 * long. The earlier version of the audit treated it as a failed route and
 * moved on, so a rate limit read as "we checked this page and learned
 * nothing". That is the same shape of bug as the link checker that could not
 * tell a broken script from a healthy week: a failure that looks like a result.
 */
export async function vertexGenerate(env, { prompt, tools, config = {}, attempts = 4 }) {
  const location = env.GCP_LOCATION || 'us-central1';
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${env.GCP_PROJECT_ID}/locations/${location}/publishers/google/models/${model}:generateContent`;

  let wait = 5000;
  for (let i = 1; i <= attempts; i++) {
    const token = await getAccessToken(env);
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(tools ? { tools } : {}),
        generationConfig: { temperature: 0, maxOutputTokens: 8192, ...config },
      }),
    });
    if (res.ok) return res.json();

    const body = (await res.text()).slice(0, 400);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || i === attempts) throw new Error(`vertex ${res.status}: ${body}`);
    // Honour the server's own retry hint when it gives one.
    const hint = Number(body.match(/retry in ([\d.]+)s/i)?.[1]);
    const delay = Number.isFinite(hint) ? Math.ceil(hint * 1000) + 1000 : wait;
    process.stdout.write(`[${res.status}, waiting ${Math.round(delay / 1000)}s] `);
    await new Promise((r) => setTimeout(r, delay));
    wait = Math.min(wait * 2, 60000);
  }
  throw new Error('unreachable');
}

export const textOf = (json) =>
  (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text).filter(Boolean).join('\n');

export const retrievedUrls = (json) =>
  (json?.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [])
    .filter((m) => String(m?.urlRetrievalStatus ?? '').includes('SUCCESS'))
    .map((m) => m.retrievedUrl)
    .filter(Boolean);

export const searchTitles = (json) =>
  (json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c?.web?.title)
    .filter(Boolean);
