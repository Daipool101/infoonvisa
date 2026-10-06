import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/supabase';
import { getAdminUser, notFound } from '../../../lib/admin-auth';
import { adminClient } from '../../../lib/admin-data';

export const prerender = false;

/**
 * Manage the Google AI Studio key pool behind /admin/blog.
 *
 * Auth is re-checked here rather than inherited from the page that called it.
 * A page guard governs what is rendered; an endpoint that trusts it would
 * accept a request sent straight to the URL — and this endpoint accepts live
 * credentials, so that is not a theoretical concern.
 *
 * Keys go IN through here and never come back out: no route in this file
 * returns an api_key value. /admin/blog reads them through loadBlogAdmin,
 * which masks them before they reach the page.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const user = await getAdminUser(env, request);
  if (!user) return notFound();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  let action = '', id = 0, label = '', key = '';
  try {
    const b = (await request.json()) as Record<string, string | number>;
    action = String(b.action ?? '');
    id = Number(b.id ?? 0);
    label = String(b.label ?? '').trim();
    key = String(b.key ?? '').trim();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }

  const db = adminClient(env);
  if (!db) return json({ ok: false, error: 'Database unavailable.' }, 503);

  if (action === 'add') {
    if (!label) return json({ ok: false, error: 'Give the key a label, so you can tell your accounts apart.' }, 400);
    // Google issues AI Studio keys in two shapes: the long-standing "AIza..."
    // and a newer "AQ.Ab8..." form. The first version of this check accepted
    // only AIza and would have rejected the key already working in this
    // project — a validator that refuses a valid credential is worse than no
    // validator, because the person trying to use it has no way to tell it is
    // the form being rejected rather than the key.
    //
    // So this catches an obvious paste error (whitespace, a truncated copy,
    // someone pasting a URL) and nothing more. The run itself is the real test.
    if (key.length < 30 || /\s/.test(key) || /^https?:/i.test(key)) {
      return json({
        ok: false,
        error: 'That does not look like an API key. Copy the whole value from aistudio.google.com/apikey — it starts with "AIza" or "AQ." and has no spaces.',
      }, 400);
    }
    const { error } = await db.from('blog_api_keys').insert({ label, api_key: key });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }

  if (!id) return json({ ok: false, error: 'Bad request.' }, 400);

  if (action === 'enable' || action === 'disable') {
    const patch: Record<string, unknown> = { enabled: action === 'enable' };
    // Re-enabling clears the exhausted flag: the owner is saying this key is
    // usable again, and the pool should stop skipping it.
    if (action === 'enable') patch.exhausted_at = null;
    const { error } = await db.from('blog_api_keys').update(patch).eq('id', id);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === 'delete') {
    const { error } = await db.from('blog_api_keys').delete().eq('id', id);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
};
