# InfoOnVisa — Architecture

How the system is actually built, as of **14 September 2026**.

`BUILD_PLAN.md` is the original product spec written before any code existed. Where the two disagree, **this file describes reality**.

---

## 1. The shape of it in one paragraph

A reader lands on `infoonvisa.com/india-to-japan`. Astro runs **server-side on a Cloudflare Worker**, parses the slug into two countries, and looks the corridor up in **Supabase**. If a verified row exists it renders immediately. If no row exists, the page shows a loading screen and calls `POST /api/generate`, which asks **Vertex AI** to draft the corridor from grounded sources, saves it as `pending_review` (rendered but `noindex`), and shows it. A human later flips it to `verified`, at which point it becomes indexable. Everything factual on the page traces back to an official government link captured at generation time and re-checked weekly by a GitHub Action.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Astro 6**, `output: 'server'` | `.astro` components, scoped CSS, no UI framework |
| Hosting | **Cloudflare Workers** | via `@astrojs/cloudflare`. Not Pages — see §7 |
| Database | **Supabase** (Postgres) | one meaningful table, `corridors` |
| Generation (edge) | **Vertex AI** | service-account JWT signed in-worker |
| Generation (scripts) | **Gemini API** | AI Studio key, used by Node scripts |
| Blog | Markdown in `src/content/blog` | edited through Pages CMS (`.pages.yml`) |
| CI/CD | GitHub Actions | `deploy.yml`, `link-check.yml` |

No client-side framework, no state library, no CSS framework. Pages are HTML with small inline scripts.

---

## 3. Directory map

```
src/
  pages/
    index.astro              home — From/To search
    [corridor].astro         THE page. /india-to-japan etc. SSR.
    from/[country].astro     hub: all routes from one country
    countries.astro          country index
    blog/index.astro         blog list
    blog/[...slug].astro     blog post
    about | contact | privacy | terms | 404
    api/generate.ts          POST — on-demand corridor generation
    sitemap-corridors.xml.ts custom sitemap for corridor pages
  components/
    CorridorContent.astro    ~700 lines. The whole corridor page body.
    CountrySearch.astro      From/To picker (used on home + corridor pages)
    LoadingScreen.astro      shown while /api/generate runs
    Nav | BrandNav | Footer | BrandFooter | SearchBar | AdSlot | DisclaimerModal
  lib/
    corridor.ts              types + all page-text logic. Start here.
    countries.ts             198 countries: iso, name, slug, flag, demonym
    supabase.ts              env resolution + all DB reads/writes
    vertex.ts                Vertex AI call (edge, service-account JWT)
    gemini.ts                Gemini call + the generation prompt & schema
    links.ts                 official-source link verification
    seed.ts                  offline fallback corridor (india-to-japan)
    tips.ts                  generic travel tips
  layouts/Base.astro         <head>, meta, JSON-LD slot, nav, footer
  middleware.ts              redirects + security headers
  styles/                    global.css, brand.css
scripts/                     ~25 Node maintenance scripts (see §8)
supabase/schema.sql          the database schema
.github/workflows/           deploy.yml, link-check.yml
```

**If you only read one file, read `src/lib/corridor.ts`.** It holds the types, the verdict vocabulary, and every function that turns stored data into reader-facing words.

---

## 4. Data model

### `corridors` table

| Column | Type | Meaning |
|---|---|---|
| `id` | text PK | `'IN-JP'` — ISO pair |
| `from_country`, `to_country` | text | ISO alpha-2 |
| `slug` | text unique | `'india-to-japan'` — this is a live URL, never change one |
| `data` | jsonb | the whole page payload (see below) |
| `sources` | jsonb | source links |
| `verdict` | text | `visa_free` / `voa` / `evisa` / `eta` / `embassy` |
| `max_stay_days` | integer | |
| `status` | text | `verified` / `pending_review` / `low_quality` |
| `generated_at` | timestamptz | drives the "last verified" date shown to readers |
| `next_refresh_at` | timestamptz | staleness scheduling (`REFRESH_DAYS = 90`) |
| `search_count` | integer | demand signal, incremented per page view |

**Row Level Security:** the anon key can read **only** `status = 'verified'`. Everything else requires the service-role key, which is server-only. A `pending_review` page is rendered by the server (which uses the service role) but is `noindex`.

### The `data` JSONB payload

