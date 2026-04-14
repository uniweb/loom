# Loom & Plain — April 2026 Work Log

This document summarizes a single session of work on `@uniweb/loom` that landed the **Plain** natural-language layer, fixed two pre-existing Loom bugs discovered along the way, and filled gaps in snippet coverage. It's intended as a quick brief for anyone who wasn't in the room.

**TL;DR.** Loom now ships with a companion language called Plain that compiles English-like phrases to Loom's Polish notation. Plain works everywhere Loom expressions appear — templates, expressions, and snippet bodies — and is a strict superset, so any Loom expression is also valid Plain. Two Loom bugs were fixed as a side effect of building out the snippet story. The test suite grew from 42 to 164 tests, all passing.

---

## 1. Plain — the natural-language layer

Plain is a thin parsing/translation layer on top of Loom. It lets non-technical authors write template expressions using English-like phrasing:

```
{SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ', '}
```

which compiles to the equivalent Loom expression at parse time:

```
{+: ', ' (>> -desc -by=date (? publications.refereed publications.title))}
```

Plain isn't a separate engine — it's a transpiler. The `Plain` class wraps a private `Loom` instance, translates each expression it receives, then delegates to `Loom.render()` / `Loom.evaluateText()`. There's no new semantics, no separate runtime, and no performance tax for consumers who don't need it.

### Architecture

```
Plain input string
     │
     ▼
┌──────────────┐
│  Tokenizer   │  Case-insensitive keyword matching, multi-word
│              │  keyword handling, quoted strings, comma absorption
└──────┬───────┘
       │ tokens
       ▼
┌──────────────┐
│   Parser     │  Recursive descent, permissive ordering of modifier
│              │  clauses, fallback to raw Loom for unrecognized
│              │  patterns
└──────┬───────┘
       │ command AST
       ▼
┌──────────────┐
│  Translator  │  AST → Loom expression string
│              │  (single string per placeholder)
└──────┬───────┘
       │ Loom source
       ▼
┌──────────────┐
│   Loom       │  The existing @uniweb/loom engine
└──────────────┘
```

### File structure

```
packages/loom/
├── src/
│   └── plain/             ← NEW
│       ├── tokenizer.js   ← Plain tokenizer
│       ├── parser.js      ← Plain parser (recursive descent)
│       ├── translator.js  ← AST → Loom expression string
│       ├── engine.js      ← Plain class wraps Loom
│       └── index.js       ← subpath entry
└── tests/
    └── plain/             ← NEW
        ├── tokenizer.test.js
        ├── parser.test.js
        ├── translator.test.js
        ├── engine.test.js
        └── snippets.test.js
```

Plain ships as a **separate subpath export** at `@uniweb/loom/plain`. Consumers who don't import it don't load the parser bundle — the two-line `exports` entry in `package.json` keeps it opt-in:

```json
"exports": {
    ".": "./src/index.js",
    "./plain": "./src/plain/index.js"
}
```

### Supported surface

- **`SHOW`** (optional) — `{publication.title}` and `{SHOW publication.title}` are equivalent
- **`AS`** — `AS long date`, `AS currency USD`, `AS year only`, `AS phone`, `AS JSON`, etc.
- **`WITH LABEL`** — with or without a custom label string
- **`IF` / `OTHERWISE`** — `{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}` and the SQL-style `THEN`/`ELSE` variant
- **Trailing `IF` / `WHERE`** — list filtering (synonyms)
- **`SORTED BY`** — with `ASCENDING`/`DESCENDING`, plus the long forms `FROM LOWEST TO HIGHEST` and `FROM HIGHEST TO LOWEST`
- **`JOINED BY`** — custom separator
- **`TOTAL OF` / `SUM OF` / `AVERAGE OF` / `COUNT OF`** — aggregation verbs
- **`COUNT OF ... WHERE ...`** — filtered count
- Case-insensitive keywords, optional commas, permissive modifier ordering
- Compound conditions via `AND` / `OR` / `NOT` (or `&&` / `||` / `!`)
- Raw Loom passthrough for any sub-expression Plain can't parse

### Tutorial and reference

