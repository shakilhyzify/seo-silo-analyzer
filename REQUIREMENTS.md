# SEO Silo Analyzer — Requirements

Structured requirements derived from `SEO_Silo_Analyzer_Developer_Spec.txt`.
That file is the source of truth for intent; this file is the source of truth
for scope, IDs and acceptance criteria.

- **Status:** specification — no implementation yet
- **Type:** Chrome Extension, Manifest V3, local-only
- **Last updated:** 2026-09-10

---

## 1. Product

### 1.1 Goal

A local SEO **site-architecture engine** for SEO professionals, agencies,
developers and site owners. It crawls a site from the browser, builds the
internal-link graph, infers the silo structure, and surfaces actionable
architecture problems.

Positioning line:

> "Visualize your website's SEO silos, find broken architecture, discover
> orphan pages and improve internal linking."

### 1.2 Questions the product must answer

1. How is this website structured?
2. What are my actual silos?
3. Which pages are orphaned?
4. Which pages are too deep?
5. Where is internal linking weak?
6. Where are potential silo leaks?
7. Which canonical / indexability problems exist?
8. Which pages potentially overlap?
9. How can I improve the site's architecture?

### 1.3 Non-goals (explicit)

| ID | Non-goal |
|----|----------|
| NG-1 | Not a basic SEO toolbar (title / meta / H1 checker). Those checks exist only as part of the architecture engine. |
| NG-2 | No backend, no server-side crawling, no hosted service. |
| NG-3 | No login, no account, no telemetry. |
| NG-4 | No mandatory AI and no external API in the core product. |
| NG-5 | Never claim to reproduce Google PageRank or Google's ranking algorithm. |
| NG-6 | Never claim to definitively detect keyword cannibalization — the feature is "Potential Content Overlap". |
| NG-7 | Cross-silo links are not automatically "bad"; they are reported as *potential* leakage only. |

### 1.4 Terminology

| Term | Meaning in this product |
|------|------------------------|
| **Silo** | An inferred topical cluster/branch of the site, derived from multiple signals (not just URL folders). |
| **Click depth** | Shortest number of internal-link hops from the homepage (home = 0). |
| **Orphan page** | A URL known from a non-link source (sitemap, canonical, etc.) with zero incoming internal links found during the crawl. |
| **Normalized URL** | The canonical internal key for a URL after normalization (FR-02). The original URL string is always preserved alongside it. |
| **Internal Link Strength** | A documented, deterministic site-internal link-distribution metric. Not PageRank. |
| **Crawl run** | One execution of the crawler against one site with one settings set; results are stored and reloadable. |

---

## 2. Technical constraints (hard)

| ID | Constraint |
|----|-----------|
| TC-01 | Chrome Extension, Manifest V3. |
| TC-02 | No backend of any kind. |
| TC-03 | No login / account. |
| TC-04 | No external API required for any core feature. |
| TC-05 | All processing local wherever technically possible. |
| TC-06 | Crawl data persisted in IndexedDB; settings in `chrome.storage`. |
| TC-07 | Architecture must allow an **optional** AI layer to be added later without the core depending on it. |
| TC-08 | Request the minimum Chrome permissions; each permission must have a written justification. |
| TC-09 | Must handle large sites (1,000+ URLs) without freezing the UI. |
| TC-10 | Must support SPA / dynamic sites where technically possible, and document where it is not. |
| TC-11 | Browser and security limitations must be documented in user-facing docs, not hidden. |

---

## 3. Phase 1 — MVP functional requirements

### FR-01 — Website crawler

**Input:** a start URL (e.g. `https://example.com`).

**Controls:**
- Start / stop audit
- Max pages: 100 / 500 / 1000 / custom
- Max crawl depth
- Include subdomains: yes/no
- Follow `nofollow` links: configurable

**URL discovery sources:**
- Internal `<a href>` links
- `sitemap.xml`
- Sitemap index files
- Canonical URLs
- Rendered DOM links
- Pagination, where detectable

**Behaviour:**
- Same-registrable-domain restriction by default
- Respect `robots.txt` where appropriate
- Conservative request rate (throttled, configurable ceiling)
- No duplicate fetches of the same normalized URL
- Fragments stripped; query parameters normalized (FR-02)
- HTTP/HTTPS and trailing-slash differences normalized
- Duplicate URLs detected and reported

