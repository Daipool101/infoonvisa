# InfoOnVisa — Build Plan & Technical PRD

> **Product:** A search-first web app. A traveler enters `From [Country] → To [Country]` and gets one clean, verified, dated visa + trip guide for that exact corridor.
> **Decisions locked in:** LLM = **Google Gemini** · Launch = **curate-first, then scale** · Hosting = **Cloudflare** · Monetization = **Google AdSense now, affiliates later**.
> **Status:** Planning. No code written yet. This document is the spec we build against.

---

## 0. The one rule that governs every decision

Google's **"scaled content abuse"** spam policy (March 2024) targets sites that mass-generate AI pages to game search. A naive "search → LLM writes a page → publish → repeat" site gets **rejected by AdSense** or **approved then deindexed**. The whole revenue model dies if we ignore this.

**Therefore, non-negotiable principles:**

1. **AI structures sourced facts; it never invents visa rules.** Every factual claim (verdict, fee, max stay, documents) must trace to an official source link captured at generation time.
2. **Curate before scaling.** Hand-verify ~20–40 high-traffic corridors, get them indexed, *then* apply to AdSense, *then* open on-demand generation.
3. **"Last verified" date + official source link on every page.** This is the E-E-A-T signal that distinguishes us from spam.
4. **Auto-generated pages are `noindex` until verified.** New corridors generate and serve to users immediately, but stay out of Google's index until a human (or a verification pass) approves them. This protects the domain's reputation.

---

## 1. Goals & Non-Goals

### Goals
- Complete, trustworthy answer for any corridor in **under 10 seconds**, no signup.
- Every published page **accurate, dated, official-source-linked**.
- Architecture supports **all corridors globally** (~40k pairs) without pre-building them.
- Highly **SEO-friendly** and **AdSense-eligible**.

### Non-Goals (explicitly out of scope)
- We do **not** process visa applications (refer out, earn affiliate commission).
- **No mobile app** at launch — fast responsive web only.
- **English only** at launch; localization is a later phase.
- **No user accounts** at launch (the paid AI chatbot is a future phase).

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Astro** (SSR/hybrid mode) | Ships near-zero JS, best-in-class SEO & Core Web Vitals, ideal for content + ads; renders dynamic route pages on demand. |
| Hosting / runtime | **Cloudflare Pages + Workers** | Your target. Astro has a first-class Cloudflare adapter. |
| Corridor cache DB | **Supabase** (Postgres) | Free tier, great dashboard for manually verifying/editing curated corridors. Accessed from Astro SSR via the Supabase JS client. |
| Edge cache | **Cloudflare Cache API / KV** | Serve fresh corridors from edge without hitting Supabase every time. |
| Content generation | **Google Gemini API** (with Google Search grounding) | Native search grounding helps capture official source links — directly supports principle #1. |
| Blog/CMS | **Markdown/MDX in-repo** (Astro Content Collections) | You write blogs; no external CMS needed at launch. |
| Analytics | **Cloudflare Web Analytics** + Google Search Console | Privacy-friendly, free. |
| Currency conversion | **Cached FX rates** (daily pull, stored in KV) | For "fee in local currency". |

**Why not Next.js?** Astro produces leaner, more static-friendly output, which is better for an ads/content site's page-speed and AdSense approval. We don't need a heavy app framework.

---

## 3. Information Architecture (pages)

```
/                         Home — From→To search, value prop, popular corridors
/[from]-to-[to]           THE corridor page (single dynamic template, the product)
                          e.g. /india-to-japan
/country/[country]        Country hub — all corridors from/to it, country FAQ
/about                    Trust, methodology, "how we verify", disclaimer
/blog                     Blog index
/blog/[slug]              Articles (travel tips, guides) — SEO reach driver
/privacy  /terms          Required for AdSense
```

**One dynamic template** renders every corridor. Structure/design is constant; only content changes by origin/destination. URLs are clean, lowercase, hyphenated, stable.

---

## 4. The Corridor Page — content blocks (A–G)

This is the page that ranks, gets shared, and earns. It is also our **data schema** (Section 6) and our **LLM generation template** (Section 7).

