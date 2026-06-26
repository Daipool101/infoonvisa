// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://infoonvisa.com',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    sitemap({
      filter: (page) =>
        // Keep low-value / legal pages out of the sitemap.
        !page.includes('/terms') && !page.includes('/privacy'),
    }),
  ],
});
