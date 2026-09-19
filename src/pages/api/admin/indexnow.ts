import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/supabase';
import { getAdminUser, notFound } from '../../../lib/admin-auth';
import { pingIndexNow, pageUrl } from '../../../lib/indexnow';

export const prerender = false;

/**
 * Resubmit one page to the IndexNow search engines by hand.
 *
 * Edits ping automatically, so this is for the cases an edit does not cover:
 * a page that was just approved, or one where an earlier ping came back 202
 * and was quietly discarded. Sending the same URL again is harmless.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const user = await getAdminUser(env, request);
  if (!user) return notFound();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  let slug = '';
  try {
    slug = (((await request.json()) as { slug?: string }).slug ?? '').trim();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ ok: false, error: 'Bad request.' }, 400);

  const result = await pingIndexNow([pageUrl(slug)]);
  return json({ ok: result.accepted, ...result });
};
