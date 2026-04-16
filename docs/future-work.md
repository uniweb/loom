# Future work

Things left to do or to consider doing. Nothing here is blocking; each item is sized and has a reasonable workaround today. Roughly ordered by severity + impact.

## Real bugs to fix

### 1. `phone` / `address` / `email` formatters don't format bare strings

**Symptom.** `{SHOW contact.phone AS phone}` with `phone="1-613-444-5555"` renders as the raw input unchanged. The specialized formatters dispatch through the `Phone` / `Address` / `Email` creator classes, which expect structured objects with field mappings.

**Impact.** Medium for template authors. The docs honestly say "dispatches to the specialized formatter; expects a creator object."

**Note.** The currency case (`{SHOW price AS currency USD}`) was fixed — `formatNumber` now builds proper `Intl.NumberFormat` options when `flags.style` is `'currency'`, producing `$1,200.00` for a bare number. Phone, address, and email auto-wrapping is deferred because the semantics are less clear (what structure does `AS phone` infer from a bare string?).

**Where to fix.** `src/core/functions.js` — the individual creator classes at the bottom of the file (`PhoneNumber`, `Address`, `Email`). Each would need a detection-and-wrap path when the first argument is a scalar instead of a structured object.

**Risk.** Medium. Changes user-observable formatter output.

## Design gaps

### 2. `(! list)` opt-out via `-l` is inconsistent with mapper operators

**Symptom.** `(! -l xs)` opts out of the list-aware step-in and returns a scalar. Mapper operators like `+`, `-`, `=` use the same `-l` flag meaning "treat list as single value." But mappers are binary so the flag has a different nuance there (which arg is the "list" position?).

**Impact.** None yet — the behavior is correct, it's just a subtle inconsistency in flag semantics across categories. Worth a sentence in `language.md` under Option Flags explaining that `-l` means "don't step into the first list argument, wherever that lands for the function's category."

**Action.** One-paragraph doc addition. No code change.

## Doc improvements

### 7. Verify every `quick-guide.md` and `examples.md` example against the harness

The doc audit pass verified basics.md and the headline examples from quick-guide.md and examples.md, but there are still doc code blocks I haven't individually run through the harness. A mechanical sweep — extract every `{…}` code block from each file, plug it into a resolver with plausible data, compare against the claimed output — would catch any remaining drift.

Write a small `scripts/verify-doc-examples.js` that scans `docs/*.md` for fenced code blocks marked as Loom, runs each through `Loom.render` / `Loom.evaluateText`, and diffs against the `// → "…"` comment on the same or next line. Run it in CI.

### 8. `agents.md` or similar for the AI-prompt use case

`docs/ai-prompt.md` is the "paste-into-LLM" prompt. It covers the language but doesn't cover the *task* of generating Loom expressions from natural-language descriptions of report requirements. A second doc that walks through "here's how to prompt an LLM to convert a business requirement into a Loom template" — with a few worked examples — would be useful for the commercial platform's template-authoring UX.

Out of scope for the framework package itself; belongs under `kb/framework/` in the workspace.

### 9. A visible change log

No `CHANGELOG.md` at the package root. The April 2026 session made several breaking-ish semantic changes (`isEmpty`/`isFalsy` split, `!` / `!!` list-aware, Plain as default). A short CHANGELOG entry per commit, or a one-file summary keyed by version, would help downstream consumers (especially `@uniweb/press`, which depends on `@uniweb/loom`) understand what changed and when.

## Tests worth adding later

- **Locale-specific formatting.** `setLocale('fr-CA')` + a handful of date/number/currency templates, to confirm the `Intl.*` paths work end-to-end. Currently `tests/engine.test.js` tests English formatting only.
- **Round-trip serialization for creators.** `(currency -code=usd 1200)` → render → parse back. If Press is round-tripping content with Loom placeholders, this matters.
- **`$0` flag-bag with Plain-form arguments.** There's one `$0` test in `tests/plain/snippets.test.js` but it's a smoke check. A matrix of (Plain body with `$0`) × (Plain call-site flags) would catch any future regressions in flag propagation through the Plain translator.
- **Performance sanity check.** No benchmarks. A basic "render 10,000 CV-sized templates in under N seconds" test — as a smoke signal, not a strict budget — would catch catastrophic regressions in the tokenizer / parser / dispatcher hot paths.

## Meta: how this document should evolve

This file is a **rolling TODO, not a promise**. Items move out by being either (a) fixed and deleted, or (b) deliberately marked "won't fix" with a rationale. It's fine for items to sit here for a long time if the workaround is acceptable; it's not fine for items to rot with outdated information. When a fix lands, delete the corresponding section in the same commit so the file stays current.
