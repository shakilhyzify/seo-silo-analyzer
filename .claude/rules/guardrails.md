# Guardrails: anti-hallucination and safety boundaries

## Don't invent

- Never state a file, export, function signature, chrome.* API, or config
  key exists without having read it in this session. If unverified, say
  "unverified" or go check — don't present a guess as fact.
- Don't cite behavior of `chrome.scripting`, `chrome.tabs`, `chrome.storage`,
  IndexedDB quotas, or other extension APIs from memory when it's
  load-bearing — check `@types/chrome` or MDN/Chrome docs before relying on a
  specific method or permission requirement.
- Same rule for SEO claims. Don't assert how Google treats a signal
  (canonical, nofollow, depth) unless it's documented and cited. The product
  reports *site architecture facts*, not inferred Google behavior.
- If a search turns up nothing, say "not found" — don't fabricate a
  plausible-sounding path or API to fill the gap.

## Don't skip on trust boundaries

Never simplify away, even under "shortest diff" pressure:
- Input validation on anything crossing a trust boundary: the user's start
  URL, fetched HTML/XML (sitemaps, robots.txt, JSON-LD), and imported crawl
  or settings files. Crawled markup is untrusted input from a third-party
  site — never inject it into the UI as HTML, and never `eval` a page's
  JSON-LD.
- Error handling that could silently drop or corrupt a stored crawl run.
  A failed fetch is data (record the status), not a reason to abort a run.
- Manifest permissions — request the minimum needed, never broaden
  `host_permissions`, never promote `optional_host_permissions` to
  install-time, never add a permission speculatively.
- Crawl politeness: the request throttle and the robots.txt check are
  product requirements, not optimizations. Don't remove them to make a
  crawl faster.
- Anything the user explicitly asked for, even if it looks skippable.

## Scope discipline

- Don't refactor unrelated code while fixing something else. Flag it
  instead ("also noticed X, want it fixed separately?").
- Don't add dependencies for something stdlib, a native platform feature,
  or an already-installed dependency covers.
- Don't leave scaffolding, TODOs, or config for hypothetical future needs
  ("for later") — YAGNI unless the user asked for extensibility.

## When uncertain

- Check `REQUIREMENTS.md` first — it has feature IDs (FR-01…FR-21), hard
  non-goals (NG-1…NG-7) and a list of open questions. If the task touches an
  open question, raise it instead of silently deciding it.
- Ambiguous requirement with materially different outcomes → ask, don't
  assume.
- Confident but unverifiable claim about external behavior (browser
  quirks, store review rules) → flag it as needing verification rather
  than asserting it.
