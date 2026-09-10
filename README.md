# SEO Silo Analyzer

A Chrome extension that crawls a site locally, builds its internal-link graph,
infers the SILO structure, and reports architecture problems — orphan pages,
deep pages, weak internal linking, potential silo leakage, canonical and
indexability issues, redirect chains and potential content overlap.

> Visualize your website's SEO silos, find broken architecture, discover
> orphan pages and improve internal linking.

No backend. No account. No external API. No mandatory AI. Crawl data stays in
the browser (IndexedDB).

**Status: specification / scaffold.** Nothing is implemented yet — the popup
and service worker are placeholders so the extension loads. Scope, feature IDs
and acceptance criteria live in [REQUIREMENTS.md](REQUIREMENTS.md).

## Install (development)

1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder

There is no build step yet; the folder loads as-is.

## Permissions

Requested at install:

| Permission | Why |
|------------|-----|
| `storage` | Extension settings and crawl-run metadata (`chrome.storage`). |
| `unlimitedStorage` | Crawl data for 1,000+ URL sites is stored in IndexedDB; without this the extension shares the default quota. Chrome documents this permission as covering IndexedDB. |
| `activeTab` | Read the current tab's URL to pre-fill the audit target, and act on that tab after a user gesture. |
| `scripting` | Inject the DOM extractor and the on-page issue highlighter (FR-19). |

Requested at runtime, per site, when an audit starts:

| Permission | Why |
|------------|-----|
| `optional_host_permissions: *://*/*` | Crawling means fetching pages of the site being audited, which is cross-origin. This is declared **optional** so nothing is granted at install — the user approves the specific origin they asked to audit. |

Not requested: `tabs`, `webNavigation`, `debugger`, `alarms`, `cookies`,
`history`. If a feature later needs one, it gets added with a justification —
never speculatively.

## Layout

```
manifest.json          MV3 manifest
REQUIREMENTS.md        scope, feature IDs (FR-01…FR-21), acceptance criteria
assets/icons/          extension icons (16/32/48/128)
assets/fonts/          Inter, Plus Jakarta Sans
src/background/        service worker — crawl orchestration
src/popup/             toolbar popup
docs/                  design docs (architecture, algorithms, schema)
```

## Known limitations

These are inherent to running inside a browser extension and are documented
rather than hidden:

- **Cross-origin fetches** require host permission for the audited origin.
- **SPA / JS-rendered sites**: a raw `fetch` returns pre-render HTML, so links
  injected by JavaScript can be missed. Rendered-DOM crawling is slower and is
  an open design decision (see REQUIREMENTS.md §10).
- **Cross-origin iframes** and **closed shadow DOM** cannot be read or
  highlighted.
- **MV3 service workers are evicted** when idle, so long crawls must persist
  progress incrementally.
- **robots.txt and crawl rate**: the crawler is deliberately conservative. It
  is a client-side crawler and is subject to the target site's rate limiting,
  WAF and bot protection.

## What this is not

It is not a title/meta/H1 toolbar, it does not reproduce Google PageRank
(the "Internal Link Strength" metric is a documented site-internal measure),
and content overlap is reported as *potential* overlap — not a definitive
keyword-cannibalization verdict.