**Acceptance:**
- A crawl of a 100-page site completes and every fetched URL is recorded with status, discovery source and depth.
- Re-running with the same settings does not re-fetch a URL twice within one run.
- Stopping mid-crawl leaves the partial run readable and clearly marked incomplete.

---

### FR-02 — URL normalization engine

Treat these as one page while preserving the original strings:

```
/page
/page/
/page?utm_source=x
/page#section
https://example.com/page
http://example.com/page
```

**Rules:**
- Lowercase scheme and host; strip default ports
- Drop fragment
- Normalize trailing slash consistently
- Strip known tracking params (utm_*, gclid, fbclid, …); keep meaningful params
- Sort remaining query params
- Collapse `http` → `https` when both resolve to the same page
- Store `normalizedUrl` (the key) **and** `originalUrl` (as found)

**Acceptance:** all six example URLs above map to one normalized key, and each
distinct original that was actually encountered is retained.

---

### FR-03 — Site architecture / silo detection

Build the real hierarchy from **multiple** signals — not URL folders alone.

**Signals:** URL path · breadcrumbs · navigation · internal links · anchor
text · headings · sitemap structure · page relationships.

**Per-page output:**
- Primary silo
- Secondary / related silo (if applicable)
- Click depth
- Parent relationship
- Child / related pages
- Incoming internal links
- Outgoing internal links

**Example structure:**

```
HOME
├── SHOES
│   ├── RUNNING SHOES
│   │   ├── NIKE
│   │   ├── ASICS
│   │   └── HOKA
│   └── HIKING SHOES
├── CLOTHING
└── BLOG
```

**Acceptance:** every crawled page is assigned exactly one primary silo (or an
explicit "unassigned" bucket), and the assignment is explainable — the UI can
show which signals produced it.

---

### FR-04 — Interactive silo visualization

Interactive graph with:
- Zoom, pan
- Search
- Click node → page detail (FR-18)
- Collapse / expand a silo
- Highlight connections of the selected node
- Filter by depth
- Filter by issue type

**Acceptance:** remains usable (pan/zoom without freezing) on a 1,000-node
graph.

---

### FR-05 — Internal link graph

**Per link edge, collect:**
- Source page, target page
- Anchor text
- Link location where feasible (nav / content / footer / sidebar)
- `nofollow`, `sponsored`, `ugc` rel values
- Internal vs external

**Per page, calculate:**
- Internal link count (in / out)
- Unique linking pages
- Click depth
- Link concentration
- Flag: very few incoming links
- Flag: very few outgoing links
- **Internal Link Strength** metric

**Acceptance:** the metric's formula is documented in-product; the UI never
calls it PageRank (NG-5).

---

### FR-06 — Orphan page detection

Compare URLs discovered per source.

```
Sitemap:                        1,000 URLs
Discovered via internal links:    943
Potential orphan pages:            57
```

**Per candidate show:** URL · in sitemap? · found via internal links? ·
incoming internal link count · other discovery sources.

**Acceptance:** a URL present in the sitemap with zero incoming internal links
appears in the orphan list with its discovery sources listed.

---

### FR-07 — Deep page detection

Click depth from homepage: `Home = 0`, category = 1, subcategory = 2,
product = 3, article = 5, …

Filter: "Show pages deeper than N clicks" (N configurable, default 4).

**Acceptance:** depth is the *shortest* internal-link path from home, not the
URL folder count.

---

### FR-08 — Silo leakage detector

Detect potentially unrelated cross-silo links.

```
RUNNING SHOES ──link──▶ LAPTOPS      →  "Potential cross-silo link"
```

- Reported as **potential**, never as a definite error (NG-7)
- User can mark a link as **"Allowed cross-silo link"**; the mark persists
  across crawl runs for that site

**Acceptance:** marking a link as allowed removes it from the report on the
next run without re-marking.

---

### FR-09 — Missing internal link opportunities

Identify related pages in the same silo with no direct link between them.

**Deterministic signals only:** shared URL terms · titles · headings ·
breadcrumbs · anchor text · category relationships.

```
Nike Running Shoes  ⇢  Running Shoe Guide
Reason: same silo · related page · no direct internal link
```

**Acceptance:** each suggestion lists the signals that produced it. No AI
involved.

---

