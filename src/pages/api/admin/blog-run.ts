import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/supabase';
import { getAdminUser, notFound } from '../../../lib/admin-auth';

export const prerender = false;

const REPO = 'Daipool101/infoonvisa';
const WORKFLOW = 'blog-research.yml';

/**
 * Start the weekly blog research from the dashboard.
 *
 * This only pulls a lever. The work happens in GitHub Actions, because a
 * fifteen-minute research job cannot run inside a Cloudflare Worker: Workers
 * enforce CPU and subrequest limits, and the job would be cut off partway
 * through while appearing to have simply stopped.
 *
 * So the endpoint fires `workflow_dispatch` and returns immediately. Progress
 * is read from the blog_runs table, which the job writes as it goes — the run
 * row is opened before any work starts, so even a run that dies leaves a trace.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const user = await getAdminUser(env, request);
  if (!user) return notFound();

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const token = (env as Record<string, string>).GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return json({
      ok: false,
      error:
        'GITHUB_DISPATCH_TOKEN is not set. Add it in Cloudflare → Workers → infoonvisa → ' +
        'Settings → Runtime variables and secrets, as a SECRET (a plain Variable is erased ' +
        'by the next deploy). It needs a fine-grained token with Actions: write on this repo.',
    }, 503);
  }

  let dryRun = false;
  try {
    dryRun = !!((await request.json()) as { dryRun?: boolean }).dryRun;
  } catch { /* no body is fine — default to a real run */ }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'infoonvisa-admin',
      },
      body: JSON.stringify({ ref: 'main', inputs: { dry_run: dryRun } }),
    }
  );

  // 204 is the documented success for this endpoint: accepted, nothing to say.
  if (res.status === 204) {
    return json({ ok: true, dryRun, actions: `https://github.com/${REPO}/actions/workflows/${WORKFLOW}` });
  }

  const body = (await res.text()).slice(0, 300);
  const hint =
    res.status === 401 || res.status === 403
      ? ' The token is rejected — check it has not expired and has Actions: write on this repository.'
      : res.status === 404
        ? ' Either the workflow file is not on main yet, or the token cannot see this repository.'
        : '';
  return json({ ok: false, error: `GitHub returned ${res.status}.${hint} ${body}` }, 502);
};
