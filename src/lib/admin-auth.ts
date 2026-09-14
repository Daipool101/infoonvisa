// Who is allowed into /admin.
//
// The dashboard can change what every visa page claims, so it is gated on
// Cloudflare Access rather than on anything we invented. Access authenticates
// the visitor at the edge and passes a signed JWT in `Cf-Access-Jwt-Assertion`.
//
// We verify that JWT rather than merely checking the header exists. Presence
// alone is not proof: it is a request header, and anything that reaches the
// Worker by another route could set it. Verifying the signature against
// Cloudflare's published keys, plus the audience and expiry, is what makes it
// an authorisation check instead of a suggestion.
//
// SAFE DEFAULT: with no configuration the admin does not exist. If either env
// var is missing every /admin route returns 404 — so a half-finished setup, or
// a deploy that loses its variables (as happened on 14 Sep 2026), locks the
// dashboard rather than opening it.
import type { AppEnv } from './supabase';

export interface AdminUser {
  email: string;
}

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

/** Cloudflare rotates signing keys; cache briefly rather than per request. */
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

async function getKeys(teamDomain: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`could not fetch Access keys (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const b64urlToJson = <T,>(s: string): T =>
  JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T;

/**
 * Returns the signed-in admin, or null.
 *
 * Every failure path returns null and is treated by the caller as "not found".
 * An admin surface should never explain to an anonymous visitor *why* it said
 * no, or even that it is there.
 */
export async function getAdminUser(env: AppEnv, request: Request): Promise<AdminUser | null> {
  // Local development only. Two independent gates, because a bypass that ships
  // is worse than no dashboard at all:
  //   1. import.meta.env.DEV is replaced with `false` at build time, so in a
  //      production bundle this branch is dead code and is stripped entirely.
  //   2. It still needs ADMIN_DEV_BYPASS=1 to be set deliberately, so simply
  //      running `astro dev` does not silently open the door.
  if (import.meta.env.DEV && env.ADMIN_DEV_BYPASS === '1') {
    console.warn('[admin] DEV BYPASS ACTIVE — auth skipped. Never set ADMIN_DEV_BYPASS outside local dev.');
    return { email: 'dev@localhost' };
  }

  const teamDomain = env.ADMIN_ACCESS_TEAM_DOMAIN;
  const audience = env.ADMIN_ACCESS_AUD;
  if (!teamDomain || !audience) return null; // not configured = no admin

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    // Access also sets a cookie; the header is what it guarantees, the cookie
    // is a fallback for requests that arrive without it.
    (request.headers.get('cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = b64urlToJson<{ kid?: string; alg?: string }>(parts[0]);
    if (header.alg !== 'RS256' || !header.kid) return null;

    const jwk = (await getKeys(teamDomain)).find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!ok) return null;

    const claims = b64urlToJson<{ aud?: string | string[]; exp?: number; iss?: string; email?: string }>(parts[1]);

    // Audience ties the token to THIS application. Without it, a valid token
    // for any other app on the same Access team would open this dashboard.
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience)) return null;

    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    if (claims.iss && !claims.iss.includes(teamDomain)) return null;
    if (!claims.email) return null;

    return { email: claims.email };
  } catch {
    return null;
  }
}

/** 404, deliberately — an unauthenticated visitor learns nothing. */
export const notFound = () => new Response('Not found', { status: 404 });
