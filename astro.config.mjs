// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// Publish date per blog slug, read straight from the markdown frontmatter so the
// sitemap's lastmod is the post's own date rather than the build time. Drafts
// are skipped — they are noindex and hidden from the blog list.
const POST_DATES = Object.fromEntries(
  readdirSync('./src/content/blog')
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const src = readFileSync(`./src/content/blog/${f}`, 'utf8');
      if (/^draft:\s*true\s*$/m.test(src)) return null;
      const date = src.match(/^pubDate:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
      if (!date) return null;
      const d = new Date(date);
      return Number.isNaN(d.getTime()) ? null : [f.replace(/\.md$/, ''), d.toISOString()];
    })
    .filter(Boolean)
);

// https://astro.build/config
export default defineConfig({
  site: 'https://infoonvisa.com',
  output: 'server',
  // NOTE: deliberately NOT `trailingSlash: 'never'` — that makes Astro reject
  // /countries/ with a 404 before middleware runs, and Google already has those
  // URLs indexed. The middleware 301s them instead, which preserves their value.
  //
  // Prerendered pages are emitted as /blog/post.html rather than
  // /blog/post/index.html. As folders they were served with a 307 that ADDED a
  // trailing slash, which fought the middleware's 301 that removes one — an
  // endless redirect loop for anyone whose browser cached the 301.
  build: { format: 'file' },
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
        // Attach each post's real publish date. Without lastmod a crawler has
        // nothing to tell a new post from one it fetched months ago.
        const slug = u.pathname.startsWith('/blog/') ? u.pathname.slice('/blog/'.length) : null;
        const lastmod = slug ? POST_DATES[slug] : undefined;
        return { ...item, url: u.toString(), ...(lastmod ? { lastmod } : {}) };
      },
    }),
  ],
});
