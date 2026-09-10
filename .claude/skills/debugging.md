# Skill: debugging methodology

## 1. Reproduce first

Don't patch from a description alone. Find or write the minimal repro: a
failing check, a manual repro in the extension UI, a background service
worker log (`chrome://extensions` → "service worker" → DevTools), or — for
crawl bugs — the single URL that triggers it. If it can't be reproduced, say
so before proposing a fix.

Crawler bugs are usually data bugs. Before blaming the code, look at the
actual bytes: the raw HTML, the sitemap XML, the redirect chain, the stored
page record. Save the offending input somewhere you can re-run against it.

## 2. Find the root cause, not the symptom

- A bug report names a symptom (e.g. "this page shows as an orphan but it's
  linked from the nav"). Before editing, grep every caller of the function
  you're about to touch.
- Trace the actual data flow: UI action → message passing → background
  service worker → crawl queue → fetch → HTML extract → normalize → graph →
  IndexedDB → view. Find the first step where the data is already wrong; the
  bug is at or before that step, not in the view that displayed it.
- Suspect URL normalization early. One page appearing twice, a "missing"
  link, a wrong depth and a phantom orphan are all the same bug wearing
  different hats: two normalized keys for one page.
- If the same bug could occur in multiple call sites, fix it in the shared
  function all of them route through — one guard there beats one guard per
  caller.

## 3. Isolate

- Binary-search the flow: add a log/breakpoint at the midpoint, confirm
  which half is broken, repeat.
- Check MV3-specific gotchas first when relevant: service worker lifecycle
  (it can be evicted mid-crawl — don't assume in-memory state persists),
  async listener return values (`return true` for async `sendResponse`),
  permission/host_permissions mismatches (an un-granted optional host
  permission looks like a network failure).
- Check the site, not just the code: a 403/429 from bot protection, a
  redirect to a consent page, or JS-injected links absent from the raw HTML
  all look like crawler bugs and aren't.

## 4. Fix

- Fix at the root (see `.claude/rules/workflow.md` for diff-sizing).
- Don't silently swallow the error — surface it or handle it explicitly.

## 5. Verify and prevent regression

- Add a check that fails before the fix and passes after. No test runner is
  set up in this repo yet — if the fix needs one, propose it rather than
  fabricating a config file.
- For a crawl bug, keep the offending input (the URL, or the saved HTML) as
  the check's fixture. It's the cheapest regression test available.
- Note the root cause and fix in the task summary
  (`.claude/templates/task-summary.md`).
