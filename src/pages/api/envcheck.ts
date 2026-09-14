import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

// TEMPORARY DIAGNOSTIC — delete once the Supabase credentials are confirmed.
//
// Every corridor page has been serving the loading screen because the Worker
// cannot build a Supabase client, which happens only when PUBLIC_SUPABASE_URL
// or the key is missing. The Cloudflare dashboard truncates long variable
// names in its input boxes and shows every encrypted value as "Value
// encrypted", so from the outside a correctly named secret and a misspelled one
// look identical. This reports which names the Worker can actually see.
//
// It returns NAMES and booleans only — never a value. The one exception is the
// Supabase URL, which is not a secret (it is the public project endpoint) and
// is the fastest way to confirm the right project is wired up.
const TOKEN = 'iov-envcheck-7f3a91';

const EXPECTED = [
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
];

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.get('token') !== TOKEN) {
    return new Response('not found', { status: 404 });
  }

  const read = (k: string): unknown => {
    try {
      return (cfEnv as Record<string, unknown> | undefined)?.[k];
    } catch {
      return undefined;
    }
  };

  // What the app looks for, and whether it is there.
  const expected: Record<string, { present: boolean; length: number }> = {};
  for (const k of EXPECTED) {
    const v = read(k);
    expected[k] = { present: typeof v === 'string' && v.length > 0, length: typeof v === 'string' ? v.length : 0 };
  }

  // Every name the Worker can see. A misspelling shows up here immediately as a
  // name that is close to, but not equal to, one of the expected ones.
  let visibleNames: string[] = [];
  try {
    visibleNames = Object.keys(cfEnv as object).sort();
  } catch {
    visibleNames = ['<could not enumerate>'];
  }

  const supabaseUrl = read('PUBLIC_SUPABASE_URL');

  return new Response(
    JSON.stringify(
      {
        note: 'Temporary diagnostic. Names and booleans only — no secret values.',
        expected,
        visibleNames,
        supabaseUrlSeenByWorker: typeof supabaseUrl === 'string' ? supabaseUrl : null,
      },
      null,
      2
    ),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};
