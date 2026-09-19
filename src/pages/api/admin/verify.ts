import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/supabase';
import { getAdminUser, notFound } from '../../../lib/admin-auth';
import { adminClient } from '../../../lib/admin-data';
import { checkSourceUrl, EditError } from '../../../lib/admin-edit';

export const prerender = false;

/**
 * Record that a human checked a verdict — or tried and could not.
 *
 * This is the endpoint behind the rule the whole project runs on: a verdict is
 * either confirmed against an official page someone read, or it is openly
 * marked unverified. There is no third state, and no way to record a check
 * without saying what was read, which is why `note` is required on both paths
 * and `source` is required on the confirming one.
 *
 * It mirrors scripts/audit-record.mjs exactly, so the two cannot drift: marking
 * verified clears any previous "tried and failed" flag, and flagging clears any
 * previous confirmation.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const user = await getAdminUser(env, request);
  if (!user) return notFound();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  let slug = '', outcome = '', source = '', note = '';
  try {
    const b = (await request.json()) as Record<string, string>;
    slug = b.slug ?? ''; outcome = b.outcome ?? ''; source = (b.source ?? '').trim(); note = (b.note ?? '').trim();
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  if (!slug || !note) return json({ ok: false, error: 'a note describing what you read is required' }, 400);
  if (outcome !== 'verified' && outcome !== 'flagged') return json({ ok: false, error: 'bad outcome' }, 400);

  if (outcome === 'verified') {
    // Same test the editor applies to a fee's source, from one place: what
    // counts as a source must not depend on which form you happened to use.
    try {
      checkSourceUrl(source, 'The source');
    } catch (e) {
      if (e instanceof EditError) return json({ ok: false, error: e.message }, 400);
      throw e;
    }
  }

  const db = adminClient(env);
  if (!db) return json({ ok: false, error: 'database unavailable' }, 503);

  const { data: row, error: readErr } = await db
    .from('corridors').select('id,data').eq('slug', slug).maybeSingle();
  if (readErr || !row) return json({ ok: false, error: 'not found' }, 404);

  const now = new Date().toISOString();
  const data: Record<string, unknown> = { ...(row.data as object) };

  if (outcome === 'verified') {
    data.verdictCheckedOn = now;
    data.verdictCheckedBy = user.email;
    data.verdictCheckSource = `${note} — ${source}`;
    delete data.verdictCheckAttempted;
    delete data.verdictCheckNote;
  } else {
    data.verdictCheckAttempted = now;
    data.verdictCheckNote = note;
    data.verdictCheckedBy = user.email;
    delete data.verdictCheckedOn;
    delete data.verdictCheckSource;
  }

  const { error } = await db.from('corridors').update({ data }).eq('id', row.id);
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, slug, outcome });
};