- **A. Verdict banner (above the fold)** — One-line answer (*Visa-free / Visa on Arrival / e-Visa / Embassy visa required*) + max stay. "Last verified: [date]" + "Source: [official link]" badge.
- **B. Visa details** — Visa type(s) for this passport; **fee** in destination currency + auto-converted to traveler's local currency; processing time range; validity / max stay / single vs multiple entry; eligibility & common disqualifiers.
- **C. Documents checklist** (printable/checkable) — passport validity rule, photo specs, proof of funds, return ticket, accommodation, invitation letter — only what applies.
- **D. How & where to apply** — numbered steps; **official application link**; VAC/VFS/BLS center info (name, address, booking link) where in-person submission is needed; affiliate "apply with help" option (iVisa) — *phase 2*.
- **E. Trip essentials (monetization block)** — travel insurance (SafetyWing/World Nomads/AXA), eSIM (Airalo), flights & hotels (Trip.com/Booking/Skyscanner), currency & money tips. *Affiliate links phase 2; AdSense slots now.*
- **F. Things to know + Places to visit** — entry tips, scams, customs notes, best time to visit; top places (Viator/GetYourGuide affiliate — phase 2).
- **G. FAQ** — corridor-specific Q&A with **schema.org FAQPage JSON-LD** (helps SEO + AI answers).

**Plus on every corridor page:**
- Loading screen (airplane animation + 10–20 rotating common travel tips) shown while generating.
- AI-generated-content disclaimer **T&C modal with checkbox** on first view (consent stored client-side).
- "Last verified" date and source links throughout.

---

## 5. Request / generation flow

```
User searches  India → Japan
        │
        ▼
Check edge cache (KV) ──fresh hit──► serve instantly
        │ miss
        ▼
Query Supabase for corridor row
        │
   ┌────┴─────────────────────────┐
   │ exists?                       │
   ▼ yes                           ▼ no
generated_at < 30 days?       show LOADING page (tips)
   │ yes        │ no               │
   ▼            ▼                   ▼
serve      regenerate ◄──── Gemini generation (grounded in official sources)
                                    │
                                    ▼
                          store JSON + generated_at in Supabase
                                    │
                          status = 'pending_review' (noindex)
                                    │
                                    ▼
                          render page to user
```