### FR-10 — Canonical analysis

**Detect per page:** self canonical · cross-page canonical · cross-domain
canonical · missing canonical · multiple canonical tags.

**Flag:**
- Canonical → 301
- Canonical → 404
- Canonical → noindex page
- Canonical mismatch
- Canonical not in sitemap
- Canonical chain

---

### FR-11 — Indexability matrix

Per URL: HTTP status · indexability verdict · robots.txt state · meta robots ·
canonical · sitemap presence · click depth.

**Detect:** noindex · robots blocking · canonical conflicts · 3xx · 4xx · 5xx ·
sitemap inconsistencies.

**Acceptance:** the matrix is filterable and exportable (FR-20).

---

### FR-12 — Redirect analyzer

```
URL A ──301──▶ URL B ──301──▶ URL C ──200
```

**Detect:** redirect chains · redirect loops · redirect → 404 · redirect →
noindex · HTTP → HTTPS redirects · unnecessary redirects where detectable.

**Acceptance:** each chain is shown with every hop, its status code and the
final destination.

---

### FR-13 — Content structure analyzer

**Per page collect:** title · meta description · H1 · H2/H3 structure · word
count · images · ALT attributes · internal links · external links · schema.

**Detect:** missing title · duplicate titles · very long/short titles · missing
H1 · multiple H1 · heading hierarchy issues · missing ALT · very low visible
content · duplicate / near-duplicate content.

---

### FR-14 — Content / topic overlap

Local deterministic similarity from: title · URL · headings · visible text ·
anchor text.

```
Potential overlap:
  /best-running-shoes
  /top-running-shoes
  /running-shoes-guide
```

**Show:** similarity score · shared terms · pages involved.

**Naming:** the feature is called **"Potential Content Overlap"** (NG-6).

---

### FR-15 — Schema analyzer

**Detect:** JSON-LD · Microdata · RDFa. Show types and properties.

```
Article
├── headline
├── author
├── datePublished
└── image  ⚠ missing

BreadcrumbList
└── itemListElement
```

**Action:** "Copy JSON-LD" button.

---

### FR-16 — SEO health dashboard

```
SEO SILO ANALYZER

Overall Health: 84

Architecture        78
Internal Links      72
Indexability        91
Technical SEO       88
Content Structure   82
Schema              94

Critical: 12   Warnings: 34   Passed: 187
```

**Rule:** scores must come from transparent, documented rules. No arbitrary
weighting — every score must be traceable to the checks that produced it, and
the rule set must be viewable in-product.

---

### FR-17 — Issue prioritization

No undifferentiated dump of hundreds of errors.

| Severity | Includes |
|----------|----------|
| **Critical** | 404 pages · important pages set to noindex · canonical → 404 · serious crawl/indexability problems |
| **High** | Orphan pages · very deep pages · redirect chains · severe internal-link weaknesses |
| **Opportunities** | Potential internal-link opportunities · potential content overlap · weak silo connections |

---

### FR-18 — Page detail view

Fields: URL · status · click depth · primary silo · incoming links · outgoing
links · canonical · indexability · sitemap presence · title · H1 · schema.

Tabs: **Overview · Links · Silo · SEO · Schema · Technical**.

---

### FR-19 — Highlight problem on page

Clicking an issue (missing ALT, H1 problem, broken link, heading problem)
opens the page and highlights the actual element where technically possible.

```
SEO issue → click → open / highlight the real element
```

**Limitations must be surfaced to the user** where highlighting is not
possible (cross-origin iframes, closed shadow DOM, SPA re-renders, pages that
changed since the crawl).

---

### FR-20 — Export

**Formats:** CSV · JSON · HTML · PDF if practical.

**Report sections:** Executive Summary · Silo Architecture · Internal Linking ·
Orphan Pages · Deep Pages · Redirects · Canonical · Indexability · Content ·
Schema · Recommendations.

---

### FR-21 — Local database

IndexedDB. Suggested entities:

`sites` · `pages` · `links` · `crawl_runs` · `issues` · `silos` · `snapshots` ·
`settings`

**Acceptance:** the user can close Chrome, reopen it, and load a previous
crawl run with all views intact.

---

