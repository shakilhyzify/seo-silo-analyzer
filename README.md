# SEO Silo Analyzer

A Chrome extension that crawls a site locally, builds its internal-link graph,
infers the SILO structure, and reports architecture problems — orphan pages,
deep pages, weak internal linking, potential silo leakage, canonical and
indexability issues, redirect chains and potential content overlap.

> Visualize your website's SEO silos, find broken architecture, discover
> orphan pages and improve internal linking.

No backend. No account. No external API. No mandatory AI. Crawl data stays in
the browser (IndexedDB).

**Status: FR-01 (crawler) implemented.** The crawl engine, URL normalization,
robots.txt handling, sitemap discovery and IndexedDB persistence work. Analysis
features (silos, orphans, scoring, export, dashboard) are not built yet. Scope,
feature IDs and acceptance criteria live in [REQUIREMENTS.md](REQUIREMENTS.md).

## Install (development)

1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder

There is no build step; the folder loads as-is (plain ES modules).

Run the checks with `npm test` — Node's built-in test runner, no dependencies.
Crawl output is inspectable while the analysis UI is being built: DevTools →
Application → IndexedDB → `silo-analyzer` (`runs`, `pages`, `links`,
`discovered`).

A run ends as `complete` (every reachable page crawled), `page-limit` (the
max-pages cap was hit with URLs left) or `stopped`. On a large site most runs
are `page-limit`: linked pages are crawled first, breadth-first, and
sitemap-only URLs fill whatever budget remains.

## Permissions

Requested at install:

| Permission | Why |
|------------|-----|
| `storage` | Extension settings and crawl-run metadata (`chrome.storage`). |
| `unlimitedStorage` | Crawl data for 1,000+ URL sites is stored in IndexedDB; without this the extension shares the default quota. Chrome documents this permission as covering IndexedDB. |
| `activeTab` | Read the current tab's URL to pre-fill the audit target, and act on that tab after a user gesture. |
| `scripting` | Inject the DOM extractor and the on-page issue highlighter (FR-19). |
| `webRequest` | Observation only. `fetch()` follows redirects and reports only the final URL, so this is the only way to record each hop of a redirect chain and its status code (FR-12). No request is blocked or modified — MV3 does not include `webRequestBlocking`. |
| `host_permissions: *://*/*` | Crawling means fetching pages of the site being audited, which is cross-origin. |

Not requested: `tabs`, `webNavigation`, `debugger`, `alarms`, `cookies`,
`history`. If a feature later needs one, it gets added with a justification —
never speculatively.

## Layout

```
manifest.json          MV3 manifest
REQUIREMENTS.md        scope, feature IDs (FR-01…FR-21), acceptance criteria
assets/icons/          extension icons (16/32/48/128)
assets/fonts/          Inter, Plus Jakarta Sans
src/background/        service-worker.js (message router), crawler.js (fetch
                       loop), frontier.js (crawl order + page budget, pure)
src/shared/            url.js (normalization), parse.js (HTML/sitemap/robots),
                       db.js (IndexedDB)
src/popup/             toolbar popup
src/styles/            theme + popup CSS
tests/                 node --test checks for the pure crawl logic
docs/                  design docs (architecture, algorithms, schema)
```

## Known limitations

These are inherent to running inside a browser extension and are documented
rather than hidden:

- **Cross-origin fetches** require host permission for the audited origin.
- **SPA / JS-rendered sites**: the crawler fetches raw HTML and does not
  execute JavaScript, so links injected at runtime are not discovered. On a
  client-rendered site the crawl will find far fewer pages than exist. This is
  the MVP's biggest known gap (REQUIREMENTS.md §10.1).
- **HTML is parsed with regex, not a DOM.** MV3 service workers have no
  `DOMParser`. It handles ordinary markup but can misread pathological HTML.
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
