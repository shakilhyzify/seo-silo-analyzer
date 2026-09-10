# Skill: code reuse search

Use before writing any new function, type, component, or constant.

## Procedure

1. **Name the capability** in a few keywords (e.g. "normalize url", "parse
   sitemap", "click depth", "canonical").
2. **Grep the repo** for those keywords and obvious synonyms:
   - `rg -i "<keyword>" src/` for identifiers/comments.
   - `rg -i "<keyword>" src/shared/` narrowed first — this is the intended
     reuse layer.
3. **Check by directory role**, in this order:
   - `src/shared/types/` — does a type already describe this shape?
     (page, link, issue, silo, crawl run — see FR-21.)
   - `src/shared/utils/` — pure helpers (URL normalization, parsing,
     validation, graph math).
   - `src/shared/services/` — stateful/storage/chrome-API wrappers
     (IndexedDB access, settings, permission requests).
   - `src/shared/constants/` — magic strings/numbers already named
     (tracking-param list, severity levels, depth thresholds).
   - `src/background/` — crawl orchestration; check whether the logic is
     actually crawl-specific or generalizes into `src/shared/`.
   - UI folders (`src/popup/`, and the dashboard/content folders as they
     appear) — UI-specific code; anything duplicated across two UIs moves to
     `src/shared/`.

   Most of these don't exist yet. Verify a path before citing it.
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
- Writing a type that structurally matches one in `src/shared/types/`.
- Writing *any* second way to normalize, compare or key a URL. There is one
  (FR-02). See `.claude/rules/code-style.md` → "One implementation of the
  core primitives".
