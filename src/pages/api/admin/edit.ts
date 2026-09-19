import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/supabase';
import { getAdminUser, notFound } from '../../../lib/admin-auth';
import { adminClient } from '../../../lib/admin-data';
import {
  applyEdits,
  mirroredColumns,
  undoableIds,
  EditError,
  FIELD_ORDER,
  type ChangeEntry,
  type CorridorRecord,
  type FieldKey,
} from '../../../lib/admin-edit';
import { pingIndexNow, pageUrl } from '../../../lib/indexnow';

export const prerender = false;

/**
 * Change what a corridor page says — or put back what it said before.
 *
 * Two shapes of request, both landing in the same writer:
 *
 *   { slug, patch: { verdict: 'evisa', fees: [...] } }   edit
 *   { slug, undo: '<change id>' }                        revert one change
 *
 * An undo is not a rewrite of history: it reads the recorded `before` value,
 * puts it back as a new change, and marks it as reverting the old one. The log
 * therefore always tells the truth about what happened, including the mistake.
 *
 * Undo is offered only on the newest change to a field. Reverting an older one
 * would silently discard everything done to that field since, which is the kind
 * of surprise an undo button must never spring.
 *
 * Auth is re-checked here rather than inherited from the page that called it:
 * a page guard governs what is rendered, and an endpoint that trusts it would
 * accept a request sent straight to the URL.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const user = await getAdminUser(env, request);
  if (!user) return notFound();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  let slug = '';
  let patch: Partial<Record<FieldKey, unknown>> = {};
  let undo = '';
  try {
    const b = (await request.json()) as { slug?: string; patch?: Record<string, unknown>; undo?: string };
    slug = (b.slug ?? '').trim();
    undo = (b.undo ?? '').trim();
    // Only known fields get through. An unexpected key is a bug or an attack,
    // and either way must not reach the row.
    for (const k of FIELD_ORDER) {
      if (b.patch && k in b.patch) patch[k] = b.patch[k];
    }
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }
  if (!slug) return json({ ok: false, error: 'Bad request.' }, 400);
  if (!undo && !Object.keys(patch).length) return json({ ok: false, error: 'Nothing to change.' }, 400);

  const db = adminClient(env);
  if (!db) return json({ ok: false, error: 'Database unavailable.' }, 503);

  const { data: row, error: readErr } = await db
    .from('corridors')
    .select('id,slug,status,data')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr || !row) return json({ ok: false, error: 'Not found.' }, 404);

  const current = (row.data ?? {}) as CorridorRecord;
  let undoOf: string | undefined;

  if (undo) {
    const log = (Array.isArray(current.changeLog) ? current.changeLog : []) as ChangeEntry[];
    const entry = log.find((e) => e.id === undo);
    if (!entry) return json({ ok: false, error: 'That change is no longer in the history.' }, 404);
    if (!undoableIds(log).has(entry.id)) {
      return json(
        {
          ok: false,
          error: `"${entry.field}" has been changed again since. Undo only reaches the most recent change to a field.`,
        },
        409
      );
    }
    patch = { [entry.field]: entry.before };
    undoOf = entry.id;
  }

  let result: ReturnType<typeof applyEdits>;
  try {
    result = applyEdits(current, patch, user.email, undoOf);
  } catch (e) {
    if (e instanceof EditError) return json({ ok: false, error: e.message }, 400);
    throw e;
  }

  if (!result.changes.length) {
    return json({ ok: true, slug, changed: [], message: 'Nothing was different — nothing saved.' });
  }

  const { error } = await db
    .from('corridors')
    .update({ ...mirroredColumns(result.data), data: result.data })
    .eq('id', row.id);
  if (error) return json({ ok: false, error: error.message }, 500);

  // Pages render from the database on every request, so the edit is already
  // live. Telling the search engines is the only step left, and only worth
  // doing for a page they are allowed to index in the first place.
  let ping: { status: number; accepted: boolean } | null = null;
  if (row.status === 'verified') {
    const p = await pingIndexNow([pageUrl(slug)]);
    ping = { status: p.status, accepted: p.accepted };
  }

  return json({
    ok: true,
    slug,
    changed: result.changes.map((c) => c.field),
    undo: !!undoOf,
    ping,
  });
};
