# Code style: reuse before writing

## Before writing any function, component, or type

1. Search first. Grep for the capability by name and by likely synonyms
   (e.g. "normalize", "url", "crawl", "depth", "silo", "canonical") before
   assuming it doesn't exist.
2. Check `src/shared/utils/`, `src/shared/services/`, `src/shared/types/`,
   `src/shared/constants/` — this is the designated reuse layer for this repo.
3. Check sibling feature folders under `src/` (`src/popup/`,
   `src/background/`, and the UI/content folders as they appear) for a local
   helper that should be promoted to `src/shared/` instead of duplicated.

Most of `src/` doesn't exist yet — the repo is at spec stage. That is not a
licence to skip the search; it means the search is cheap. Don't cite a path
from this file as if it exists without looking.
4. Only write new code when steps 1-3 come up empty. State in one line what
   you searched and why nothing matched.

## Reuse over rewrite

- Extending an existing function's signature beats writing a parallel one.
  A new optional param is a smaller diff than a new file.
- If a near-duplicate exists, unify it (extract shared logic, call from both
  sites) instead of adding a third variant. Do this in the same change, not
  as a follow-up.
- Match the file's existing patterns (naming, error handling, import style)
  over introducing a new convention, even a "better" one — consistency
  within a module beats local optimality.

## One implementation of the core primitives

These are the things this codebase will be tempted to reimplement. Each gets
exactly one implementation, in `src/shared/`, and every caller uses it:

- **URL normalization** (FR-02). Every comparison, dedupe, graph key and
  storage key goes through it. A second "quick normalize" anywhere is a bug —
  it silently splits one page into two nodes.
- **Page/link/issue records** — one type each, matching the IndexedDB schema
  (FR-21). Don't declare a narrower local shape for a view.
- **HTML parsing** — one extractor produces the page record (title, headings,
  links, canonical, meta robots, schema). Views read that record; they don't
  re-parse HTML.
- **Issue creation** — one constructor with a severity from FR-17, so the
  dashboard counts and the export can't disagree.

## Anti-redundancy checklist (apply before finishing any edit)

- [ ] Did I duplicate a function/type that already exists?
- [ ] Could this new helper live in `src/shared/` for reuse instead of
      locally?
- [ ] Did I leave the old code path dead, or actually remove it?
- [ ] Is there now more than one way to do the same thing in this repo?

If any box fails, fix it before calling the task done.
