import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { getEnv } from '../../lib/supabase';

export const prerender = false;

// TEMPORARY DIAGNOSTIC — delete once /admin/review works.
//
// /admin renders but /admin/review and /admin/c/<slug> return the auth guard's
// 404, so the token is reaching one route and not the others. The dashboard
// cannot tell us why: every failure path deliberately returns the same bare
// "Not found", which is right for a stranger and useless for debugging.
//
// This reports which inputs arrived and which verification step failed. It
// prints no token, no key and no secret — only whether each thing was present
// and how long it was. It sits behind the same Cloudflare Access application as
// the rest of /admin, so only a signed-in visitor can reach it at all.
export const GET: APIRoute = async ({ request, url }) => {
  const env = getEnv();
  const out: Record<string, unknown> = { path: url.pathname };

  // 1. Is the admin even configured?
  out.config = {
    teamDomainSet: !!env.ADMIN_ACCESS_TEAM_DOMAIN,
    teamDomain: env.ADMIN_ACCESS_TEAM_DOMAIN || null,
    audSet: !!env.ADMIN_ACCESS_AUD,
    audLength: (env.ADMIN_ACCESS_AUD || '').length,
  };

  // 2. What did Cloudflare Access actually send with THIS request?
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieMatch = cookieHeader.match(/CF_Authorization=([^;]+)/);
  out.inputs = {
    jwtHeaderPresent: !!header,
    jwtHeaderLength: header?.length ?? 0,
    cookiePresent: !!cookieMatch,
    cookieLength: cookieMatch?.[1]?.length ?? 0,
    // Names only — never values. Tells us if Access is proxying this route.
    cfHeadersSeen: [...request.headers.keys()].filter((h) => h.toLowerCase().startsWith('cf-')).sort(),
    cookieNames: cookieHeader.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean),
  };

  // 3. If a token arrived, how far does verification get?
  const token = header || cookieMatch?.[1];
  if (!token) {
    out.verification = 'no token arrived — nothing to verify';
    return json(out);
  }

  const steps: Record<string, unknown> = {};
  try {
    const parts = token.split('.');
    steps.parts = parts.length;
    if (parts.length !== 3) throw new Error('not a three-part JWT');

    const b64 = (s: string) => {
      const p = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
      const bin = atob(p);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    };
    const jsonPart = <T,>(s: string): T => JSON.parse(new TextDecoder().decode(b64(s))) as T;

    const head = jsonPart<{ kid?: string; alg?: string }>(parts[0]);
    steps.alg = head.alg;
    steps.kidPresent = !!head.kid;

    const certsUrl = `https://${env.ADMIN_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    const res = await fetch(certsUrl, { signal: AbortSignal.timeout(8000) });
    steps.certsFetch = res.status;
    const keys = ((await res.json()) as { keys?: { kid: string }[] }).keys ?? [];
    steps.keyCount = keys.length;
    steps.kidMatchesAKey = keys.some((k) => k.kid === head.kid);

    const claims = jsonPart<{ aud?: string | string[]; exp?: number; iss?: string; email?: string }>(parts[1]);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    steps.audInToken = aud.map((a) => (a ?? '').slice(0, 12) + '…');
    steps.audMatchesConfig = aud.includes(env.ADMIN_ACCESS_AUD);
    steps.expired = !claims.exp || claims.exp * 1000 < Date.now();
    steps.issuer = claims.iss ?? null;
    steps.issuerContainsTeamDomain = !!claims.iss?.includes(env.ADMIN_ACCESS_TEAM_DOMAIN);
    steps.emailPresent = !!claims.email;
  } catch (e) {
    steps.threw = String((e as Error).message);
  }
  out.verification = steps;

  return json(out);
};

const json = (o: unknown) =>
  new Response(JSON.stringify(o, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
