import type { APIRoute } from 'astro';
import { getEnv, listVerifiedCorridors } from '../lib/supabase';
import { countryByIso } from '../lib/countries';

export const prerender = false;

// Dynamic sitemap of VERIFIED corridor pages + the /from/[country] hub pages
// and /countries index. Astro's static sitemap can't see these (SSR, generated
// on demand), so we expose them here for Google. Pending pages are excluded.
// Date of the last change to what a corridor page actually SHOWS — as opposed
// to when its guide text was generated. `generated_at` alone left every page
// claiming 12 July while the visible content changed in August (rewritten
// titles, the cost section, two extra FAQ answers), so Google saw no reason to
// recrawl and the improvements went unnoticed.
//
// BUMP THIS ONLY when the template changes what readers see. Moving it for a
// styling tweak trains search engines to distrust our lastmod entirely.
const TEMPLATE_UPDATED_AT = '2026-08-19T00:00:00.000Z';

/** The later of the content date and the template date. */
function lastModified(contentDate?: string): string {
  const a = contentDate ? new Date(contentDate).getTime() : 0;
  const b = new Date(TEMPLATE_UPDATED_AT).getTime();
  return new Date(Math.max(a, b)).toISOString();
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.origin ?? 'https://infoonvisa.com').replace(/\/$/, '');
  const rows = await listVerifiedCorridors(getEnv());

  const corridorUrls = rows.map(
    (r) =>
      `  <url><loc>${origin}/${r.slug}</loc><lastmod>${lastModified(r.generated_at)}</lastmod><changefreq>monthly</changefreq></url>`
  );

  // One hub per origin country that has at least one verified corridor. A hub
  // lists its corridors, so it is as fresh as the newest one it links to.
  const newestByOrigin = new Map<string, string>();
  for (const r of rows) {
    const slug = countryByIso(r.from_country)?.slug;
    if (!slug) continue;
    const prev = newestByOrigin.get(slug);
    if (!prev || new Date(r.generated_at) > new Date(prev)) newestByOrigin.set(slug, r.generated_at);
  }
  const hubUrls = [...newestByOrigin].map(
    ([slug, date]) =>
      `  <url><loc>${origin}/from/${slug}</loc><lastmod>${lastModified(date)}</lastmod><changefreq>weekly</changefreq></url>`
  );

  const newestOverall = rows.reduce(
    (max, r) => (new Date(r.generated_at) > new Date(max) ? r.generated_at : max),
    rows[0]?.generated_at ?? TEMPLATE_UPDATED_AT
  );

  const urls = [
    `  <url><loc>${origin}/countries</loc><lastmod>${lastModified(newestOverall)}</lastmod><changefreq>weekly</changefreq></url>`,
    ...hubUrls,
    ...corridorUrls,
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Let Cloudflare cache it briefly so crawler hits don't all touch the DB.
      'cache-control': 'public, max-age=3600',
    },
  });
};
