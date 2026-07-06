import type { AppEnv, } from './supabase';
import type { CorridorData } from './corridor';
import type { Country } from './countries';
import { buildPrompt, RESPONSE_SCHEMA, type GenerationResult } from './gemini';

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

    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(from, to) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    });
    if (!res.ok) {
      return { data: null, error: `vertex ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json: any = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { data: null, error: 'empty response from vertex' };
    const parsed = JSON.parse(text) as CorridorData;
    if (!parsed.sources?.length || !parsed.officialSource?.url) {
      return { data: null, error: 'no official source in response' };
    }
    return { data: parsed };
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 300);
    console.error('Vertex generation failed:', msg);
    return { data: null, error: msg };
  }
}
