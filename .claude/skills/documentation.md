# Skill: documentation guidelines

## Code comments

- Comment *why*, not *what* — the code already says what. Comment intent,
  trade-offs, or non-obvious constraints (browser quirks, MV3 lifecycle
  gotchas).
- Match the file's existing comment density. Don't add a comment block to a
  file that has none; don't leave a tricky bit of logic in a file that
  comments everything.
- Deliberate simplifications that cut a real corner get a `ponytail:`
  comment naming the ceiling and upgrade path, e.g.
  `// ponytail: in-memory cache, move to chrome.storage if it needs to
  survive worker eviction`.

## Public/shared APIs (`src/shared/**`)

- Anything exported from `src/shared/` gets a one-line doc comment: what it
  does, and any non-obvious constraint (e.g. "must run in background
  context only").
- Keep it to one or two lines. No JSDoc essays for a three-line helper.

## Project docs

- `REQUIREMENTS.md` is the scope contract. Implementing a feature doesn't
  change it; a scope *decision* does — when an open question in §10 gets
  answered, record the answer there.
- `README.md` must stay true about permissions and limitations. Changing
  `manifest.json` means updating the permission table in the same change.
- Design docs (crawler architecture, algorithms, IndexedDB schema) go in
  `docs/`, one file per topic, written when the thing is designed — not
  before.
- Don't create a new README per folder speculatively — only when a folder's
  purpose genuinely isn't obvious from its contents plus this file.
- There is no CHANGELOG yet. Add one when there's a release to describe.