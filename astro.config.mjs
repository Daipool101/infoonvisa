// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://infoonvisa.com',
  output: 'server',
  // NOTE: deliberately NOT `trailingSlash: 'never'` — that makes Astro reject
  // /countries/ with a 404 before middleware runs, and Google already has those
  // URLs indexed. The middleware 301s them instead, which preserves their value.
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    sitemap({
      filter: (page) =>
        // Keep low-value / legal pages out of the sitemap.
        !page.includes('/terms') && !page.includes('/privacy'),
      // Submit one URL form only. Internal links and sitemap-corridors.xml use
      // no trailing slash, so strip it here too — otherwise we hand Google
      // /countries/ and /countries as two competing copies of one page.
      serialize: (item) => {
        const u = new URL(item.url);
        if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
        return { ...item, url: u.toString() };
      },
    }),
  ],
});
