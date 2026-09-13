# InfoOnVisa — Project Memory & Handover

Everything a new person needs to pick this up and work on it without guessing.
Read `ARCHITECTURE.md` for *how it is built*; this file is *what state it is in, why it is that way, and what to do next*.

**Last updated:** 14 September 2026
**Owner:** Akash Jaiswal (akash@cuddlesfoundation.com)
**Live:** https://infoonvisa.com

---

## 1. What this site is

A traveller picks **From country → To country** and gets one page answering: do I need a visa, what kind, how long can I stay, what does it cost, what documents, how to apply, what goes wrong.

The entire business rests on one thing: **the pages are right.** A visa site that is confidently wrong costs someone a flight, a fee, or a trip. It also fails AdSense review and gets deindexed. Accuracy is not a nice-to-have here; it *is* the product.

---

## 2. Current state (14 September 2026)

| | |
|---|---|
| Live corridor pages | **126** (`status = 'verified'`) |
| Awaiting review | 3 (`pending_review`) |
| Blog posts | 17 (all published) |
| Countries available | 198 |

**Verdict spread:** visa-free 58 · e-visa 26 · embassy 25 · eta 9 · voa 8

**Verdict accuracy audit:** ✅ **121 of 125 verified against official sources.** 4 left for the owner to check by hand (see §6).

**Visa fees:** **39 pages** carry a verified fee amount; 58 more are visa-free and say "None". **29 still unpriced.**

**Monetisation:** not yet applied to AdSense. This is the next milestone.

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

---

## 6. Open work, in priority order

### A. AdSense application — **the next milestone**

The groundwork is done: 126 verified pages, dated sources, a real blog, privacy/terms/contact/about pages, an audit trail. This is the recommended next session.

### B. 4 routes the owner must verify by hand

In `C:\Users\Akash\Downloads\verify-manually.md`, each with what the page claims and exactly what was tried:

| Route | The one thing needed |
|---|---|
| `india-to-saudi-arabia`, `pakistan-to-saudi-arabia` | Open `visa.visitsaudi.com`, start an application, pick India (then Pakistan). It will either offer the eVisa (**Group A**) or send you to an embassy (**Group B**). That one answer settles both pages |
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

> ⚠️ **The lesson that caused this:** the verdict issue used to be kept current by *editing its body*, and **GitHub does not notify anyone about an edited issue body**. It was opened on 24 Aug (that email arrived) and silently rewritten every week after, with 0 comments, while its body went stale. If a workflow needs to tell a human, it must **comment**.

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