- **Freshness window:** 30 days (your spec). A `next_refresh_at` column drives regeneration. (You also mentioned 330 days — we'll treat **30 days** as the verification/refresh window; 330 was likely a typo. Confirm.)
- **noindex until reviewed:** auto-generated pages serve to users but carry `<meta name="robots" content="noindex">` until `status = 'verified'`. Curated corridors are `verified` from the start.

---

## 6. Data model (Supabase / Postgres)

```sql
CREATE TABLE corridors (
  id              TEXT PRIMARY KEY,         -- 'IN-JP'
  from_country    TEXT NOT NULL,            -- ISO code 'IN'
  to_country      TEXT NOT NULL,            -- 'JP'
  slug            TEXT UNIQUE NOT NULL,     -- 'india-to-japan'
  data            JSONB NOT NULL,           -- full structured content (blocks A–G)
  sources         JSONB NOT NULL,           -- array of {label, url}
  verdict         TEXT,                     -- 'visa_free'|'voa'|'evisa'|'embassy'
  max_stay_days   INTEGER,
  status          TEXT DEFAULT 'pending_review', -- 'verified'|'pending_review'
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_refresh_at TIMESTAMPTZ NOT NULL,
  search_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_corridors_refresh ON corridors(next_refresh_at);

CREATE TABLE searches (             -- analytics / "last searched" / popularity
  id          BIGSERIAL PRIMARY KEY,
  corridor_id TEXT REFERENCES corridors(id),
  searched_at TIMESTAMPTZ DEFAULT now()
);
```

- `data` is **JSONB**, validated against a strict schema mirroring blocks A–G before insert (reject + retry on Gemini mismatch).
- **Row Level Security:** anon key has read-only access to `status = 'verified'` rows; writes/generation go through the server (service-role key) only.
- The Supabase dashboard doubles as our **manual verification console** — flip `status` to `'verified'` to publish/index a corridor.

---

## 7. Gemini generation pipeline

1. **Input:** `from_country`, `to_country` (+ resolved passport/destination names).
2. **Grounding:** call Gemini with **Google Search grounding enabled** so it pulls from live official sources; instruct it to **return the source URLs it used**.
3. **Structured output:** force a JSON response matching the block A–G schema (response schema / JSON mode). No prose-only output.
4. **Hard rules in the prompt:**
   - Only state visa facts you can attribute to an official government / e-visa source; include the URL.
   - If a fact is uncertain, mark it `"confidence": "low"` and add a "verify on official site" note rather than guessing.
   - Never fabricate fees, dates, or links.
5. **Validation:** schema-validate; ensure at least one official `.gov`/e-visa source is present; else mark `low_quality` and don't index.
6. **Store** in D1 with `generated_at`, `next_refresh_at = +30d`, `status = pending_review`.
7. **Refresh job:** a scheduled Cloudflare Cron Worker regenerates corridors past `next_refresh_at`, prioritized by `search_count`.

> **Accuracy disclaimer is mandatory** given visa info is consequential. The T&C modal + a persistent "AI-assisted, verify on official sources" banner cover liability and set user expectations.

---

## 8. SEO plan

- **Clean URLs:** `/india-to-japan`, stable and human-readable.
- **Per-page metadata:** unique title, meta description, canonical, OpenGraph.
- **Structured data (JSON-LD):** `FAQPage` (block G), `BreadcrumbList`, `Article` for blogs, `Organization` site-wide.
- **Sitemap:** dynamic `sitemap.xml` listing only `status = 'verified'` corridors + blog + static pages.
- **Internal linking:** country hubs link to corridors; corridors cross-link related corridors and relevant blog posts. This is how new pages get discovered and earn authority.
- **Core Web Vitals:** Astro + edge cache → fast LCP; ads loaded async/lazy to protect CLS.
- **Content depth:** curated corridors are genuinely thorough (this is what ranks). Blogs build topical authority and bring traffic that funnels into corridor pages.

---

## 8.5 Design system (from your palettes)

**Direction:** clean, airy, trustworthy travel. Warm orange for action/energy; calm indigo for trust/brand; soft beige canvas; green reserved as a *semantic* "good news" color. Generous whitespace, rounded cards, one clear accent — not a rainbow.

**Core tokens**

| Token | Hex | Use |
|---|---|---|
| `--brand` (indigo) | `#504E76` | Logo, headings, nav, trust anchor |
| `--brand-soft` | `#C4C3E3` | Soft card tints, badges, hover states |
| `--accent` (orange) | `#F1642E` | Primary CTAs ("Search", "Apply"), key highlights |
| `--accent-soft` | `#FCDD9D` | Banners, callouts, ad-slot framing |
| `--bg` (beige/off-white) | `#FDF8E2` | Page background |
| `--surface` | `#FFFFFF` | Cards, content blocks |
| `--success` (green) | `#A3B565` | **Visa-free / good-news verdict** only |
| `--ink` | `#2B2A3D` | Body text |

**Semantic verdict colors** (block A banner): `visa_free` → green · `voa`/`evisa` → orange-soft · `embassy required` → deeper orange/amber (caution, not alarming red).

**Type & feel:** clean humanist sans (e.g. Inter/system stack — no font-CDN dependency on Cloudflare), large readable body, rounded 12–16px corners, soft shadows, airplane/route motif in the loading screen.

---

## 9. Monetization

**Now — Google AdSense:**
- Reserve fixed, non-intrusive ad slots in the layout (header below nav, mid-content, sidebar/in-content on mobile). No layout shift.
- Apply **only after** curated corridors are live, indexed, and the site has real content depth (privacy/terms/about present).

**Later — Affiliates (higher RPM than ads for this audience):**
- Insurance: SafetyWing / World Nomads / AXA.
- eSIM: Airalo.
- Flights/Hotels: Trip.com / Booking / Skyscanner.
- Tours: Viator / GetYourGuide.
- "Apply with help": iVisa.
- These slot into blocks D, E, F — wired behind a config so they can be toggled per corridor/country.

**Audience note:** travelers researching foreign corridors skew high-value (international, high purchase intent) — good for both ad RPM and affiliate conversion, especially insurance/eSIM/flights at the visa-decision moment.

---

## 10. Phased roadmap

**Phase 0 — Foundation (build skeleton)**
- Astro + Cloudflare Pages project, layout, design system, responsive shell.
- Dynamic corridor template (blocks A–G as components, with placeholder data).
- D1 schema, freshness-or-generate Worker, Gemini generation behind a clean interface.
- Loading screen + tips, T&C modal, "last verified" badges, JSON-LD, privacy/terms/about.

**Phase 1 — Curate & launch**
- Hand-generate + **human-verify ~20–40 top corridors** (e.g. India→{Schengen, UK, US, UAE, Thailand, Japan, Singapore, Canada, Australia}, and other high-volume pairs).
- Write 8–12 cornerstone blog posts.
- Submit to Search Console, build sitemap, get indexed.

**Phase 2 — Monetize & open up**
- Apply to AdSense; place ad slots.
- Enable open on-demand generation (new corridors = `noindex` until verified).
- Add affiliate links (insurance, eSIM, flights, tours).

**Phase 3 — Scale & enhance**
- Cron refresh worker, country hubs for all countries, currency auto-conversion.
- Localization, paid AI chatbot + user accounts (future).
- **Fully-automatic on-demand generation via Vertex AI** (see below).

---

## Known constraint & future task: on-demand generation on Cloudflare

**Constraint discovered at deploy:** the **Google AI Studio Gemini API is geo-restricted** and
rejects requests coming from Cloudflare's edge servers with
`400 — "User location is not supported for the API use."` This is **independent of billing** —
a paid AI Studio key has the *same* geographic restriction.

**Two separate limits, do not conflate them:**
| Limit | Symptom | Fixed by |
|---|---|---|
| Daily **quota** | `429 quota exceeded` | ✅ Enabling Gemini **billing** |
| **Geo-location** of caller | `400 location not supported` (only from Cloudflare) | ❌ NOT billing — needs **Vertex AI** |

**Current launch approach (works today):** generation runs from a supported region via
`scripts/generate.mjs` (your machine / a GitHub Action) and writes to Supabase. Cloudflare only
READS from Supabase. The on-demand flow on the Worker (search → if missing, call Gemini, store,
serve) is therefore **disabled in production** and shows a "guide is on the way" message instead.

**Future task — enable true on-demand generation on Cloudflare:**
Switch the Worker's generation call from the AI Studio API to **Vertex AI** (Google Cloud project,
region you choose, service-account auth). Vertex is not caller-location restricted, so the Worker
can generate any of the ~40k routes live on first search. Requires: GCP project + billing,
enable Vertex AI API, service account credential, and OAuth-token handling in the Worker.
Until then, the curate-first batch model is the launch path.

