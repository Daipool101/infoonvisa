# InfoOnVisa — Project Memory & Handover

Everything a new person needs to pick this up and work on it without guessing.
Read `ARCHITECTURE.md` for *how it is built*; this file is *what state it is in, why it is that way, and what to do next*.

**Last updated:** 27 September 2026
**Owner:** Akash Jaiswal (akash@cuddlesfoundation.com)
**Live:** https://infoonvisa.com

---

## 1. What this site is

A traveller picks **From country → To country** and gets one page answering: do I need a visa, what kind, how long can I stay, what does it cost, what documents, how to apply, what goes wrong.

The entire business rests on one thing: **the pages are right.** A visa site that is confidently wrong costs someone a flight, a fee, or a trip. It also fails AdSense review and gets deindexed. Accuracy is not a nice-to-have here; it *is* the product.

---

## 2. Current state (27 September 2026)

| | |
|---|---|
| Live corridor pages | **130** (`status = 'verified'`) |
| Awaiting review | 2 (`pending_review`) |
| Blog posts | 17 (all published) |
| Countries available | 198 |

**Verdict spread:** visa-free 60 · embassy 27 · e-visa 26 · eta 10 · voa 7

**Verdict accuracy:** **123 of 130** carry a recorded human check. Two routes remain for the owner (§6B); the rest were settled in the 8-batch audit.

**Regeneration audit:** a full grounded re-check of every live page ran 26–27 Sep 2026. **14 disagreements, 4 real** — see §5b before believing any of its output.

**Visa fees:** **57 pages** carry a verified fee; 60 more are visa-free and say "None". **13 still unpriced**, carrying ~7% of traffic — all blocked on governments that publish no figure (§6C).

**Admin dashboard:** live at /admin behind Cloudflare Access — see §7b.

---

## 3. The rules that govern the content

These were agreed with the owner and are not negotiable. Most were learned by getting something wrong first.

### 🔴 Official source, or flag it

Every factual claim traces to a **government page we read ourselves**. Not a summary of it, not a travel blog, not an aggregator. If the official source can't be read, the claim is **not published** and the route goes on a manual-check list with a note saying exactly what was tried.

> **Never** stamp something "verified" because the answer looks obvious. An unread line is an unpublished number.

### 🔴 A wrong fee is worse than no fee

A reader budgets against a fee. There is no field for an estimate, a range, or "typically". Either the number was read on the government's own page — with the date and link recorded — or the page says nothing and points at the source.

### 🔴 Keep the government's own hedges

Japan says "about" (each mission converts to local currency). Immigration NZ says "from" (it varies by where you apply). **Quote both as written.** Hardening them into precise figures invents precision the source doesn't have — the same failure as a wrong number, better dressed.

### 🔴 Don't assert refundability unless the government does

