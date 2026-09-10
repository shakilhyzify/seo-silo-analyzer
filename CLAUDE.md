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

Spec + scaffold. `manifest.json` and the icons are real; `src/popup/popup.html`
and `src/background/service-worker.js` are placeholders that exist so the
extension loads unpacked. Nothing else is implemented.

**Not yet decided — don't assume, don't invent:**

- Build tooling and framework (no `package.json`, no bundler, no React/Vue/TS
  decision). Plain JS + no build step is the current default by absence.
- Test runner. None. Don't reference one or write a config for one unasked.
- The open questions in `REQUIREMENTS.md` §10 — including the big one:
  fetch-only vs. rendered crawling.

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
REQUIREMENTS.md        scope contract
README.md              install, permissions table, known limitations
assets/icons/          16/32/48/128 PNGs
assets/fonts/          Inter, Plus Jakarta Sans
src/background/        service worker — crawl orchestration (placeholder)
src/popup/             toolbar popup (placeholder)
src/shared/            intended reuse layer — types, utils, services,
                       constants. Does not exist yet. Check here FIRST
                       before writing anything new.
docs/                  design docs, written when a thing is designed
```

Paths under `src/` beyond the two placeholders are *intended*, not present.
Verify before citing one.

## The things that will bite

- **URL normalization is one function** (FR-02). A second one silently splits
  one page into two graph nodes, which surfaces as a phantom orphan, a wrong
  click depth and a missing link. See `.claude/rules/code-style.md` → "One
  implementation of the core primitives".
- **Crawled HTML is untrusted third-party input.** Never inject it as HTML,
  never `eval` a page's JSON-LD.
- **The MV3 service worker gets evicted mid-crawl.** Persist progress
  incrementally; don't hold a crawl in memory.
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