A full tutorial lives at [`docs/plain.md`](./plain.md) with worked examples, the complete translation table, and a section on snippets. The top-level `README.md` links to it, and `docs/basics.md` mentions it in "Next steps".

---

## 2. Plain in snippets — the deep integration

The first cut of Plain ran into a wall: snippet bodies bypassed translation entirely. A user who wrote

```js
new Plain(`
    [refereedList] { SHOW publications.title WHERE refereed }
`)
```

would get partially-working behavior — Loom's own `parseCommands` happens to recognize `show` and `if` as sugar at the start of a placeholder — but `WHERE`, `SORTED BY`, `COUNT OF`, `FROM LOWEST TO HIGHEST`, etc. would break silently. Plain was a template preprocessor, not a language layer.

Making Plain work uniformly across templates, expressions, **and** snippet bodies required three coordinated changes.

### 2.1 Function-call parsing

Plain's parser couldn't parse `greet "Diego"` cleanly — it threw "unexpected trailing tokens" and relied on the fallback path. This worked for simple snippet calls but failed for nested Plain inside args: `{bold (SHOW price AS currency USD)}` threw at the top level, fallback returned the whole thing unchanged, and the inner `SHOW ... AS` was never translated.

**Fix.** The parser now recognizes `identifier` followed immediately by a value-ish token (identifier, string, number, lparen, loom passthrough) as a function call. A new AST node `{ type: 'call', name, args }` translates to `(name arg1 arg2 ...)`. Function calls can themselves carry trailing modifiers: `{fn arg SORTED BY x}` wraps the call in a show node.

This is a principled fix, not a workaround. Plain inherits Loom's function-call notation — `{fn arg1 arg2}` has always been the standard form. The parser just had to learn to see it.

```
{greet "Diego"}                          → greet "Diego"           (pass to snippet)
{bold (SHOW price AS currency USD)}      → bold (# -currency=usd price)
{filter items SORTED BY date}            → >> -by=date (filter items)
```

### 2.2 WHERE condition prefixing

The original Plain spec's translation table was aspirational. It showed:

```
{SHOW publications.title WHERE refereed}  →  {? refereed publications.title}
```

That's broken in Loom. Bare `refereed` resolves as a top-level variable lookup, not a per-element property, so the filter doesn't do anything. The correct Loom form uses list-aware dotted paths:

```
{SHOW publications.title WHERE refereed}  →  {? publications.refereed publications.title}
```

**Fix.** The translator now extracts the list root from the SHOW value (`publications.title` → `publications`) and rewrites bare identifiers in the WHERE condition to dotted paths. It walks the condition AST recursively, handling binops and unary operators. Already-dotted paths, `true`/`false`/`null` literals, `@`-prefixed label lookups, and `$`-prefixed snippet params are left alone.

Applies to both `WHERE` modifiers on SHOW and to `COUNT OF ... WHERE`. The latter now translates to the cheaper `(++!! prefixed_condition)` form — counting truthy values in the per-element condition list — instead of the expensive filter-then-count of the old spec.

```
{COUNT OF pubs WHERE refereed}          → ++!! pubs.refereed
{COUNT OF pubs WHERE year > 2020}       → ++!! (> pubs.year 2020)
{SHOW pubs.title WHERE year > 2020}     → ? (> pubs.year 2020) pubs.title
```

### 2.3 Snippet body translation at construction time

`Plain`'s constructor now pre-translates every snippet body so Loom's evaluator sees a normal library of Loom snippets at call time.

```js
constructor(snippets = {}, functions = {}) {
    const prepared = this._prepareSnippets(snippets)
    this.loom = new Loom(prepared, functions)
}

_prepareSnippets(snippets) {
    const parsed = parseSnippets(snippets)        // reuse Loom's own parser
    const result = {}
    for (const [name, def] of Object.entries(parsed)) {
        if (typeof def === 'function') {
            result[name] = def                    // pre-built fn: pass through
            continue
        }
        result[name] = {
            ...def,
            body: def.isText
                ? this.translateTemplate(def.body)    // walk {…} placeholders
                : this.translateExpression(def.body), // translate the whole body
        }
    }
    return result
}
```