`refundable: true | false | null`. `null` renders "Not stated on the official fee page". "Usually non-refundable" is a guess about the reader's money. Use `refundableNote` when Yes/No can't express the real rule (Japan doesn't refund the fee — it never charges it unless the visa is issued).

### Fee presentation rules (owner's explicit calls)

- **Verdict row first, then Fee** — once someone knows whether they need a visa, cost is the next question.
- **No service-fee row. No provider names** (no "VFS Global").
- Show **Refundable**, a **"verified on" date**, and a **cross-check link** to the exact page the number came from.
- Work in **batches of 10**, report, then continue.

### The "last verified" date is display-only

It is deliberately **not** wired into sitemap `lastmod` or any schema date. Those drive recrawl scheduling, and a date that moves every time we re-check a fee would churn the sitemap without the page changing for a reader. (The owner raised this specifically — an earlier version of a verified-date caused crawl problems. This design avoids that mechanism entirely.)

---

## 4. How to crack an "unreadable" government site

Roughly half the work on this project is getting a number out of a site that doesn't want to give it. These tricks have each worked more than once — **try them before flagging a route as unverifiable**.

| Trick | Example that worked |
|---|---|
| **Embassy mirror** — the main portal is walled, a small mission site republishes the same text | `evisa.gov.az` blocks everything; `pretoria.mfa.gov.az` has the full e-visa country list. `travel.state.gov` is Cloudflare-walled; **every** US embassy site publishes the same fee schedule |
| **The official gazette** — ministries are bot-walled, legal publication isn't | Costa Rica's visa directives in *La Gaceta*; Ireland's visa-required list in S.I. 473/2014; the Schengen fee in the Visa Code itself |
| **The national PR agency** | Thailand's MFA and immigration sites beat me; `thailand.prd.go.th` published the whole 2026 visa revision plainly |
| **The origin government** | `gov.uk` travel advice settled UAE for British citizens after UAE sites just pointed at each other |
| **The e-visa portal's own country table** | Mozambique lists only the visa-**exempt**; a nationality's absence is the proof |
| **PDF text extraction** | `pip install pypdf` — Jamaica's, Mexico's, Peru's and Mauritius's lists are all text-layer PDFs. Strip leading junk before `%PDF` if the header looks wrong |

### Two reading traps that have caused real errors

**1. Tables have columns.** Argentina's list showed "ESTADOS UNIDOS DE AMERICA / REQUIERE VISA" — but that sat in the **diplomatic passport** column; ordinary passports are visa-free. South Africa's exempt list shows India at 90 days for diplomatic/official/service and **blank for Ordinary**. Reading the row without the columns inverts the answer. **Parse cells, don't trust a flattened summary.**

**2. A plausible number can answer the wrong question.** The US–UAE page said 90 days in 180. That figure is real — it's the **British** entitlement. Americans get one month. When a duration looks generous, confirm it against a source written for *that* nationality. Korea prices per nationality too (UK $45/$250, Vietnam $20/$80).

**3. Watch for rules with a future effective date.** Thailand's 60-day exemption was revoked effective 15 September 2026 — caught three days out. Japan's fees rose 5× on 1 July 2026 and its *main* fee page still shows the old figures with a note pointing elsewhere. When a source mentions a pending change, chase the effective date and check whether the gazette actually published.

**4. The eligibility list is usually a dropdown, not a document.** The clearest answer on this whole project came from the *Country of Nationality* menu on Saudi Arabia's own eVisa signup page: 70 entries, and the page says underneath it that anyone not listed must contact an embassy. India was not there. Neither was Pakistan. When a government runs an application portal, open the form and read the menu — it is the eligibility list, maintained because the system depends on it, and it cannot be out of date the way a help page can.

**5. "Free of charge" usually belongs to somebody else.** The UAE consulate page carries that phrase three times and not once for British or American ordinary passports — those sentences are about Chinese nationals, Russian nationals, and *diplomatic* passport holders. The Maldives says the *Traveller Declaration form* is free of charge, which is not the visa. Both visas may well be free; neither government says so. Read what the sentence is attached to before believing it applies to your reader.

### The "e-visa that isn't" — the most common false positive

An electronic visa is not the same as an online application, and four separate pages have nearly been broken by confusing them.

| Route | What it looks like | What it is |
|---|---|---|
| India / China → Japan | JAPAN eVISA | You still submit in person at a visa centre; only the sticker became electronic. Japan's MOFA lists both countries under *"apply through an accredited agency"* |
| Australia / Switzerland → Indonesia | e-Visa portal | Indonesia's own name for it is **"Electronic Visa on Arrival (e-VOA)"**. It is a visa on arrival |
| India → Türkiye | e-Visa | Open only to holders of a Schengen, US, UK or Ireland visa. Conditional, not general |
| Brazil → Egypt | Visa on arrival | Exists, but the list of eligible nationalities is unpublished; Egypt's own portal says you *"generally must first obtain an e-Visa"* |

**The test is what the traveller has to do, not what they end up holding.** If they must appear somewhere with documents, it is not an e-visa however the file arrives. And if a route is open only to people holding some *other* country's visa, the verdict is the unconditional route, with the conditional one carried as an option whose **name** states the condition.

---

## 5. What has been fixed (and why it mattered)

The verdict audit ran in 8 batches and found **15 errors in 125 pages** — about 1 in 8. The ones worth knowing about:

| Page | Was | Why it mattered |
|---|---|---|
| **US → Israel** | "no visa needed, just turn up" | ETA-IL mandatory since 1 Jan 2025. Airlines check it at boarding — this stopped people at the check-in desk |
| **India → Thailand** | "Visa on Arrival, 15 days" | Thailand abolished India's VoA on 15 Sep 2026 and moved India to a 30-day exemption. The page sent people to a counter that no longer exists |
| **US → UAE** | "90 days" | Actually one month. An American planning two months would have been an overstayer from day 31, fined daily |
| **India → Bhutan** | "exempt from the SDF" | False. Indians pay a concessional SDF per person per night — a family of four would have arrived thousands of rupees short |
| **US → Israel** | "passport valid 6 months" | Israel requires **3 months**. Would have sent people to renew passports they could still use |

Other corrections: Qatar (VoA not e-visa), Malaysia, Philippines, several Schengen verdicts checked against Regulation (EU) 2018/1806, and "India citizens" → "Indian citizens" across 66 pages.

**Also fixed, from Phase 1 of the fee work:** the at-a-glance table said *"None — no visa is required"* against **every** option on a visa-free page — including Thailand's Tourist Visa, which costs money. Now only the exemption row says free; `isExemptionOption()` decides, and anything unrecognised falls back to the official source. Mexico's FMM and Bhutan's Entry Permit deliberately fall through — no visa needed, but the document is charged for.

### The generator itself was the root cause (fixed 26 Sep 2026)

Worth understanding before trusting anything a page says, because it explains the *shape* of every error above.

Every page was produced by a single model call **with no tools**. The prompt told it to *"only state visa facts you can attribute to an official government source"* and to put those URLs in `sources` — to a model that could not open a web page. It was asked for footnotes with no library card, and it cannot refuse, so it recalled a URL that looked right and wrote prose that sounded sourced. The only check was that the URL loaded.

That is how India → Saudi Arabia went live claiming Indians may use the tourist e-Visa, citing `mofa.gov.sa` — a real ministry homepage that says nothing about Indians.

And the model was not inventing. The web is full of *"Indians can get a Saudi e-visa"* because it is true for the many Indians holding a used US visa — the Article 6(2) exception. **Ten thousand agency pages repeating an exception outweigh one ministry PDF stating the rule.** Recall is weighted by frequency and has no idea who is authoritative. That single sentence explains Saudi Arabia, the UAE 90-day error, and most of the rest.

Generation now runs in two passes (`src/lib/gemini.ts`, mirrored in `vertex.ts`):

1. **Research** — `urlContext` opens the destination's curated portal directly, `googleSearch` covers the rest. Plain prose out.
2. **Structure** — tools off, input is pass 1's text *only*. It can rearrange, not invent.

They are separate calls because search grounding and a strict `responseSchema` cannot be combined in one request, which is almost certainly why grounding was never switched on.

> 🔴 **Grounding alone was not enough, and this is the part to remember.** Search returns what ranks, and for visa queries what ranks is visa agents. A grounded answer about Saudi Arabia came back resting on `saudievisaonline.com`, `visadeskglobal.com`, an airline and an insurer — two governments among eight — and the model wrote *"official Saudi sources consulted include the Ministry of Foreign Affairs, as referenced by TATA AIG and The Times of India."* An insurance company standing in for a ministry is **worse** than an ungrounded guess, because it arrives wearing a citation.

So the check cannot live in the prompt. `src/lib/evidence.ts` judges the list of pages the **API** says were retrieved, and the publish gate reads that instead of asking whether the page cited a `.gov` URL — a test a model passes by recalling one. A page must have had its official portal successfully read, or two independent government pages retrieved, before it can publish itself.

---

## 5b. The regeneration audit — and why it never writes

`scripts/regen-audit.mjs` re-researches every live page through the new grounded pass, compares the verdict it reaches with the one published, and **reports differences instead of fixing them**. Results land in `audit-regen.md`; decisions live in `audit-accepted.json`.

**It does not overwrite, and it must not be made to.** Re-running 128 pages and saving the output would discard every human verification, every hand-checked fee and every correction made by hand — replacing known-checked text with unknown-checked text. That is not an improvement because the pipeline got better.

```bash
node scripts/regen-audit.mjs --limit 10              # top 10 by traffic
node scripts/regen-audit.mjs --limit 10 --skip 10    # next 10
node scripts/regen-audit.mjs --slug india-to-nepal   # one route
```

> ⚠️ **It runs on Vertex, and that is not a preference.** The free Gemini API key allows **20 requests per day** per model (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). A 128-page audit exhausts it in minutes, and the failures arrive mid-run as 429s. `scripts/lib-vertex.mjs` holds the service-account auth and retries on 429 honouring the server's own delay hint — because a rate limit that reads as *"checked this page, found nothing"* is the same class of bug as the link checker that could not tell a crash from a healthy week.

### What the first full pass actually proved

**14 disagreements out of 128. Four were real. Ten were not.** Every one was taken to the government's own page rather than trusted.

Real, and all four had been wrong for over a year:

| Page | Was | Now |
|---|---|---|
| `india-to-israel` | embassy | **evisa** — Israel opened eVisa-B2 to Indians on 25 Jun 2025 |
| `india-to-south-africa` | embassy | **evisa** — India is on the Home Affairs eVisa list (4 named airports only) |
| `india-to-sri-lanka` | evisa | **eta** — badge only; the page already said ETA throughout |
| `brazil-to-egypt` | voa | **evisa** — a precaution, not a proven error (see the file's header) |

> 🔴 **Confidence from the research pass carries no weight whatsoever.** It reported `visa_free` for **US → Israel** at high confidence with *"could not confirm: none"* — having opened `travel.state.gov` and then taken the rest from Wikipedia and tour operators, never once opening an Israeli government page. Israel has required a visa or ETA-IL of every traveller since 1 January 2025. That change would have sent Americans to the airport with nothing. It was equally confident about Saudi Arabia twice: once right, once wrong.

**Three of the ten were the tool arguing against corrections already verified by hand** — both Saudi routes and US → Israel. Treat a disagreement as *"go and look at this page"*, never as a finding.

What it is genuinely good for is exactly that. Israel's eVisa-B2 and South Africa's eVisa had both been live for over a year, and neither would ever have surfaced by re-reading our own pages.

**Record every decision in `audit-accepted.json`** — what was read, by whom, when. Without it each run re-opens the same settled arguments and the new findings drown. An entry only covers the exact argument it settled: if research later returns a *different* verdict, the audit flags it again.

---

## 6. Open work, in priority order

### A. AdSense application — **the next milestone**

The groundwork is done: 126 verified pages, dated sources, a real blog, privacy/terms/contact/about pages, an audit trail. This is the recommended next session.

### B. 2 routes the owner must verify by hand

In `C:\Users\Akash\Downloads\verify-manually.md`, each with what the page claims and exactly what was tried. *(Both Saudi routes came off this list on 26 Sep 2026 — see §5b.)*

| Route | The one thing needed |
|---|---|
| `india-to-pakistan` | The whole `.gov.pk` zone refuses our connections. Open `dgip.gov.pk/visa/indians.php` and paste what it says |
| `india-to-nepal` | Nepal's visa pages never mention Indians, because they enter under the 1950 Treaty of Peace and Friendship. Confirm which IDs are accepted (passport, or Election Commission voter ID) |

### C. Visa fees — 29 pages still unpriced

Batches 1–4 are done (39 pages). **The remaining ones are genuinely harder**, not merely unattempted:

- **Vietnam** (3 pages) — publishes no fee on any readable page. Dropped from two batches.
- **Türkiye** — official country fee schedule is stamped "AS OF 1 MAY 2014".
- **Georgia** — portal shows nothing until you start an application.
- **China** (2), **UAE**, **Saudi** (2), plus a long tail.

Expect 4–6 routes from a Batch 5, not 10. **Do not pad a batch with a guess** — Batch 4 shipped 9 rather than invent a tenth.

### D. Smaller items

- **Rotate the Supabase service-role key.** It has been shared in chat and is still live.
- ~~`do-you-really-need-a-visa-agent-an-honest-guide` — draft with a placeholder title~~ — **done 14 Sep 2026**: retitled "Do you really need a visa agent? An honest guide" and published.
- `united-states-to-bahamas` and `united-states-to-south-africa` — generation failed, retry.
- Airport Transit Visa (Type A) rows on Schengen pages are unpriced — the Visa Code governs them but Article 16 as read says "applicants" without naming Type A.

---

## 7. Working agreements with the owner

- **Explain simply.** The owner has asked repeatedly for plain language, not jargon. Say what changed and why it matters to a traveller.
- **Work in batches, report, wait.** Established for both the audit and the fees. Don't run three batches without reporting.
- **Show the plan before big changes** when asked — the owner will say "tell me how you'll solve this, then I'll give you the go-ahead".
- **Don't touch the home page or corridor page layout** without being asked. Mobile changes were explicitly scoped to *other* pages first, then extended to the home page with "keep as it is for desktop view".
- **Report failures honestly.** The owner has caught a real problem before (IndexNow 202s never reaching Bing). Surfacing "this didn't work" is more valuable than a clean-looking report.

---

## 7b. The admin dashboard — use this before writing a script

**https://infoonvisa.com/admin** — behind a Cloudflare Access email login (owner's address only). Built 19 Sep 2026.

| Screen | What it replaces |
|---|---|
| Dashboard | reading numbers out of the database by hand |
| Review queue | `update corridors set status='verified' where slug=…` |
| Corridor detail | `scripts/audit-record.mjs`, and the one-off `scripts/fix-*.mjs` |

**Recording a verification requires a source URL and a note.** Obvious non-sources are refused. "Could not verify" records what blocked you, so a route that beat us never looks checked. Every action stores who did it.

> 🔴 **Every Worker setting must be type "Secret", never "Text"/"Variable".** A plain Variable is erased by the next deploy — the generated config carries `vars: {}` and replaces it with nothing, while Secrets are left alone. `ADMIN_ACCESS_*` were added as Variables, worked, and vanished a few commits later, locking the dashboard. Neither value is genuinely secret; Secret is just the only type that survives.

**If `/admin` shows "Not found"**, the two Access settings are missing or wrong — that is the designed failure mode, not a bug. They live in the Cloudflare dashboard under **Settings → Runtime variables and secrets**:

- `ADMIN_ACCESS_TEAM_DOMAIN` = `summer-scene-d750.cloudflareaccess.com`
- `ADMIN_ACCESS_AUD` = the Application Audience tag, found under the Access application → **Additional settings → AUD tag** (not the Details tab, and not the Policy ID, which has dashes)

Access protects **two** destinations — `infoonvisa.com/admin` and `infoonvisa.com/api/admin`. The second covers the endpoints the dashboard's buttons call; without it the buttons break.

**Editing (Phase 3, 19 Sep 2026).** The corridor detail page edits the verdict, headline, summary, max stay, processing time, official source, visa options, fees and sources. `src/lib/admin-edit.ts` holds every rule; `/api/admin/edit` is the only writer. What it guarantees, and why each one exists:

- **A diff before every save.** Each panel shows before → after and waits for a second click. Nothing about a live page changes on one click.
- **Verdict without headline is called out.** Changing the badge while leaving the words under it triggers a warning in the preview — that mismatch once shipped "ETA required" under a green *Visa-free* badge.
- **The mirrored columns move together.** `verdict`, `max_stay_days` and `sources` exist both as columns and inside `data`; `mirroredColumns()` writes both, always. Never update one alone.
- **A fee must point at a real option.** Rename an option and its fee is repointed in the same save, or the save is refused — an orphaned fee just stops being shown, with nothing to say why.
- **A fee needs a date and a source**, and the date cannot be in the future.
- **Every change is recorded** in `data.changeLog` (last 40) with who, when, and the value it replaced.
- **Undo puts the old value back as a new change** rather than erasing history, and is offered only on the newest change to a field — reverting an older one would silently discard everything done since.
- **Saving a live page pings IndexNow.** Only HTTP 200 counts; 202 means discarded, and the toast says so and points at the manual *Tell search engines* button.

Writing a `scripts/fix-*.mjs` for a content change is now the fallback, not the default — a script bypasses every guard above.

---

## 8. Routine operations

```bash
npm run dev                         # local, http://localhost:4321
npm run build                       # must pass before pushing
git push origin main                # → GitHub Actions → live in ~1–2 min
```

```bash
node scripts/audit-plan.mjs                    # what still needs verifying
node scripts/audit-record.mjs --verified <dest> --note "…what was read…"
node scripts/audit-record.mjs --export         # rewrite the manual-check list
node scripts/add-fees-batch4.mjs --dry-run     # ALWAYS dry-run first
node scripts/indexnow.mjs <url> <url>          # 200 = accepted, 202 = FAILED
```

**Verifying a change actually landed:** corridor pages are SSR from Supabase, so a data change is live immediately — no deploy needed. Always `curl` the live page and check the rendered value, and **assert HTTP 200 before reading the file**. A stale file from a previous run once looked like a serious bug that didn't exist.

**Weekly link check** runs Mondays 04:00 UTC. It does three things:

1. **Broken source links** → opens (or comments on) an issue, labelled `link-check`. Closes itself when links recover.
2. **Verdicts due a human check** → one rolling issue labelled `verdict-review`. The body refreshes weekly; it **comments only when the set of pages changes** (see below). Closes itself when nothing is overdue.
3. **Monthly health report** → one short all-clear a month on a `health-report` issue, on the first run after the 1st.

**Why the monthly report exists:** a healthy week is deliberately silent, which makes silence ambiguous — "nothing is broken" and "the automation stopped" look the same from an inbox. If a month passes with no report, the automation itself has stopped; check the Actions tab.

> ⚠️ **Two lessons, both learned from this going silent for weeks.**
>
> 1. **GitHub does not notify anyone about an edited issue body.** The verdict issue used to be kept current by rewriting its body. It was opened 24 Aug (that email arrived) and silently rewritten every week after, with 0 comments, while its body went stale. If a workflow needs to tell a human, it must **comment**.
> 2. **Never let an exit code mean two things.** The scripts used to signal "found work" by exiting 1, with `continue-on-error` keeping the job green. A healthy site, a broken site and a *crashed script* then looked identical from the outside — and when the verdict script crashed, the notify step was skipped and nobody was told. The scripts now exit 0 unless they genuinely failed and report findings as **outputs**; `continue-on-error` is gone, so a crash turns the run red and GitHub emails about the failed run.
>
> Every run also writes a summary table (links checked, broken, verdicts overdue, step outcomes) to the Actions tab. If this ever goes quiet again, **read that first** — an empty value means the script did not get far enough to report it.

**Verified working end to end on 14 Sep 2026:** a manual test run produced all three notifications — the link-check issue, a comment on the rolling verdict-review issue, and the monthly health report.

**To prove email delivery end to end:** Actions → *Weekly source-link check* → **Run workflow** → tick **"Send a TEST alert"**. That fakes one broken link, raises a real issue, and emails you. Close the issue afterwards.

---

## 9. Where the numbers came from

Sources already verified and reusable for future batches:

| Source | Covers |
|---|---|
| EU Visa Code Art. 16 (consolidated 11 Jun 2024) | €90 / €45 / free under 6, non-refundable — **all Schengen pages** |
| `mofa.go.jp` amended fee order | ~¥15,000 / ~¥30,000 from 1 Jul 2026 — all Japan embassy routes |
| `gov.uk` | UK ETA £20; Standard Visitor £135 / £506 / £903 / £1,128 |
| any `*.usembassy.gov` mission site | US MRV $185, non-refundable, non-transferable, valid 365 days |
| `uk.usembassy.gov` ESTA page | ESTA $40 — **$10 from everyone, $30 only if approved** |
| `imigrasi.go.id` | Indonesia VoA Rp 500,000 |
| `visa2egypt.gov.eg/eVisa/FAQ` | Egypt $30 single / $65 multiple + the e-visa eligibility list |
| `eta.gov.lk` | Sri Lanka — free for 40 nationalities incl. India since 25 May 2026 |
| `thailand.prd.go.th` | Thailand's 2026 visa revision (effective 15 Sep 2026) |

---

## 10. Reading list for a new maintainer

1. **This file.**
2. `ARCHITECTURE.md` — especially §6, "Things that will bite you".
3. `src/lib/corridor.ts` — the types and every piece of reader-facing text logic.
4. `src/components/CorridorContent.astro` — the page itself.
5. `git log` — commit messages here explain *why*, with the quoted source. They are the real audit trail.
6. `BUILD_PLAN.md` — the original spec. Useful for intent; out of date on specifics.
