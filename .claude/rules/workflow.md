# Workflow: execution protocol

Applies to any non-trivial task (more than a one-line fix).

## 1. Understand

- Read the request and the code it touches. Trace the real flow end to end
  (e.g. popup "Start audit" → background service worker → crawl queue →
  fetch → HTML extract → IndexedDB → view) before editing anything.
- Check whether the task maps to a feature ID in `REQUIREMENTS.md`. If it
  does, that entry's acceptance criteria are the definition of done.
- If the request is ambiguous or could mean two different things with
  different scope, ask — don't guess and build the wrong thing.

## 2. Locate before creating

- Run the reuse search from `code-style.md` (Read order + grep) for every
  function/type/component the task needs. Do this even if you're fairly
  sure — "a few files over" is the most common miss.
- Check `.claude/skills/code-reuse.md` for the search procedure if unsure
  where to look.

## 3. Plan the smallest correct change

- Pick the smallest diff that is still correct (see guardrails.md for what
  "correct" must never skip: validation, error handling, security).
- Multi-file or architecturally significant change → use plan mode first.
- Trivial fix (typo, off-by-one, obvious null check) → just do it.

## 4. Implement

- Edit existing files over creating new ones. New file only when nothing
  existing is a reasonable home.
- Match surrounding code: naming, comment density, idiom.

## 5. Verify

`npm test` runs Node's built-in test runner over `tests/`. There is no build
step. Verify with what actually exists:

- Non-trivial logic (URL normalization, crawl frontier, HTML/sitemap parser,
  depth/graph traversal, scoring) gets **one runnable check** in `tests/` —
  the smallest thing that fails if the logic breaks. Code that touches
  `chrome.*` or IndexedDB can't run under Node: keep the deciding logic in a
  pure module (like `src/background/frontier.js`) and test that, rather than
  mocking chrome.
- Crawl behaviour that only shows up on a real site — ordering under a page
  cap, sitemap volume, entity-encoded URLs — gets checked against the live
  site's actual robots.txt, sitemap and HTML before concluding anything.
  Passing unit tests have already missed a crawler that skipped a site's
  entire navigation.
- If you touched `manifest.json` or icons: load unpacked at
  `chrome://extensions` and confirm zero manifest errors. Validate the JSON
  parses before claiming it works.
- Verify any `chrome.*` API or permission claim against the docs, not memory
  (`.claude/rules/guardrails.md`).
- Report what you actually ran. "Not verified" is an acceptable answer;
  a claimed passing test that never ran is not.