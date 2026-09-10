<!--
Post-execution summary template. Fill in, delete unused sections, keep it
short — this is a factual report, not a narrative.
-->

## What changed

<!-- 1-3 lines: the outcome, not the process. -->

## Files touched

- `path/to/file` — added / edited / removed: why

## Reused vs. new

- Reused: `src/shared/...` (what, and why it fit)
- New: `path/to/new/file` (why nothing existing covered it)

## Skipped

- `[thing not done]` → add when `[condition]`

## Verified

State what you actually ran. "Not verified" is a valid entry; a claimed
check that never ran is not.

- Check run: <!-- what, and the result. No test runner exists yet — say so
     if the logic needs one. -->
- [ ] Manifest/icons touched → JSON parses, loads unpacked with no errors
- [ ] Any `chrome.*` API or permission claim checked against the docs

## Open questions / follow-ups

<!-- Only if something needs a decision or was flagged out of scope. -->