```jsonc
{
  "verdict": "embassy",            // ⚠️ see §6 — this is the one the page renders
  "verdictHeadline": "…",          // one-line answer, becomes the <h1>
  "summary": "…",
  "maxStayDays": 30,
  "processingTime": "…",
  "officialSource": { "label": "…", "url": "…" },
  "visaOptions": [                 // each becomes a tab + a table
    { "type": "…", "validity": "…", "maxStay": "…", "entries": "…", "eligibility": "…" }
  ],
  "fees": [                        // optional, added route by route
    { "appliesTo": "<visaOption.type>", "amount": "US$30", "note": "…",
      "refundable": false, "refundableNote": "…",
      "verifiedOn": "2026-09-14", "source": { "label": "…", "url": "…" } }
  ],
  "documents": [ { "label": "…", "note": "…" } ],
  "applySteps": [ { "text": "…", "link": {…} } ],
  "tips": ["…"], "bestTimeToVisit": "…", "topPlaces": ["…"],
  "faq": [ { "q": "…", "a": "…" } ],
  "rejectionReasons": [ { "reason": "…", "avoid": "…" } ],
  "sources": [ {…} ],

  // audit bookkeeping, written by scripts/audit-record.mjs
  "verdictCheckedOn": "2026-09-12T…",     // verified against an official source
  "verdictCheckSource": "…what was read…",
  "verdictCheckAttempted": "…",           // tried and failed → manual list
  "verdictCheckNote": "…why it failed…"
}
```

---

## 5. Request flow

### Corridor page (`src/pages/[corridor].astro`)

1. `parseCorridorSlug('india-to-japan')` → `{from, to}`, or `Astro.rewrite('/404')`.
2. `getCorridor(env, slug)` reads Supabase.
3. Title and description come from `corridorTitle()` / `corridorDescription()` — centralised so wording stays consistent and inside the length search engines display.
4. `bumpSearchCount()` fires (demand signal).
5. JSON-LD is assembled: `FAQPage` + breadcrumbs. **The schema FAQ list must mirror exactly what the page renders** — including the computed cost and city questions — or the structured data claims questions that aren't on the page.
6. `CorridorContent.astro` renders the body.
7. No row → `LoadingScreen` + `POST /api/generate`.

### Generation (`src/pages/api/generate.ts`)

- **Same-origin guard** — rejects requests whose `Origin`/`Referer` isn't us, so nobody can script the paid endpoint.
- Forced regeneration (`force: true`) is gated behind the `REGEN_KEY` header.
- Calls Vertex (edge) or Gemini (scripts), saves as `pending_review`.

---

## 6. Things that will bite you

These are all real failures that reached production.

### ⚠️ The verdict is stored twice

There is a **`verdict` column** and a **`verdict` key inside `data`**. **The pages render `data.verdict`.** It drives the badge, the at-a-glance row, the fee section and the generated city FAQ.

Setting only the column produces a page whose headline says one thing under a badge saying another. Always set both:

```js
await db.from('corridors').update({
  verdict: 'eta',                      // column
  data: { ...data, verdict: 'eta' },   // what actually renders
}).eq('id', id);
```

### ⚠️ A content change is never a one-field edit

These pages restate their answer in the summary, the FAQ, the documents list, the apply steps, the rejection reasons and `processingTime`. Correcting Israel's verdict took two passes; the first left four places still saying "six months" and "visa-free". **Grep the whole serialised record for the old claim before calling it done.**

### ⚠️ Astro scoped CSS does not reach JS-injected DOM

Rows added by client-side script get no scoped styles. Use `:global()` for anything the browser builds.

### ⚠️ `trailingSlash: 'never'` breaks the site

It makes Astro 404 `/countries/` *before* middleware runs, and prerendered pages emitted as folders get a 307 that **adds** a slash, fighting the middleware 301 that removes one — an infinite redirect loop for anyone whose browser cached it. The fix in place is `build: { format: 'file' }` **plus** middleware redirects. Don't "tidy" this.

### ⚠️ Never trust a HEAD failure

`mfa.gov.tr` answers 404 to HEAD and 200 to GET. `links.ts` always confirms with a real GET before calling a link dead.

### ⚠️ Cloudflare Workers DNS errors have no `err.cause.code`

Node's `ENOTFOUND` check silently never fires on Workers, so a dead domain looked alive and a dead link got published. `links.ts` has an `'unreachable'` verdict for "could not connect, cannot tell why".

### ⚠️ IndexNow `202` means the batch was **discarded**

202 = key still validating. A 154-URL submission answered 202 and never reached Bing. `scripts/indexnow.mjs` treats 202 as failure. Only **200** is success.

### ⚠️ Editing a GitHub issue body notifies nobody

The weekly check kept one rolling issue current by **rewriting its body**. GitHub sends no notification for an edited body — so the issue was opened once (which emailed), then silently updated every week for three weeks while the owner heard nothing and assumed the automation had died.

Notifications fire on: **issue opened, comment added, assignment, closing**. Not on a body edit. If a workflow needs to tell a human something changed, it must **comment**, not update.

The fix in `link-check.yml`: `verdict-review.mjs` emits a signature of *which* pages are on the list, stored in the body as `<!-- verdict-sig:… -->`. The body still refreshes weekly; a comment is posted only when the signature changes.

### ⚠️ Guard every mapped array

`tips` is optional; an unguarded `.map()` served three pages as 0 bytes. Use `(data.tips ?? []).map(...)`.

---

## 7. Deployment

**Push to `main` → GitHub Actions → live in ~1–2 minutes.**

