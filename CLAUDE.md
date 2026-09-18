# SEO Silo Analyzer — Claude workspace instructions

A Manifest V3 Chrome extension that crawls a site locally, builds its
internal-link graph, infers the SILO structure, and reports architecture
problems (orphan pages, deep pages, weak internal linking, potential silo
leakage, canonical/indexability issues, redirect chains, potential content
overlap).

**No backend, no account, no external API, no mandatory AI.** All crawling and
analysis happens in the browser; data lives in IndexedDB. That constraint is
the product, not an implementation detail — see NG-2…NG-4 in `REQUIREMENTS.md`.

## Current state

**FR-01 (crawler) is implemented** and has been run against a real site.
Everything after it — silos, orphans, scoring, dashboard, export — is not.
The popup's Export and Open Dashboard buttons are deliberately disabled until
their FRs exist.

**Decided** (recorded in `REQUIREMENTS.md` §10):

- Plain JS ES modules, no bundler, no build step — loads unpacked as-is.
- Tests: `npm test` runs Node's built-in runner over `tests/`. No framework, no
  dependencies; `package.json` exists only for `"type": "module"` and that script.
- Crawling is fetch-only: raw HTML, regex-parsed (service workers have no DOM).

**Still open — don't assume, don't invent:** the UI framework and the FR-04
graph library (§10.7), and the rest of §10.

## Read order

1. This file — auto-loaded as project memory.
2. `REQUIREMENTS.md` — the product spec, with feature IDs (FR-01…FR-21), hard
   non-goals (NG-1…NG-7) and open questions (§10). Read it when the task maps
   to a feature. Every feature/UI/logic decision must trace back to a line in
   it; nothing outside it gets built speculatively.
3. `.claude/rules/` — always active, non-negotiable.
4. `.claude/skills/` — load the relevant one when the task matches it.

## Layout

```
manifest.json          MV3 manifest — permissions justified in README.md
package.json           "type": "module" + `npm test`. No dependencies.
REQUIREMENTS.md        scope contract
README.md              install, permissions table, known limitations
assets/icons/          16/32/48/128 PNGs
assets/fonts/          Inter, Plus Jakarta Sans
src/background/        service-worker.js — message router
                       crawler.js — fetch loop, discovery, persistence (IO)
                       frontier.js — PURE: crawl order, page budget, discovery records
src/shared/            the reuse layer — check here FIRST before writing anything:
                       url.js (FR-02 normalization), parse.js (HTML/sitemap/
                       robots, entity decoding), db.js (all IndexedDB access)
src/popup/             toolbar popup
src/styles/            theme.css (tokens, buttons), popup.css
tests/                 crawler.test.mjs — covers the pure modules only
docs/                  design docs, written when a thing is designed
```

Logic that decides anything lives in a pure module (no `chrome.*`, no
IndexedDB) so Node can test it. Keep it that way: when new logic needs a
test, extract it the way `frontier.js` was extracted — don't mock chrome.

## The things that will bite

- **URL normalization is one function** (FR-02). A second one silently splits
  one page into two graph nodes, which surfaces as a phantom orphan, a wrong
  click depth and a missing link. See `.claude/rules/code-style.md` → "One
  implementation of the core primitives".
- **Crawled HTML is untrusted third-party input.** Never inject it as HTML,
  never `eval` a page's JSON-LD.
- **The MV3 service worker gets evicted mid-crawl.** Persist progress
  incrementally; don't hold a crawl in memory.
- **A capped crawl is not a complete crawl.** Runs end `complete`,
  `page-limit` or `stopped`. Anything reasoning about the whole site (orphans,
  depth, silos) must check it — on a `page-limit` run most sitemap URLs are
  simply uncrawled, not orphaned.
- **Unit tests passing ≠ the crawler works.** All 12 original tests passed on
  a crawler that, on its first real site, never fetched the site's navigation
  pages. Crawl behaviour gets checked against a live site's actual robots.txt,
  sitemap and HTML before it's called done.
- **Don't claim what Google does.** The product reports site-architecture
  facts. Not PageRank (NG-5), not confirmed cannibalization (NG-6), and
  cross-silo links are *potential* leaks, not errors (NG-7).
- **Permissions stay minimal.** Host access is optional and requested
  per-site at audit time. Changing `manifest.json` means updating the
  permission table in `README.md` in the same change.

## Rules (always loaded, non-negotiable)

@.claude/rules/code-style.md
@.claude/rules/workflow.md
@.claude/rules/guardrails.md