---

## 11. Cost sketch (order of magnitude)

- **Cloudflare Pages/Workers/D1:** free tier covers early traffic; ~$5/mo Workers Paid when volume grows.
- **Gemini API:** pay per generation, but generation happens **once per corridor per 30 days** — cached aggressively, so cost is bounded and tiny relative to traffic.
- **Domain:** you have `infoonvisa.com`.
- Net: near-zero to launch; scales sub-linearly because of caching.

---

## 12. Decisions (resolved)

1. **Refresh window:** **30 days.** (330 treated as a typo.)
2. **Gemini API key:** user has it ready.
3. **First corridors to curate (~20):** India-heavy + global majors, chosen for search volume and visa-decision intent:
   - From **India**: → UAE, → Thailand, → Singapore, → Japan, → UK, → USA, → Schengen (France/Germany/Italy), → Canada, → Australia, → Malaysia, → Indonesia (Bali), → Vietnam, → Sri Lanka, → Nepal, → Maldives, → Turkey, → Saudi Arabia.
   - Global majors: USA → Schengen, UK → USA, USA → Japan.
   - (Final list tunable once Search Console data arrives.)
4. **Design:** indigo + orange on beige, per Section 8.5 — derived from the provided palettes.

**Database:** Supabase (Postgres), not Cloudflare D1. **Domain:** infoonvisa.com (owned).

---

*Next step: I scaffold Phase 0 (running Astro + Cloudflare skeleton with the corridor template, Supabase schema, and Gemini generation stub).*
