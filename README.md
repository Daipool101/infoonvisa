# InfoOnVisa

Search-first visa corridor guides. A traveler enters **From → To** and gets one clean, verified, dated page: visa verdict, documents, how to apply, trip essentials, things to know, and FAQ.

See [BUILD_PLAN.md](./BUILD_PLAN.md) for the full product spec and architecture.

## Stack
- **Astro** (SSR) on **Cloudflare Pages + Workers**
- **Supabase** (Postgres) — corridor cache + manual verification console
- **Google Gemini** — on-demand, source-grounded content generation
- **Google AdSense** (now) + affiliates (later) for monetization

## Quick start

```bash
npm install
cp .env.example .env   # fill in values (optional for a first look)
npm run dev            # http://localhost:4321
```

Without any env vars, the site still runs: the home page works and `/india-to-japan`
renders from a local seed (`src/lib/seed.ts`) so you can preview the corridor page.

## Wiring up the backend

1. **Supabase**: create a project, run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
   Put the project URL + anon key + service-role key in `.env`.
2. **Gemini**: create a Google AI Studio key, set `GEMINI_API_KEY`.
3. Restart `npm run dev`. Now searching a new route triggers generation → save → render.

## How generation works
- Visit `/india-to-japan`. If the corridor isn't cached, the loading screen shows
  travel tips and calls `POST /api/generate`, which asks Gemini for source-grounded,
  schema-validated content, saves it to Supabase as `pending_review`, then reloads.
- New pages are `noindex` until you flip `status` to `verified` in Supabase
  (the curate-first strategy from the build plan).

## Deploy (Cloudflare Workers)

The `@astrojs/cloudflare` adapter builds a Worker and generates `dist/server/wrangler.json`
(merging `wrangler.jsonc` at the repo root, which sets `nodejs_compat`).

```bash
npx wrangler login      # one-time browser auth
npm run deploy          # astro build && wrangler deploy --config dist/server/wrangler.json
```

Or connect the GitHub repo in the Cloudflare dashboard (Workers & Pages → Import repository)
for push-to-deploy, with:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`

Set the 5 env vars (see `.env.example`) as **encrypted Secrets** on the Worker — especially
`SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`.

## Project layout
```
src/
  components/   Nav, Footer, SearchBar, AdSlot, DisclaimerModal,
                CorridorContent (blocks A–G), LoadingScreen
  layouts/      Base.astro (head, SEO, JSON-LD, AdSense, disclaimer)
  lib/          countries, corridor (types + slug), gemini, supabase, tips, seed
  pages/        index, [corridor], about, terms, privacy, 404,
                blog/, api/generate
  content/blog/ Markdown articles
supabase/       schema.sql
```
