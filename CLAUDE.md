# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`@uniweb/loom` is a package in the framework scope — see `../CLAUDE.md` for scope-level context (public repo boundary, ESM/no-TS conventions, publishing via `pnpm framework:publish:*`).

## What Loom is

A small expression language for weaving data into text. Two modes share one syntax, variable model, and standard library:

- `loom.render(template, vars)` — finds every `{…}` in a string, evaluates each, returns a string.
- `loom.evaluateText(expr, vars)` — evaluates a single expression and returns any type (number, boolean, array, object).

Pure JavaScript, **zero runtime dependencies**, works in Node and the browser. Polish-notation syntax: function token first, args follow. A literal string as the first token is shorthand for "join with this separator." Ported from an internal "unilang" mini-language used in production for academic reporting since ~2018.

## Commands

```bash
pnpm test              # vitest run — full suite (223 tests)
pnpm test:watch        # vitest in watch mode
pnpm vitest run tests/plain/parser.test.js    # run one file
pnpm vitest run -t "sorting"                  # run tests matching a name
```

No build step — source is published directly. No lint script. Uses `@uniweb/*` framework conventions (no semicolons / single quotes) but `core/engine.js` and `core/functions.js` currently have semicolons (legacy carryover from unilang).

## Package layout

Two subpath exports:

| Export | Entry | What it is |
|---|---|---|
| `@uniweb/loom` | `src/index.js` → `src/engine.js` | `Loom` class — the Plain-enabled front door. Accepts both Plain form (`SHOW … WHERE … SORTED BY …`) and Compact form (Polish notation). Translates Plain to Compact at parse time, then delegates to the core. |
| `@uniweb/loom/core` | `src/core/index.js` → `src/core/engine.js` | `LoomCore` class — the raw symbolic engine. Accepts only Compact form. Use this to skip the Plain parser or to avoid Plain-keyword shadowing of variable names. |

Loom is one language with two surface forms. Plain form is the default; Compact form is always available and can be mixed into Plain templates via the `{…}` passthrough. The two forms parse to the same internal representation.

## Core architecture

```
Template string
    │
    ▼
core/tokenizer.js  ──  findEnclosures()    extracts {…} / (…) regions
                       parseCommands()     Polish-notation tokenization
                       parseSnippets()     [name args] { body } definitions
    │
    ▼
core/engine.js  ──  LoomCore.render / LoomCore.evaluateText
                    - variable resolution (function or object)
                    - snippet dispatch
                    - custom function dispatch
                    - recursion into nested enclosures
    │
    ▼
core/functions.js  ──  the standard library (~80 functions, 2600+ lines)
                       categories: accessor, creator, collector, filter,
                       formatter, joiner, mapper, sorter, switcher, unary
                       + getProperty() for dot-path variable lookup
                       + isEmpty() / isFalsy() / castAs() helpers
```

**`src/core/functions.js` is by far the largest file** and holds the standard library (sort `>>`, filter `&`/`|`, aggregate `++`, format `#`, ternary `?`, logical NOT `!` / `!!`, etc.). Most feature work on Loom itself is either adding a function here or tweaking dispatch/tokenization in `core/engine.js` / `core/tokenizer.js`.

