import type { APIRoute } from 'astro';
import { getEnv, listVerifiedCorridors } from '../lib/supabase';

export const prerender = false;

// Dynamic sitemap of VERIFIED corridor pages. Astro's static sitemap can't see
// these (they're SSR, generated on demand), so we expose them here for Google.
// Pending/noindex corridors are intentionally excluded.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.origin ?? 'https://infoonvisa.com').replace(/\/$/, '');
  const rows = await listVerifiedCorridors(getEnv());

  const urls = rows
    .map((r) => {
      const lastmod = r.generated_at ? new Date(r.generated_at).toISOString() : undefined;
      return `  <url><loc>${origin}/${r.slug}</loc>${
        lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
      }<changefreq>monthly</changefreq></url>`;
    })
    .join('\n');

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
