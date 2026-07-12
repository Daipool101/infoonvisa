import type { APIRoute } from 'astro';
import { getEnv, listVerifiedCorridors } from '../lib/supabase';
import { countryByIso } from '../lib/countries';

export const prerender = false;

// Dynamic sitemap of VERIFIED corridor pages + the /from/[country] hub pages
// and /countries index. Astro's static sitemap can't see these (SSR, generated
// on demand), so we expose them here for Google. Pending pages are excluded.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.origin ?? 'https://infoonvisa.com').replace(/\/$/, '');
  const rows = await listVerifiedCorridors(getEnv());

  const corridorUrls = rows.map((r) => {
    const lastmod = r.generated_at ? new Date(r.generated_at).toISOString() : undefined;
    return `  <url><loc>${origin}/${r.slug}</loc>${
      lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
    }<changefreq>monthly</changefreq></url>`;
  });

  // One hub per origin country that has at least one verified corridor.
  const originSlugs = [...new Set(rows.map((r) => countryByIso(r.from_country)?.slug).filter(Boolean))] as string[];
  const hubUrls = originSlugs.map(
    (slug) => `  <url><loc>${origin}/from/${slug}</loc><changefreq>weekly</changefreq></url>`
  );

  const urls = [
    `  <url><loc>${origin}/countries</loc><changefreq>weekly</changefreq></url>`,
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