Each function category has a dedicated `applyX` dispatcher that knows how to step into lists for that category's semantics. Adding a new function means picking the right category — dispatch behavior comes for free. If a function doesn't fit cleanly into an existing category (like `!` / `!!` didn't), add a new category with its own dispatcher rather than forcing it into a near-fit. See commit `1ca12d1` for how the `unary` category was carved out — moving `!` / `!!` from `formatter` (wrong semantics) to their own category (correct semantics) was a small, contained change with a clear test-driven story.

### Plain layer (`src/engine.js` + `src/plain/`)

```
Plain template string
    │
    ▼
plain/tokenizer.js    keyword-aware tokenization (SHOW, WHERE, SORTED BY, …)
    │
    ▼
plain/parser.js       builds an AST for Plain clauses; falls through to
                      raw Compact form when input doesn't match a Plain
                      pattern
    │
    ▼
plain/translator.js   AST → Compact expression string
    │
    ▼
engine.js (Loom)      owns a private LoomCore instance; translates each
                      {…} placeholder / expression through the Plain
                      pipeline, then delegates to core.render /
                      core.evaluateText. Also pre-translates snippet
                      bodies at construction time.
```

Keyword casing: ALL CAPS is the stable contract; lowercase is SQL-style convenience. The tokenizer emits plain `word` tokens without pre-classifying them as keywords vs identifiers — the parser decides based on grammar position via `matchKeywordAt`. This is position-aware keyword matching: keywords only "win" at grammar positions that accept them, so user variables and functions sharing names with Plain keywords (`count`, `show`, `where`, etc.) work in any value position. The only residual collision is a custom function registered under a single-word construct keyword (`show`, `if`) — the grammar sees that word as the construct verb at placeholder start. Multi-word prefixes (`count of`, `total of`) have no collision. See commit `312027b` for the refactor and the `plain engine — keyword shadowing` test block for the locked-in cases.

## Key invariants

- **Public API shape is stable.** `loom.render`, `loom.evaluateText`, constructor signature (`new Loom(snippets?, customFunctions?)`), snippet definition format, and custom function registration (`(flags, ...args) => value`) must not change without a deliberate major-version plan.
- **Zero runtime dependencies.** Don't introduce any. `vitest` is the only devDependency.
- **ESM only, Node ≥ 20.19, browser-compatible.** No Node-only APIs in `src/`.
- **Snippet bodies defined in braces `{ … }`** render as text templates; bodies in parens `( … )` are expression-mode (evaluated directly, useful for reusable data-transformation helpers).
- **Variables can be a function `(key) => value` or a plain object** — both shapes are supported everywhere; the engine normalizes via `getProperty()`.

## Plan state (see `docs/plan-plain-as-default.md`)

The original Plain-as-default plan is fully landed:

1. **Plain-enabled default export.** ✅ `@uniweb/loom` exports `Loom`; `@uniweb/loom/core` exports `LoomCore`.
2. **Snippet bodies translated at construction time.** ✅ See `src/engine.js` `_prepareSnippets`.
3. **`isEmpty` (structural) vs `isFalsy` (Python-style truthiness) split.** ✅ `src/core/functions.js` has both. Joins and the wrap formatter use `isEmpty`; `!`, `!!`, `&`, `|`, `?`, `??`, `++!!`, and `castAs(… 'boolean')` use `isFalsy`. `formatList` was updated post-plan to use `isEmpty` too — the plan's call-site audit missed it. See commit `1ca12d1`.
4. **Position-aware keyword matching.** ✅ Landed in commit `312027b`. User variables can shadow Plain keywords in any value position.

**Post-plan fixes (April 2026 doc-audit session, commit `1ca12d1`):**

- **`!` / `!!` restored to list-aware.** The initial extraction had them in the `formatter` category, where `applyFormatter`'s single-list-arg short-circuit silently turned them scalar. Moving them to a new `unary` category with its own `applyUnary` dispatcher restored the original unilang behavior. `-l` is the uniform opt-out. Tests live in `tests/engine.test.js` under the `logical` describe block and in `tests/plain/engine.test.js` under `plain engine — WHERE NOT`.
- **`formatList` structural emptiness.** Bare JS truthiness was dropping `0`, `false`, and `"0"` from rendered lists. Fixed to use `isEmpty`, matching the plan's intent for join semantics.
- **Plain tokenizer fallthrough.** Unknown characters (`#`, `~`, `^`, `\`, `<>`) were being silently dropped, occasionally producing tokens that parsed as valid Plain and corrupted the expression. They now emit `unknown` tokens that always cause parser rejection, which triggers the `translateExpression` catch-block and hands the original expression to LoomCore.

If touching snippet handling, truthiness semantics, the export surface, list dispatch, or the `formatter` vs `unary` vs `mapper` category split, read `plan-plain-as-default.md` first and keep changes consistent with it. When in doubt about categories, check how each category's `applyX` dispatcher handles step-in behavior before picking one for a new function.

## Known rough edges

See `docs/future-work.md` for the rolling TODO. The big ones worth keeping in mind during any related work:

- **`>>` sort ignores `-by=field`.** The flag is parsed but not used. `SORTED BY year` in Plain form works only when alphabetical order on the displayed field coincides with the intended ordering. Pre-existing; fix sketch in future-work doc.
- **Plain's `WHERE` clause has no parenthesized boolean groups.** `WHERE NOT (a OR b)` fails at the parser. Apply de Morgan's law (`WHERE NOT a AND NOT b`) as the workaround.
- **`AS currency USD` / `AS phone` on bare strings.** The specialized formatters expect creator objects; bare strings pass through unchanged. Docs honestly say "dispatches to the specialized formatter; expects a creator object" rather than claiming polished output. Deciding whether to auto-wrap bare values is open in future-work.

## Tests

- `tests/engine.test.js` — worked examples of each standard-library category via `LoomCore`; the canonical reference for how each function behaves. Uses `run()` / `evaluate()` helpers wired to `LoomCore` directly so the tests exercise Compact form without Plain-translation overhead.
- `tests/plain/{tokenizer,parser,translator,engine,snippets}.test.js` — the Plain surface layer, split by pipeline stage. `plain/engine.test.js` uses `Loom` (the Plain wrapper) and covers end-to-end templates including `WHERE NOT`, aggregation modifiers, keyword shadowing, and Compact-passthrough fallthrough.

Total: 223 tests across 6 files.

When adding a standard-library function, add a test case in `tests/engine.test.js` under the appropriate category — it doubles as documentation. When adding Plain-form syntax, add parser tests (shape of AST), translator tests (generated Compact expression), and end-to-end engine tests (full render output against realistic data).

## User-facing docs

All user-facing documentation lives under `docs/`:

- `docs/basics.md` — first long exposure, Plain-first.
- `docs/quick-guide.md` — 10-minute tour.
- `docs/language.md` — complete reference, both surface forms as equal citizens.
- `docs/examples.md` — worked examples organized by task.
- `docs/ai-prompt.md` — self-contained LLM prompt for generating Loom expressions from plain-English requirements.
- `docs/history.md` — origin story.
- `docs/README.md` — navigation index.

Internal planning / history docs (not user-facing):

- `docs/plan-plain-as-default.md` — the April 2026 design doc; kept for historical context.
- `docs/work-log-2026-04.md` — session log of the Plain-as-default landing.
- `docs/future-work.md` — rolling TODO of known rough edges and future improvements. **Update this file in the same commit as any fix that lands here, by deleting the corresponding section.**

When rewriting docs, run every claimed output through a harness before committing. The April 2026 session found inaccurate currency/phone/date-range output claims in the old docs because nobody had verified them end-to-end. Fabricated outputs erode trust fast — if you can't verify a specific output, soften the claim to describe what the formatter does rather than asserting a literal string.