- **Eager, not lazy.** Snippet sets are small, construction is one-time, and eager failures are better than lazy ones.
- **Reuses Loom's `parseSnippets`** (already exported from `tokenizer.js`) to normalize both source-string and object-shape inputs.
- **Text-body snippets** go through `translateTemplate`, which walks each `{…}` placeholder and translates its contents.
- **Expression-body snippets** go through `translateExpression`, which translates the body as a single Plain expression.
- **Pre-built function values** pass through unchanged — useful for programmatically-built snippet libraries.
- **Backwards compatible.** Plain is a strict superset of Loom, so translating a raw-Loom body is a no-op (either via idempotent parse or via the fallback path).

---

## 3. Bug fixes to Loom itself

Two real Loom bugs surfaced while building out the snippet path. Both were fixed upstream so they benefit anyone using Loom directly, not just Plain users.

### 3.1 `++!!` reducer had no initial accumulator

**Symptom.** `++!!` (count non-empty items) produced nonsense results on most list shapes. A list of objects:

```js
evaluate('++!! items', { items: [{a: 1}, {a: 2}, {a: 3}] })
// → "[object Object]11"   ← expected: 3
```

A list of numbers that aren't `1`:

```js
evaluate('++!! nums', { nums: [100, 200, 300] })
// → 102   ← expected: 3
```

**Root cause.** `applyCollector` called `list.reduce(fn)` without an initial value. When `reduce` is called with no init, it uses the first list element as the starting accumulator. `countItems(a, b) = isEmpty(b) ? a : a + 1` assumes `a` is already a number, but when it starts as an object or a large number, the arithmetic produces garbage.

This was not a new bug — the docs at `examples.md:185`, `examples.md:195`, and `examples.md:349` all relied on the broken behavior and would have produced wrong results for anyone running those examples.

**Fix.** Reducers can now declare an `init` property that `applyCollector` passes to `reduce` when present. `countItems.init = 0` makes `++!!` work for any list shape:

```js
// src/functions.js
function applyCollector(fn, flags, args) {
    const list = flatten(args)
    if (!list.length) return ''
    return fn.init !== undefined ? list.reduce(fn, fn.init) : list.reduce(fn)
}

function countItems(a, b) {
    return isEmpty(b) ? a : a + 1
}
countItems.init = 0
```

One-line, opt-in, affects only reducers that declare an init. `++` (sum/concat) is unchanged because numeric/string concatenation needs no init.

**Verified.** Two regression tests in `tests/engine.test.js` prove the fix on a list of objects and a list of non-zero numbers. The docs examples that previously would have printed nonsense now work as documented.

### 3.2 `applyFormatter` had flag stickiness and wrong path for single-list args

**Symptom.** A list containing a `null` rendered as `', , '` instead of the expected `'New, Mid'`:

```js
const result = engine.render('{? (> pubs.year 2020) pubs.title}', {
    pubs: [
        { title: 'Old', year: 2018 },
        { title: 'New', year: 2023 },
        { title: 'Mid', year: 2021 },
    ],
})
// Before: ", , "   After: "New, Mid"
```

The filter `(? (> pubs.year 2020) pubs.title)` correctly produced `[null, 'New', 'Mid']`, but the formatter mangled it on the way out.

**Root cause.** Two bugs in `applyFormatter`:

1. **Flag stickiness.** `formatValue` caches the inferred type via `flags.type ??= inferType(value, flags)`. The matrix path in `applyFormatter` reused the same `flags` object across iterations, so `null` in slot 0 cached `type='null'` and every subsequent item formatted as empty.

2. **Wrong path for a single-list arg.** `applyFormatter` took its matrix-transpose path whenever `args` contained an array, even for a single list argument. This (a) loses `formatList`'s drop-empties semantics and (b) triggered the stickiness above.

**Fix.**

```js
// src/functions.js
function applyFormatter(fn, flags, args) {
    // Short-circuit: a single arg (including a single list) goes
    // straight to formatValue, which routes list-typed values to
    // formatList — which drops falsy items before joining.
    if (args.length === 1) {
        return fn({ ...flags }, args[0])
    }

    // Multi-arg path: clone flags per iteration to prevent type
    // caching from leaking between items.
    const formatItem = (items) => {
        if (items.length == 1) return fn({ ...flags }, items[0])
        return items.map((c) => fn({ ...flags }, c))
    }

    if (!hasArrays(args)) return formatItem(args)

    const matrix = createMatrix({}, args)
    return matrix.map((item) => formatItem(item))
}
```

