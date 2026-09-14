import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/supabase';
import { getAdminUser, notFound } from '../../../lib/admin-auth';
import { adminClient } from '../../../lib/admin-data';

export const prerender = false;

const ALLOWED = new Set(['verified', 'pending_review', 'low_quality']);

/**
 * Publish, reject, or return a corridor to the review queue.
 *
 * Auth is re-checked here, not inherited from the page that called it. A page
 * guard only controls what is rendered; an endpoint that trusts it would accept
 * a request sent directly.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const user = await getAdminUser(env, request);
  if (!user) return notFound();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  let slug = '', status = '';
  try {
    const body = (await request.json()) as { slug?: string; status?: string };
    slug = body.slug ?? '';
    status = body.status ?? '';
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }
  if (!slug || !ALLOWED.has(status)) return json({ ok: false, error: 'bad request' }, 400);

  const db = adminClient(env);
  if (!db) return json({ ok: false, error: 'database unavailable' }, 503);

  const { data: row, error: readErr } = await db
    .from('corridors').select('id,data').eq('slug', slug).maybeSingle();
  if (readErr || !row) return json({ ok: false, error: 'not found' }, 404);

  // Who approved what, and when. Until there is a proper history table this
  // lives on the row itself — a publish decision with no name against it is
  // exactly the provenance an information site should be able to show.
  const data = {
    ...(row.data as object),
    reviewedOn: new Date().toISOString(),
    reviewedBy: user.email,
    reviewDecision: status,
  };

  const { error } = await db.from('corridors').update({ status, data }).eq('id', row.id);
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, slug, status });
};