## 4. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | 1,000-URL crawl completes without the UI becoming unresponsive; heavy work off the UI thread. |
| NFR-02 | Crawl rate is conservative and throttled by default; the user can slow it further. |
| NFR-03 | Data is written incrementally so a crash or worker eviction does not lose the whole run. |
| NFR-04 | All analysis is deterministic — same crawl input, same output. |
| NFR-05 | No network requests to any host other than the site being audited. |
| NFR-06 | Every score, metric and issue is explainable in the UI (which rule fired, why). |
| NFR-07 | Keyboard-navigable UI and readable contrast; graph views need a non-graph (table) equivalent. |
| NFR-08 | Documented browser limitations reachable from the UI, not buried in a README. |

---

## 5. Phase 2

- Advanced silo leakage analysis
- Internal-link opportunity engine
- Content overlap improvements
- Schema validation improvements
- Redirect chain visualization
- More detailed element highlighting
- Better SPA rendering analysis
- Crawl comparison

## 6. Phase 3

- Website snapshots
- Before/after SEO comparison
- Silo planner
- Planned vs actual architecture
- Agency / client reporting
- Optional AI recommendations

## 7. AI policy

AI must **not** be required for the core product. The engine must work with no
OpenAI, Claude, Gemini, external AI API or backend.

Optional, later, and always additive: explain SEO issues · suggest silo
structure · suggest internal links · suggest content consolidation · generate
client-facing recommendations.

Crawl data, the graph, SEO checks and scoring stay deterministic and local
regardless of whether the AI layer is enabled.

---

## 8. Required Chrome/API research (before coding)

Investigate and document findings for:

- Manifest V3 limitations (service-worker lifetime, no persistent background)
- `tabs` API
- `scripting` API
- `webNavigation` API
- `debugger` / DevTools APIs — only where justified
- storage / IndexedDB quotas
- `alarms` — only if monitoring is added
- Cross-origin limitations (host permissions, CORS, opaque responses)
- iframe limitations
- Shadow DOM limitations
- SPA / dynamic rendering limitations

**Rule:** do not assume an extension can access everything on every website.
Anything asserted about a `chrome.*` API must be verified against
`@types/chrome` or official Chrome documentation before it is relied on.

---

## 9. Pre-coding deliverables

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Technical architecture | pending |
| 2 | Chrome permissions + reason for each | drafted in `README.md`; needs API verification |
| 3 | Crawler architecture | pending |
| 4 | URL normalization algorithm | pending |
| 5 | Silo detection algorithm | pending |
| 6 | Internal-link graph data model | pending |
| 7 | Orphan detection algorithm | pending |
| 8 | Click-depth calculation | pending |
| 9 | Canonical / indexability detection approach | pending |
| 10 | Content-overlap algorithm | pending |
| 11 | IndexedDB schema | pending |
| 12 | UI wireframe | pending |
| 13 | Performance strategy for 1,000+ URLs | pending |
| 14 | Known browser / security limitations | pending |
| 15 | MVP development plan | pending |

---

## 10. Open questions

These are genuine ambiguities in the source spec — they need answers before
the affected work starts.

1. **Fetch vs. render.** Crawling by `fetch` gives raw HTML (fast, cheap) but
   misses SPA-rendered links. Rendering each page in a tab is accurate but far
   slower. MVP default: fetch-first with an opt-in rendered pass? Needs a
   decision (affects FR-01, TC-10, NFR-01).
2. **Host permissions model.** Broad `*://*/*` at install (easy, worse for
   store review and trust) vs. per-site optional permission requested at audit
   start (recommended). Affects the manifest and onboarding UX.
3. **Similarity algorithm for FR-14.** Which deterministic method (shingling /
   Jaccard, TF-IDF cosine, SimHash) and what score threshold counts as
   "potential overlap"?
4. **Internal Link Strength formula.** Needs a concrete, documented formula
   (NG-5 rules out anything presented as PageRank).
5. **Scoring weights for FR-16.** The six category scores and the overall score
   need published weights and per-check point values.
6. **PDF export.** "If practical" — decide whether it ships in Phase 1 or
   defers to print-to-PDF from the HTML report.
7. **Build stack.** Undecided: plain JS with no build step (loads unpacked
   as-is, zero tooling) vs. TypeScript + a bundler (types for the graph/page
   models, at the cost of a build). Also undecided: UI framework, graph
   rendering library for FR-04, and test runner. Nothing in the repo assumes
   any of these yet.
