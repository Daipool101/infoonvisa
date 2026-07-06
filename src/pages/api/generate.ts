import type { APIRoute } from 'astro';
import { parseCorridorSlug } from '../../lib/corridor';
import { getEnv, getCorridor, saveCorridor } from '../../lib/supabase';
import { generateCorridor } from '../../lib/gemini';
import { generateCorridorVertex } from '../../lib/vertex';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // Same-origin guard: only accept generation requests that originate from our
  // own pages (blocks trivial cross-site / scripted enumeration of the paid
  // Gemini endpoint). A Cloudflare Rate-Limiting rule on /api/generate should
  // be added as well for defence-in-depth.
  const self = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer') || '';
  const sameOrigin = origin === self || referer.startsWith(self + '/');
  if (!sameOrigin) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  let slug = '';
  try {
    const body = (await request.json()) as { slug?: string };
    slug = body.slug ?? '';
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const parsed = parseCorridorSlug(slug);
  if (!parsed) return json({ ok: false, error: 'unknown_route' }, 404);

  const env = getEnv();

  // Already cached (another visitor may have generated it) → done.
  const existing = await getCorridor(env, parsed.slug);
  if (existing) return json({ ok: true, cached: true });

  // Prefer Vertex AI when configured (works from Cloudflare's edge);
  // otherwise fall back to the AI Studio API.
  const useVertex = !!env.GCP_SA_KEY && !!env.GCP_PROJECT_ID;
  const result = useVertex
    ? await generateCorridorVertex(env, parsed.from, parsed.to)
    : await generateCorridor(env, parsed.from, parsed.to);
  if (!result.data) {
    // Log detail server-side only; don't leak backend error text to clients.
    console.error('generation_failed for', parsed.slug, '-', result.error);
    return json({ ok: false, error: 'generation_failed' }, 502);
  }

  const saved = await saveCorridor(env, {
    id: parsed.id,
    from_country: parsed.from.iso,
    to_country: parsed.to.iso,
    slug: parsed.slug,
    data: result.data,
  });
  if (!saved) return json({ ok: false, error: 'save_failed' }, 500);

  return json({ ok: true });
};
