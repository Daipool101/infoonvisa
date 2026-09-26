/**
 * The AdSense publisher ID, in one place.
 *
 * It has to appear in two very different outputs — the `<script>` tag in every
 * page's <head>, and the plain-text /ads.txt that ad buyers read — and those
 * two were drifting apart before this file existed. /ads.txt was a static file
 * in public/, the script tag came from an environment variable, and the
 * variable did not reach the prerendered blog, so seventeen posts served no
 * ad code while ads.txt cheerfully authorised sellers for them.
 *
 * A publisher ID is public by definition: /ads.txt exists precisely so that
 * anyone can read it and confirm who may sell this site's inventory. So there
 * is nothing to protect by keeping it out of the source, and a literal here is
 * strictly more reliable than an environment variable that has to survive
 * GitHub Actions, Vite's env inlining and the Cloudflare adapter to arrive.
 *
 * A Cloudflare runtime secret of the same name still overrides this (see
 * getEnv), so the value can be changed without a deploy if it ever has to be.
 */
export const ADSENSE_CLIENT = 'ca-pub-5462566343196770';

/** The publisher ID as ads.txt wants it — no `ca-` prefix. */
export const ADSENSE_PUB_ID = ADSENSE_CLIENT.replace(/^ca-/, '');
