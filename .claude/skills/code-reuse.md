# Skill: code reuse search

Use before writing any new function, type, component, or constant.

## Procedure

1. **Name the capability** in a few keywords (e.g. "normalize url", "parse
   sitemap", "click depth", "canonical").
2. **Grep the repo** for those keywords and obvious synonyms:
   - `rg -i "<keyword>" src/` for identifiers/comments.
   - `rg -i "<keyword>" src/shared/` narrowed first — this is the intended
     reuse layer.
3. **Check by file**, in this order:
   - `src/shared/url.js` — URL normalization and site scoping (FR-02).
   - `src/shared/parse.js` — HTML, sitemap and robots.txt parsing; HTML
     entity decoding.
   - `src/shared/db.js` — every IndexedDB read and write, and the record
     shapes of `runs`, `pages`, `links`, `discovered`.
   - `src/background/frontier.js` — crawl order, page budget, per-URL
     discovery records (depth, sources, blocked, visited).
   - `src/background/crawler.js` — fetch loop and persistence; check whether
     logic here is really crawl-IO or belongs in a pure module.
   - UI folders (`src/popup/`, and the dashboard/content folders as they
     appear) — anything duplicated across two UIs moves to `src/shared/`.

   Add a file to this list when you create it.
4. **If found**: use it directly, or extend its signature/options rather
   than forking. If it's in the wrong place for the new use case (e.g. a
   popup-local hook now needed by options), promote it to `src/shared/` as
   part of this change.
5. **If not found**: confirm stdlib/native platform/already-installed deps
   don't cover it (see `.claude/rules/code-style.md`) before writing new
   code.

## Red flags that mean "stop and reuse instead"

- About to write a function whose name is a synonym of one that already
  exists (`cleanUrl` vs `normalizeUrl`, `getDepth` vs `clickDepth`).
- Copy-pasting a block from another file and changing one variable.
- Declaring a record shape (page, link, discovered URL, run) that already
  exists as the object `crawler.js` writes through `db.js`.
- Writing *any* second way to normalize, compare or key a URL. There is one
  (FR-02). See `.claude/rules/code-style.md` → "One implementation of the
  core primitives".