**Verified.** Regression test in `tests/engine.test.js` asserts the filter-and-render pattern now produces `'New, Mid'`. This fix makes any Loom template that filters a list and renders it work correctly — a pretty common pattern.

---

## 4. Documentation and test coverage fills

Two gaps in the pre-existing Loom docs and tests were also filled.

### 4.1 Snippets missing from `basics.md`

`docs/language.md` had a solid Snippets reference section, but `docs/basics.md` — the designated "start here" doc — didn't mention snippets at all. Added a short Snippets section between "A realistic example" and "Next steps" with one text-body example (`[greet name] { Hello, {name}! }`) and one expression-body example (`[triple n] (* n 3)`), pointing to `language.md` for the full reference. Next steps also picks up a link to `plain.md`.

### 4.2 Snippet tests were thin

The pre-existing snippet tests in `tests/engine.test.js` covered only two narrow paths: text-body snippets with simple positional args. Expanded from 2 to 9 tests, covering the previously-untested paths:

- Zero-argument snippets
- Expression-body `(…)` snippets
- Variadic `...args`
- Snippets calling other snippets
- Outer resolver variables referenced from a snippet body
- `$0` flag-bag parameter
- Programmatic object-shape constructor argument

---

## 5. Test count progression

| After step | Tests |
|---|---|
| Session start (Loom only) | 42 |
| Plain landing (tokenizer + parser + translator + engine + fixtures) | 126 |
| `++!!` fix with regression tests | 128 |
| Basics.md snippets section + expanded snippet tests | 135 |
| Plain function-call parsing + translator tests | 147 |
| Snippet integration tests + formatter fix regression | **164** |

All 164 pass.

---

## 6. Known limitations (documented)

Three caveats are documented in `plain.md` for users to be aware of. None of them are Plain-specific — they're Loom semantic constraints surfaced by building Plain on top.

1. **WHERE combined with SORTED BY on a projected list.** `{SHOW pubs.title WHERE refereed SORTED BY date DESCENDING}` translates correctly but produces string-order output, not date-order, because the filtered list contains strings with no `date` property to sort by. Workaround: sort the full object list before projecting the title. This is a Loom constraint, not a Plain limitation.

2. **Dotted access on snippet parameters.** Loom's aux-variable lookup doesn't traverse dotted paths. If a snippet takes a parameter `items` and the body references `items.amount`, Loom falls through to the outer resolver instead of using the aux binding. Workaround: match the parameter name to the outer variable name, or use the explicit accessor form `(. amount items)`.

3. **Reserved keywords.** Plain keywords (`SHOW`, `IF`, `WHERE`, `SORTED BY`, `TOTAL OF`, etc.) are reserved across the whole language, including snippet names and parameter names. A snippet named `show` or a parameter named `count` collides with the tokenizer's keyword recognition. Use non-keyword names.

---

## 7. Commits landed

In `@uniweb/loom` (public repo), in chronological order:

| Commit | Summary |
|---|---|
| `66d91a6` | fix: give ++!! reducer an initial accumulator |
| `c1dd564` | feat: add Plain natural-language layer |
| `82f85f4` | docs: add snippets section to basics; test: cover uncovered snippet paths |
| `ffc0d15` | fix: applyFormatter short-circuits single-list args and clones flags |
| `9fbaf19` | feat: Plain supports snippets, function calls, and WHERE prefixing |

Each commit was bumped in the workspace submodule pointer in a corresponding `chore:` commit.

---

## 8. What to read next

- [`plain.md`](./plain.md) — the full Plain tutorial and reference, with worked examples and the translation table
- [`basics.md`](./basics.md) — Loom basics, now with a Snippets section
- [`language.md`](./language.md) — the canonical Loom reference
- `tests/plain/snippets.test.js` — end-to-end snippet integration tests, a good sample of what Plain feels like in practice
