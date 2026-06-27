import type { APIRoute } from 'astro';
import { parseCorridorSlug } from '../../lib/corridor';
import { getEnv, getCorridor, saveCorridor } from '../../lib/supabase';
import { generateCorridor } from '../../lib/gemini';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

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

  const result = await generateCorridor(env, parsed.from, parsed.to);
  if (!result.data) {
    return json({ ok: false, error: 'generation_failed', reason: result.error }, 502);
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
