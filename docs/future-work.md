# Future work

Things left to do or to consider doing, surfaced during the April 2026 doc rewrite and the subsequent `!` / `!!` / `formatList` / tokenizer fixes. Nothing here is blocking; each item is sized and has a reasonable workaround today. Roughly ordered by severity + impact.

## Real bugs to fix

### 1. `>>` sort ignores the `-by=field` flag

**Symptom.** `(>> -by=year pubs)`, `(>> -by=rank pubs)`, `(>> -by=title pubs)` all return the same order: alphabetical on the first string-like column. The `-by` flag is consumed but not used to pick the sort key.

**Impact.** Plain's `SORTED BY year` / `FROM HIGHEST TO LOWEST date` currently "work" only when alphabetical order on the displayed field coincides with the intended ordering. Users will notice the first time their data has a counter-example. Documented as Known Limitation #1 in `language.md`, with the workaround "pre-sort in JS before handing to `render()`."

**Where to fix.** `sortValues` / `applySorter` in `src/core/functions.js`. The function name is `sortValues` (search for it). It needs to honor `flags.by` as a property accessor on each object argument, falling back to the current "first string-ish property" heuristic only when `-by` is absent.

**Risk.** Moderate. Some existing tests may rely on the current (broken) behavior through data-shape coincidence. Audit `tests/engine.test.js` and `tests/plain/engine.test.js` for every `>>` / `SORTED BY` test and construct data sets where the sort field disagrees with alphabetical order — those are the ones that might flip.

**Follow-up enables.** Once fixed, the `SORTED BY` examples in `basics.md`, `quick-guide.md`, and `examples.md` can drop the implicit "this only works because the data happens to align" caveat.

### 2. Plain grammar has no parenthesized boolean expressions in `WHERE`

**Symptom.** `{SHOW pubs.title WHERE NOT (draft OR archived)}` fails at the parser with "Expected rparen, got operator:|". The parser's condition grammar handles `AND` / `OR` / `NOT` on bare identifiers but doesn't recursively descend into `(…)` groups.

**Impact.** Low — de Morgan's law gives an equivalent flat-form workaround (`WHERE NOT draft AND NOT archived`), documented in Known Limitations #3. But the grouped form reads more naturally and users will occasionally try it.

**Where to fix.** `src/plain/parser.js`, specifically the `parseCondition` / `parseBoolExpression` path (grep for the `&` / `|` handling). Add a `parsePrimary` level that accepts `( boolExpr )` as a parenthesized sub-expression. Should be a ~20-line addition.

**Risk.** Low — scoped to the condition grammar.

### 3. `currency` / `phone` / `address` / `email` formatters don't format bare strings

**Symptom.** `{SHOW price AS currency USD}` with `price=1200` renders as `"1,200"` (locale-grouped number, no `$` symbol, no decimals). `{SHOW contact.phone AS phone}` with `phone="1-613-444-5555"` renders as the raw input unchanged. The specialized formatters dispatch through the `Currency` / `Phone` / `Address` / `Email` creator classes, which expect their corresponding creator objects.

**Impact.** Medium-high for template authors. The docs now honestly say "dispatches to the specialized formatter; expects a creator object," but the natural expectation is that `AS currency USD` on a number produces `"$1,200.00"`.

**Design question.** Two plausible fixes:

- **(A) Make bare values auto-wrap.** When `# -currency=USD <scalar>` is called, implicitly wrap the scalar in a `Currency` creator with the flag's code. Similarly for phone/address/email — infer structure from the flag. Makes the Plain-form example "just work" but adds implicit type coercion that can surprise edge cases (what happens with `AS currency USD` on a string, on null, on a list?).

- **(B) Add an `AS currency=USD <value>` shortcut in Plain** that compiles to `(# -currency=usd (currency -code=usd <value>))`. Opt-in, explicit, no surprises — but more ceremony.

Pick one and commit to it. If undecided, (A) is closer to user intuition and tests well on simple inputs.

**Where to fix.** `src/core/functions.js` — `formatValue` dispatch or the individual creator classes at the bottom of the file. `Currency` is around line 2540; the dispatch via `flags.type` happens earlier.

**Risk.** Medium. Changes user-observable formatter output. Audit the existing Currency / Phone tests (if any) and the `@uniweb/press` consumer at workspace level to make sure nothing relies on the current pass-through.

## Design gaps

### 4. `evaluateText('(expr)')` returns a string via the `+:` join path

**Symptom.** `loom.evaluateText('+ 1 2')` returns the number `3`. `loom.evaluateText('(+ 1 2)')` returns the string `"3"`. The outer parens route the expression through `parseFunction`'s default-to-`+:` branch, which treats it as "join this thing with a separator" and stringifies.

**Impact.** Very low. The README, basics, quick-guide, examples, and language.md all show `evaluateText` examples without outer parens — that's the idiomatic form. But a user reading a Compact-form tutorial that wraps expressions in `(...)` may be confused when `evaluateText` returns a string instead of a number.

**Fix options.**
- Detect a single top-level `(…)` enclosure in `evaluateText` and strip it before dispatching.
- Accept the current behavior as "bare form only; outer parens are a render-path convention" and add a short note to `language.md`.

**Risk of fix.** Negligible — the strip is a localized change in `evaluateText`, and there are no tests that rely on `(expr)` returning a string.

### 5. 4-digit integer locale grouping

**Symptom.** `{year}` with `year=2020` renders as `"2,020"`. Loom's default number formatter applies locale grouping regardless of the numeric magnitude.

**Impact.** Surfaces constantly when rendering year columns from databases. A common gotcha on first use.

**Fix options.**
- Skip grouping for 4-digit integers in the default render path. Simple one-liner, but introduces a magic cutoff.
- Add a `-no-group` flag and document it. Explicit, no magic.
- Add a format type `year` that suppresses grouping: `{SHOW year AS year}`. Semantically honest but adds a format type for a narrow case.
- Document the gotcha only (current state). Works but doesn't fix the surprise.

The last option is what `examples.md` does today. Worth revisiting if user reports of the confusion accumulate.

### 6. `(! list)` opt-out via `-l` is inconsistent with mapper operators

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