```
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

Note the config path: the adapter **generates** `dist/server/wrangler.json` at build time. The root `wrangler.jsonc` holds the settings that matter (`workers_dev: false`, `preview_urls: false` — so Google never indexes a `*.workers.dev` copy of the site).

Secrets live in **GitHub Actions secrets** (CI), **Cloudflare Worker secrets** (runtime) and **`.dev.vars`** (local, gitignored). `scripts/*.mjs` read `.dev.vars` directly.

**Corridor content changes do not need a deploy.** Corridor pages are SSR from Supabase, so a database write is live immediately. Only code changes need a push.

### Environment variables

`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `PUBLIC_ADSENSE_CLIENT`, `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SA_KEY`, `REGEN_KEY`. See `.env.example`.

`vertex-key.json` is gitignored and must never be committed.

---

## 8. Scripts

All in `scripts/`, all Node ESM, all read `.dev.vars`. Most accept `--dry-run` — **use it**.

| Script | Purpose |
|---|---|
| `generate.mjs`, `bulk-generate.mjs`, `generate-us-routes.mjs` | create corridors |
| `backfill.mjs`, `review.mjs` | regenerate / review queue |
| `audit-plan.mjs` | groups the verdict audit **by destination** (one lookup settles every page to that country) |
| `audit-record.mjs` | records a batch result; `--export` writes the manual-check list |
| `audit-schengen.mjs` | checks Schengen pages against Regulation (EU) 2018/1806 |
| `check-links.mjs`, `fix-links.mjs` | official-source link health |
| `add-fees*.mjs` | the fee batches (1–4) |
| `fix-*.mjs` | one-off content corrections, each documenting its source |
| `indexnow.mjs` | submit URLs to Bing/Yandex |
| `make-og.mjs`, `make-favicons.mjs` | image assets |

---

## 9. The admin dashboard (`/admin`)

A private control room for the content: metrics, a review queue, and verdict verification.

| Path | What it does |
|---|---|
| `/admin` | Metrics, "do these next" ranked by traffic × staleness, filterable list of every corridor |
| `/admin/review` | Approve / reject `pending_review` pages |
| `/admin/c/<slug>` | One corridor: what it claims, its fees, and the verify form |
| `POST /api/admin/status` | Publish / reject / requeue |
| `POST /api/admin/verify` | Record a human verdict check, or a failed attempt |

**Auth is Cloudflare Access** (`src/lib/admin-auth.ts`). The JWT in `Cf-Access-Jwt-Assertion` is *verified* — signature against Cloudflare's JWKS, plus audience and expiry — not merely checked for presence. Endpoints re-check auth themselves rather than trusting the page that called them.

**Safe default:** with `ADMIN_ACCESS_TEAM_DOMAIN` or `ADMIN_ACCESS_AUD` missing, every admin route returns **404**. A missing variable locks the door; it can never open it. An unauthenticated visitor cannot even tell the dashboard exists.

**Local development:** `ADMIN_DEV_BYPASS=1` in `.dev.vars` skips auth — but only alongside `import.meta.env.DEV`, which is `false` in a production build, so the branch is stripped entirely. Verified absent from `dist/`.

**The guardrail that matters:** `/api/admin/verify` refuses to record a check without a source URL *and* a note, and rejects obvious non-sources. "Could not verify" is a first-class outcome that records what blocked you, so a route that beat us never looks checked. Every decision stores the acting email.

Cloudflare Access is configured with two destinations — `infoonvisa.com/admin` and `infoonvisa.com/api/admin`. Both are needed: the second covers the endpoints the dashboard's buttons call.

## 10. SEO machinery

- **Three sitemaps**, all in `robots.txt`: `sitemap-index.xml`, `sitemap-0.xml` (listed directly — Bing read the index once and never followed through to the children), `sitemap-corridors.xml`.
- **One canonical URL form.** Middleware 301s `www` → apex and strips trailing slashes; the sitemap `serialize` does the same, so we never offer two copies of one page.
- **Blog `lastmod`** comes from each post's own `pubDate` frontmatter, read at build time — not build time itself.
- **`sitemap-corridors.xml.ts`** has a `TEMPLATE_UPDATED_AT` constant. Bump it **only** when the template changes what readers see, never for a data tweak.
- **IndexNow** key `a62d09a38dbf478d814ae3dbf091fc68`, served from `public/<key>.txt`. Public by design.
- **AI crawlers are explicitly welcomed** in `robots.txt` (GPTBot, ClaudeBot, PerplexityBot, …). FAQPage JSON-LD is the vehicle for AI citations.
- **`noindex` until verified** — the core defence against Google's scaled-content-abuse policy.

---

## 11. Security

- CSP + HSTS + frame-deny set in middleware for every response.
- `safeUrl()` sanitises every outbound link (blocks `javascript:` etc.).
- Service-role key is server-only; anon key is RLS-limited to verified rows.
- `/api/generate` is same-origin-guarded and rate-limited at Cloudflare.
- All external links carry `rel="noopener noreferrer nofollow"`.

**Outstanding:** the Supabase service-role key has been shared in chat and **has not been rotated**. Rotate it.
