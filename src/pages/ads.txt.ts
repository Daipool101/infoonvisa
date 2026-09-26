import type { APIRoute } from 'astro';
import { ADSENSE_PUB_ID } from '../lib/adsense';

// Prerendered, so /ads.txt is a plain static file at the edge with no Worker
// invocation — the same shape Google expects and the same cost as the file it
// replaces.
export const prerender = true;

/**
 * /ads.txt — Authorized Digital Sellers (IAB Tech Lab).
 *
 * Generated rather than kept as a static file in public/, so the publisher ID
 * has exactly one source (src/lib/adsense.ts). The previous arrangement had it
 * written out in three places — public/ads.txt, a GitHub Actions env var and
 * the Cloudflare secret — and they were already inconsistent: the build-time
 * value never reached the prerendered blog, so ads.txt authorised sellers for
 * pages that carried no ad code at all.
 *
 * The trailing f08c47fec0942fa0 is Google's own TAG certification ID. It is
 * identical for every AdSense publisher and is not account-specific.
 */
export const GET: APIRoute = () =>
  new Response(
    `# ads.txt — Authorized Digital Sellers (IAB Tech Lab)
#
# Public by design: this file exists so ad buyers can confirm who is allowed
# to sell this site's inventory, and a publisher ID is not a secret.
#
# Generated from src/lib/adsense.ts — do not edit by hand.
google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0
`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } }
  );
