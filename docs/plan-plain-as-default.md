# Plan: Promote Plain form to default Loom, split empty/falsy semantics

**Status:** Design locked, partially implemented. Revised 2026-04-14 after session review.
**Audience:** The developer (human or AI) implementing this change. Assumes no prior context beyond the codebase itself. Read this document front-to-back before touching any file.

> **2026-04-14 revision note.** This plan was written before the April 2026 session documented in `work-log-2026-04.md`. That session already landed what was originally "change 2" (snippet-body translation) as part of the Plain integration, and incidentally fixed two Loom bugs (`++!!` reducer init, `applyFormatter` flag stickiness). The current test count is **164**, not 128. The revised scope below reflects what's actually left to do. Section 2 of this document is kept for historical context only — it describes work already in the repo.

---

## Executive summary (revised)

Two coordinated code changes to `@uniweb/loom`, plus a follow-up architectural investigation:

1. **Split `isEmpty` into `isEmpty` (structural) and `isFalsy` (Loom-style truthiness).** The current single `isEmpty` check conflates "should this drop from output?" (structural emptiness) with "is this a false condition?" (truthiness). The two need different rules, and the existing code already patches around the conflation ad-hoc in joins (`|| item === 0` at `src/functions.js:673` and `:695`). Formalize the split: `isEmpty` = `"" | null | undefined | NaN | [] | {}` + `BaseEntity.isEmpty()`, `isFalsy` = Python-style (`isEmpty` set plus `0`, `"0"`, `false`). **Do this first** — it's the most contained change, and the test updates lock in the new semantics before the rename shuffles file paths.

2. **Promote Plain form to the default language.** Today `@uniweb/loom` exports a symbolic (Polish-notation) `Loom` class, and `@uniweb/loom/plain` exports a `Plain` wrapper that accepts a natural-language surface syntax and compiles it to the symbolic engine. Flip this: `@uniweb/loom` should export `Loom` — the Plain-enabled class — and a new `@uniweb/loom/core` subpath should export `LoomCore`, the raw symbolic engine. Rationale: Plain form is the audience-appropriate front door. The symbolic form remains available for power users and as an escape hatch inside Plain templates.

3. **Position-aware keyword matching.** ✅ Done 2026-04-14. The tokenizer previously classified every word that matched a keyword phrase as a keyword eagerly, and user variables that shadowed single-word keywords (`show`, `where`, `if`, etc.) worked only by the parse-throw-and-fallback chain — the Plain parser would throw on a dangling keyword and the engine would catch and retry the raw input against LoomCore's symbolic form. A pre-session investigation showed that position-aware parsing is a small, contained change (the parser is already structured around positions) and solves the problem principled: the tokenizer now emits plain `word` tokens with original casing, and the parser uses a `matchKeywordAt(tokens, index, allowedSet)` helper to look up keywords only in grammar positions that accept them. See commit 3 below for the details. After the change, `{count}`, `{show}`, `{where}`, `{SHOW count}`, `{person.where}`, and `{pubs.title WHERE refereed}` all parse via principled grammar rather than fallback. The residual limitation — a custom function registered under a single-word construct keyword like `show` or `if` cannot be invoked through Plain function-call syntax — is documented honestly in the README.

### Originally "change 2" — already implemented

The plan originally called for a third change: fixing snippet-body translation so Plain-form bodies are translated at construction time before being handed to the symbolic engine. This work landed in the April 2026 session. See `src/plain/engine.js:41-57` (`_prepareSnippets`) and `work-log-2026-04.md` section 2. The historical description is preserved in section 2 below for reference. **Skip it when implementing.**

---

## Why these changes

**Plain as the default.** Loom's audience is developers who write reports that non-technical authors later read, validate, and adjust — the same relationship SQL has with data analysts. Plain form reads like natural language (`COUNT OF publications WHERE refereed`); Compact form reads like Polish-notation operators (`(++!! (? refereed publications))`). The natural-language form is what the audience can engage with, so it should be the language's front door. Compact form remains available inside Plain templates via the passthrough `{…}` escape hatch, and directly via `@uniweb/loom/core` for users who explicitly need it.

**Snippet bodies must go through Plain.** Snippets are reusable template fragments the user defines in the constructor. Today, a snippet body like `[listRecent] { {SHOW publications.title SORTED BY date DESCENDING} }` is handed to the symbolic engine, which doesn't recognize `SHOW` as a keyword and fails. For Plain-as-default to be honest, snippet bodies must accept the same syntax as top-level templates. The fix is localized to one constructor — no deep changes.

**Empty vs. falsy split.** The current `isEmpty` at `src/functions.js:1313` treats `0`, `"0"`, `false`, `NaN`, `""`, `null`, `undefined`, `[]`, and `{}` all as "empty." This is wrong for two distinct reasons:

1. **For string output**, `0` should join normally (it's a legitimate number). A "Likes: 0" label is correct, not a bug to drop. The existing code knows this — `joinWithSeparator` and `joinIfAllTrue` already have `|| item === 0` workarounds bolted onto their `isEmpty` calls.
2. **For conditional logic**, `0`, `false`, and empty collections should all be falsy. An array of three refereed publications `[true, false, true]` counted via `{++!! ...}` should return 2, not 3. The user's intuition for "truthy" in a template/data language is Python-style (empty collections count as false), not JavaScript-style (empty collections count as true).

Splitting into two functions gives both contexts what they need and removes the ad-hoc workarounds.

---

## Invariants this work must preserve

- **All existing symbolic Loom templates continue to work.** A template written in pure Compact form (`{+: ', ' (>> -desc items)}`) must render identically before and after. The engine's symbolic semantics aren't changing.
- **The public API shape** (`loom.render`, `loom.evaluateText`, constructor signature, snippet definition format, custom function registration) stays identical. Only the import path and the default class name change.
- **Zero runtime dependencies.** No new packages.
- **Node ≥ 20.19, browser-compatible, ESM only.** Same platform targets as today.
- **The 128 existing tests should pass** after the semantic changes and test updates described below. A test that breaks is either (a) a test the new semantics invalidates (which must be updated to the new expected behavior) or (b) a bug in the implementation (which must be fixed). No test should be silently deleted.

---

## File-by-file code changes

### Trust but verify

Line numbers in this plan reflect the repo state when the plan was written. Before editing any function, **grep for its name to confirm location** — file line numbers drift with edits. If a number doesn't match what's in the file, trust the function name, not the line number.

Before starting the empty/falsy work, run this to confirm you have the full `isEmpty` call-site list:

```bash
rg -n 'isEmpty\(' framework/loom/src
```

Compare against the table in section 1. Commented-out calls (`// if (!isEmpty(...))`) and `isEmpty()` *methods* defined on entity classes (e.g., `BaseEntity` subclasses starting around line 1841) are **not** part of this work — those are unrelated methods on domain classes. Only free-function calls to the top-level `isEmpty()` need to be updated. If grep surfaces a call site not listed in section 1, apply the decision rule ("structural check? → `isEmpty`; truthiness check? → `isFalsy`") and add it to your commit.

### 1. Empty/falsy split (do this first — it's the most contained change)

**File:** `src/functions.js`

**Current state:**
- `isEmpty(value)` at line 1313: returns true for JS-falsy OR `"0"` OR empty array OR empty plain object OR BaseEntity with an `.isEmpty()` method returning true.
- `isZero(value)` at line 1309: returns true for `0 || '0'`. Has **no callers** — verified via grep. You may remove it as dead-code cleanup in the same commit, or leave it alone. Not part of the required work either way.
- Ad-hoc workarounds in `joinWithSeparator` at line 673 and `joinIfAllTrue` at line 695: `items.filter((item) => !isEmpty(item) || item === 0)`. These exist precisely because `isEmpty(0)` returns true and join needs to keep zeros. They become dead code after this change.
- `logicalNot` at line 1077: `return !value` (JS native).
- `logicalNotNot` at line 1081: `return !!value` (JS native).
- `castAs(value, type, flags)` at line 1464 has a `case 'boolean': return !isEmpty(value)` branch at line 1467. This is a type-coercion helper used for explicit boolean casts. It needs to use `isFalsy`, not `isEmpty` — casting `0` to a boolean should yield `false`, not `true`.

**Target state:**

Add a new `isFalsy` function next to `isEmpty` with the Python-style definition:

```js
function isFalsy(value) {
    // Loom-style truthiness-inverse: JS falsy, plus string "0", plus
    // empty collections and empty entities. This is broader than JS's
    // `!value` because empty arrays and objects should be falsy in
    // template/data contexts.
    if (!value || value === '0') return true   // undefined, null, false, 0, NaN, "", "0"
    if (Array.isArray(value)) return value.length === 0
    if (value instanceof BaseEntity && typeof value.isEmpty === 'function' && value.isEmpty()) return true
    if (typeof value === 'object' && value.constructor === Object) return Object.keys(value).length === 0
    return false
}
```

Change `isEmpty` to structural-only semantics:

```js
function isEmpty(value) {
    // Structural emptiness only — excludes 0, "0", false.
    // Used by joins and "drop from output" checks.
    // For "is this a false condition?" checks, use isFalsy() instead.
    if (value === null || value === undefined) return true
    if (value === '' || Number.isNaN(value)) return true
    if (Array.isArray(value)) return value.length === 0
    if (value instanceof BaseEntity && typeof value.isEmpty === 'function' && value.isEmpty()) return true
    if (typeof value === 'object' && value.constructor === Object) return Object.keys(value).length === 0
    return false
}
```

Update `logicalNot` and `logicalNotNot` to use `isFalsy`:

```js
function logicalNot(flags, value) {
    return isFalsy(value)
}

function logicalNotNot(flags, value) {
    return !isFalsy(value)
}
```

**Call-site updates:**

| Line | Function | Before | After |
|---|---|---|---|
| 673 | `joinWithSeparator` | `items.filter((item) => !isEmpty(item) \|\| item === 0)` | `items.filter((item) => !isEmpty(item))` |
| 695 | `joinIfAllTrue` (`+?`) | `args.every((item) => !isEmpty(item) \|\| item === 0)` | `args.every((item) => !isEmpty(item))` |
| 701 | `countItems` (`++!!`) | `return isEmpty(b) ? a : a + 1` | `return isFalsy(b) ? a : a + 1` |
| 763 | `logicalAnd` (`&`) | `if (isEmpty(args[i])) return args[i]` | `if (isFalsy(args[i])) return args[i]` |
| 774 | `logicalOr` (`\|`) | `if (!isEmpty(args[i])) { return args[i] }` | `if (!isFalsy(args[i])) { return args[i] }` |
| 985 | formatter `-wrap` flag | `if (isEmpty(value)) { value = '' }` | keep `isEmpty` — wrap-if-non-empty is a structural check |
| 1294 | `switchCase` (for `??`, `???`) | `if (!isEmpty(conditions[i]))` | `if (!isFalsy(conditions[i]))` |
| 1467 | `castAs` boolean branch | `case 'boolean': return !isEmpty(value)` | `case 'boolean': return !isFalsy(value)` |

The rule: **joins and the wrap formatter use `isEmpty`; everything else uses `isFalsy`.** If you encounter an `isEmpty` call not listed above, apply this rule: does the call determine "should this drop from output?" (stays `isEmpty`) or "is this a false condition?" (changes to `isFalsy`).

`isFalsy` is an **internal helper**, not part of the public API. Do not export it from `src/index.js` or `src/core/index.js`. Users interact with truthiness through the `!`, `!!`, `?`, `&`, `|` operators.

**Internal mental model (from the design discussion):**

- **`isEmpty`** answers: "should this value drop from text output?" — used whenever a value's absence should make a surrounding clause disappear.
- **`isFalsy`** answers: "does this value count as false in a boolean context?" — used for conditionals, logical operators, and count-of-truthy reducers.

The two differ on three values: `0`, `"0"`, `false` are falsy but not empty. `NaN`, `""`, `null`, `undefined`, `[]`, `{}`, and entities-that-say-they're-empty are both.

**Behavioral consequences to verify in tests:**

- `{+? 'Likes: ' likes}` with `likes=0` → `"Likes: 0"` (was `""`).
- `{+? 'Active: ' is_active}` with `is_active=false` → some string containing the boolean (exact stringification depends on Loom's default formatter — verify before asserting in tests). Loom has a typed-boolean formatter at `functions.js:1016` that renders booleans as `"1"`/`"0"`, but whether that path runs in a default join is unverified. The point of the test is that `false` is **included** in the join rather than dropped; assert on inclusion, not on the exact string, until you've verified the stringification path. Either way, the user should pretty-print booleans with a ternary (`{? is_active 'Yes' 'No'}`) rather than raw-joining them. Symmetric treatment of `true` and `false` matters more than one-sided niceness.
- `{++!! [1, 0, 2]}` → 2 (unchanged from today's behavior; `isFalsy(0) === true`).
- `{++!! [true, false, true]}` → 2.
- `{++!! [[1], [], [2]]}` → 2 (empty array is falsy under Loom's Python-style `isFalsy`).
- `{! []}` → `true` (changed from JS `![] === false`; under Loom, empty array is falsy).
- `{!! []}` → `false` (changed from JS `!![] === true`).
- `{? 0 'yes' 'no'}` → `'no'` (0 is falsy in conditional, unchanged intent).
- `{? likes 'has' 'none'}` with `likes=0` → `'none'`.

**Documentation update** needed for `++!!`: the language reference currently describes `++!!` as `(++ (!! list))`, which is a pedagogical shorthand. The implementation is a direct compound `countItems`. The description should read: "counts elements with meaningful content (non-falsy)." No code change — the implementation already does this.

---

### 2. Snippet-body translation fix — ALREADY DONE (historical, do not re-implement)

> This section describes work that landed in the April 2026 session. The current `src/plain/engine.js` already implements `_prepareSnippets` using `parseSnippets` from the symbolic tokenizer, translates text-body snippets via `translateTemplate`, and expression-body snippets via `translateExpression`. Pre-built function values pass through unchanged. The `$0` flag-bag path is covered by existing tests. **Skip this section when implementing.** It's preserved for historical context and for anyone auditing why the design took the shape it did.

**File:** `src/plain/engine.js`

**Current state (at the time this plan was written — now superseded):**

```js
constructor(snippets = {}, functions = {}) {
    this.loom = new Loom(snippets, functions)
}
```

Snippet definitions pass straight through to the symbolic engine. If a user defines a snippet whose body uses Plain-form keywords (e.g., `[listRecent] { {SHOW publications.title SORTED BY date DESCENDING} }`), the symbolic engine doesn't recognize `SHOW` as a function and the snippet fails at invocation time.

**Target state:**

At construction time, translate each snippet body through the Plain translator before handing the snippets to the symbolic engine. Two input shapes to handle:

- **String form**: `"[name args] { body }  [name args] ( body )  …"`. A flat text of snippet definitions.
- **Object form**: `{ name: { args: [...], body: "..." } }` — the parsed-object form accepted by the symbolic engine's constructor. The exact object shape is defined by `parseSnippets` from `src/tokenizer.js` (move-target: `src/core/tokenizer.js` post-rename); consult that function for the definitive format.

**Before implementing, verify two things about the symbolic engine:**

1. **What does the symbolic `Loom` (soon `LoomCore`) constructor accept** for the `snippets` argument? A string only, an object only, or both? Read `src/engine.js`'s constructor to confirm.
2. **What exact object shape does `parseSnippets` from `src/tokenizer.js` produce?** Read the function. The pseudocode below assumes a shape with at least `body` and a way to distinguish `{…}` from `(…)` bodies; verify this before coding.

**Two implementation approaches — pick based on what the symbolic engine accepts:**

- **Approach A — rewrite the string.** Walk the snippet-definition string with `findEnclosures` (already imported from `'../tokenizer.js'` / post-rename `'./core/tokenizer.js'`), find each `{ body }` and `( body )` block at the snippet-definition level, translate each body, rebuild the string, pass the rebuilt string to the symbolic engine. Fewest assumptions about the symbolic engine's internals, but requires careful walking of the outer brackets (`[name args]`) plus the body delimiters. `findEnclosures` already handles nested brace balancing.
- **Approach B — parse first, then translate.** If the symbolic engine can accept a pre-parsed object form, call `parseSnippets` yourself to get the object, translate each body in the object in place, and hand the parsed object to the symbolic engine. Cleaner if supported; depends on the symbolic engine's constructor accepting the object form directly.

If the symbolic engine currently only accepts strings, Approach A is required. If it accepts both, Approach B is cleaner.

Pseudocode (Approach B — adjust if using A):

```js
constructor(snippets = {}, functions = {}) {
    const translatedSnippets = this.translateSnippets(snippets)
    this.loom = new LoomCore(translatedSnippets, functions)
}

translateSnippets(snippets) {
    if (typeof snippets === 'string') {
        return this.translateSnippetString(snippets)
    }
    if (snippets && typeof snippets === 'object') {
        const out = {}
        for (const [name, def] of Object.entries(snippets)) {
            out[name] = {
                ...def,
                body: this.translateSnippetBody(def.body, def.bodyType /* '{' or '(' */)
            }
        }
        return out
    }
    return snippets
}

translateSnippetString(source) {
    // Walk each snippet definition "[name args] { body }" or "[name args] ( body )".
    // For each body, translate: { body } uses translateTemplate, ( body ) uses
    // translateExpression (wrapping in braces first so the walker finds it).
    // Rebuild the string with the translated bodies.
    //
    // Use findEnclosures to locate both balanced { … } and balanced ( … ) blocks
    // at the correct nesting level. Be careful to skip over nested braces inside
    // bodies — findEnclosures handles balancing.
}

translateSnippetBody(body, bodyType) {
    if (bodyType === '{') {
        // Text template: translate as a full template, walking each {…} placeholder.
        return this.translateTemplate(body)
    }
    if (bodyType === '(') {
        // Expression: translate the whole body as a single expression.
        return this.translateExpression(body)
    }
    return body
}
```

**Two subtleties to handle:**

1. **Parse-error resilience.** The existing `translateExpression` already has a try/catch that returns the original input on parse failure. Snippet translation should inherit this behavior — if a snippet body doesn't parse as Plain, pass it through unchanged to the symbolic engine (which may handle it natively or fail with its own error message). Do not throw from the constructor; the worst case is "this snippet only works if you write it in Compact form."
2. **The `$0` flag-bag parameter.** Some snippets use `$0` as their first argument to receive the flag bag (see language reference section "The `$0` parameter"). `$0` is Loom-engine machinery, not Plain syntax. The Plain translator should not try to interpret `$0` as a keyword or identifier in a special way; it should pass through as a normal token. Verify this after implementation by running any existing test that exercises `$0`.

**Acceptance criteria:**

A snippet defined as `[listRefereed items] { {COUNT OF items WHERE refereed} }` must:
- Be accepted by the constructor without error.
- When invoked as `{listRefereed publications}`, return the count of refereed publications.
- Work identically whether defined in the string form or the object form.

---

### 3. Rename: flip Plain to default, move symbolic engine to `/core`

Do this **after** the falsy split and snippet fix. Those changes are in the existing file layout; once merged, the rename moves files cleanly.

**Goal file structure:**

```
src/
  index.js              ← exports { Loom, findEnclosures, parseSnippets, setLocale, getProperty }
  engine.js             ← the new Loom class (was src/plain/engine.js, class renamed Plain → Loom)
  plain/
    tokenizer.js        ← unchanged, still under plain/
    parser.js           ← unchanged
    translator.js       ← unchanged
  core/
    index.js            ← NEW. exports { LoomCore, findEnclosures, parseSnippets, setLocale, getProperty }
    engine.js           ← was src/engine.js, class renamed Loom → LoomCore
    tokenizer.js        ← was src/tokenizer.js
    functions.js        ← was src/functions.js
    currency_code.js    ← was src/currency_code.js
```

**File moves** — use `git mv` (not shell `mv` or file-system operations) so git preserves rename history and blame:

1. `git mv src/engine.js src/core/engine.js`. Inside the moved file, rename the class `Loom` → `LoomCore`. The internal imports (`./tokenizer.js`, `./functions.js`, `./currency_code.js`) don't need to change — all four files move together, so relative paths stay valid.
2. `git mv src/tokenizer.js src/core/tokenizer.js`. No class changes; this file is pure utilities.
3. `git mv src/functions.js src/core/functions.js`. No class changes.
4. `git mv src/currency_code.js src/core/currency_code.js`. No changes.
5. `git mv src/plain/engine.js src/engine.js`. Inside the moved file:
    - Rename the class `Plain` → `Loom`.
    - Update the imports. Before the move, the file had:
      ```js
      import Loom from '../engine.js'
      import { findEnclosures } from '../tokenizer.js'
      import { tokenize } from './tokenizer.js'
      import { parse } from './parser.js'
      import { translate } from './translator.js'
      ```
      After the move, the file is at `src/engine.js`, so the paths change:
      ```js
      import LoomCore from './core/engine.js'
      import { findEnclosures } from './core/tokenizer.js'
      import { tokenize } from './plain/tokenizer.js'
      import { parse } from './plain/parser.js'
      import { translate } from './plain/translator.js'
      ```
    - **Recommended but optional**: rename the internal field `this.loom` → `this.core` for clarity (it holds a `LoomCore` instance now). Update all references (`this.loom.render(...)` → `this.core.render(...)` etc.). Skip if it causes merge friction with the snippet-fix commit.
6. `git rm src/plain/index.js`. The Plain subpath export is going away (clean break; no back-compat).
7. Create `src/core/index.js` with:
   ```js
   export { default as LoomCore } from './engine.js'
   export { findEnclosures, parseSnippets } from './tokenizer.js'
   export { setLocale, getProperty } from './functions.js'
   ```
8. Update `src/index.js` to:
   ```js
   export { default as Loom } from './engine.js'
   export { findEnclosures, parseSnippets } from './core/tokenizer.js'
   export { setLocale, getProperty } from './core/functions.js'
   ```
   The utility re-exports preserve the existing public API surface. Users who imported `setLocale` from `@uniweb/loom` continue to get it.

**`package.json` update:**

```json
"exports": {
    ".": "./src/index.js",
    "./core": "./src/core/index.js"
}
```

Remove the `"./plain"` entry.

**Import check:** after the moves, grep the repo for any remaining references to `../plain` or `./plain/` or `import { Plain }` — if any exist outside of `src/plain/tokenizer.js`, `parser.js`, `translator.js` (which still live there), they're stale and need updating.

**Tests:** inspect the test files to discover the current import patterns before updating (`rg -n 'from .*loom' framework/loom/tests` and `rg -n 'new (Loom|Plain)' framework/loom/tests`). After the rename, `src/engine.js` is the new Plain-enabled Loom, not the symbolic engine. Decide per-test: does this test exercise the Plain front door or the raw symbolic engine?

- If the test's purpose is to verify symbolic-form semantics (the vast majority of the existing 128 tests), update the import to `'../src/core/engine.js'` and the class name reference from `Loom` to `LoomCore`. The test logic stays identical.
- If the test's purpose is to verify Plain-form translation (the `plain/*` tests), update the import from `'../src/plain/engine.js'` or `'../src/plain/index.js'` to `'../src/engine.js'` (the new default), and the class name from `Plain` to `Loom`.

**Acceptance criteria for the rename:**

- `import { Loom } from '@uniweb/loom'` returns the Plain-enabled class. Instantiating it and calling `render` / `evaluateText` accepts both Plain and Compact form expressions.
- `import { LoomCore } from '@uniweb/loom/core'` returns the raw symbolic engine. Instantiating it and calling `render` / `evaluateText` accepts only Compact form (Plain-form keywords fail or are interpreted as identifiers).
- All existing tests pass after their imports are updated.
- No reference to the `Plain` class name remains outside of doc history.

---

## Documentation changes

### Target for the README

A finished README already exists on disk at `README-v3.md`. **Copy that file's content to `README.md`** at the end of the implementation, overwriting the current README. Delete `README-v3.md` (and `README-v2.md`, which is an intermediate draft) after the replacement. The v3 draft incorporates all the design decisions in this plan and is the authoritative source for the README.

### Docs to rewrite in a follow-up pass

These aren't part of this implementation, but they'll be stale after the code changes and should be updated soon after:

- **`docs/basics.md`** — currently teaches Compact (Polish-notation) form first. Rewrite to lead with Plain form. Introduce Compact form after the essentials are established, framed as "Loom's compact mode for power users." Preserve the existing examples where possible — many of them are already in Plain-compatible form (bare variable references, join shortcuts).
- **`docs/quick-guide.md`** — same treatment. Plain-first examples, Compact alongside.
- **`docs/language.md`** — the complete reference. Restructure to present both surface forms as equal citizens. The Plain keyword reference (currently in `docs/plain.md`) should merge into this document.
- **`docs/plain.md`** — dissolve. Content moves into `basics.md`, `language.md`, and the new README. Leave a stub that redirects readers, or delete entirely depending on the repo's link hygiene.
- **`docs/examples.md`** — update examples to use Plain form primarily, Compact form where it reads better or where it illustrates something Plain form doesn't yet have a verb for.
- **`docs/ai-prompt.md`** — rewrite to teach Plain form. The current prompt teaches Compact form; a fresh LLM will generate Compact-form expressions that work but aren't the intended audience-facing style.
- **`docs/history.md`** — minor update. The "What's next" section currently describes Plain as an unfinished project — that section should note Plain is now the default surface and mention this plan/document as the reference.
- **`docs/README.md`** — update the navigation to reflect the dissolved `plain.md`.

**Global search-replaces** that apply across most doc files:

- `new Plain(...)` → `new Loom(...)`
- `import { Plain } from '@uniweb/loom/plain'` → `import { Loom } from '@uniweb/loom'`
- `@uniweb/loom/plain` → (remove or reframe as historical)
- Discussions of "Plain is a strict superset of Loom" → reframe: "Loom is one language with two surface forms."
- References to "raw Loom" or "Loom expression" where they mean symbolic syntax → "Compact form."

These are mechanical but require a careful read of each file — automatic search-replace risks turning correct uses of "Loom" (the language as a whole) into "Compact form" where the old text meant the whole language, not the symbolic subset.

### Keyword casing (docs-only, no code change)

The tokenizer's case-insensitive matching is correct as-is. The **contract** for users is:

- **ALL CAPS is the stable form.** A keyword written in ALL CAPS is guaranteed to be interpreted as a keyword, now and in every future version.
- **Lowercase is SQL-style convenience.** `show`, `where`, `count`, etc. currently parse as keywords, but a user with a variable or custom function of the same name can shadow them. The escape hatch is: write the keyword in ALL CAPS, or rename the collision.
- **No configuration option.** We are not adding a `reservedVariables` list or similar. The contract is enforced by convention and documentation, not by runtime checks.

Document this in `README.md` (already done in `README-v3.md`, section "Keyword casing"), in `docs/basics.md`, and in `docs/language.md`. The language.md reference should explicitly list the full set of Plain-form keywords and state the ALL CAPS guarantee.

---

## Sequencing and commits (revised)

Revised sequence — the snippet-fix commit is dropped because that work already shipped. Each commit lands in a working state:

**Commit 1: `feat: split isEmpty into structural emptiness and isFalsy truthiness`**
- Add `isFalsy` in `src/functions.js`.
- Narrow `isEmpty` to structural-only.
- Update the 5 call sites in the table above.
- Change `logicalNot` and `logicalNotNot` to use `isFalsy`.
- Remove the dead `|| item === 0` workarounds from joins.
- Update and add tests (see Testing section).
- Commit message body: "Splits the overloaded `isEmpty` check into two: `isEmpty` for 'should this drop from output?' (structural) and `isFalsy` for 'is this a false condition?' (Python-style truthiness). Zero is non-empty; empty collections are falsy. See docs/plan-plain-as-default.md for rationale."

**Commit 2: `refactor: promote Plain to default Loom, move symbolic engine to /core`**
- File moves per the "Rename" section above.
- Class renames: `Plain` → `Loom`, `Loom` → `LoomCore`.
- Update `package.json` exports.
- Update all test imports.
- Replace `README.md` with the content from `README-v3.md`, then delete `README-v2.md` and `README-v3.md`.
- Commit message body: "The package now exports `Loom` — the Plain-enabled class — from the default entry point. The raw symbolic engine is available as `LoomCore` from `@uniweb/loom/core` for users who want to skip the Plain parser or who need variable/function names that would otherwise shadow Plain keywords. Breaking change: the `@uniweb/loom/plain` subpath is removed; import from `@uniweb/loom` instead."

**Commit 3: `refactor: position-aware keyword matching in the Plain parser`** ✅ Done 2026-04-14.

The pre-session investigation found the current eager-classify-then-throw-and-fallback mechanism to be architecturally ugly but behaviorally mostly-correct. `{count}` already worked because `count` alone isn't a keyword phrase (only `count of` is). `{show}` worked via the parse-throw-fallback chain. The only case the refactor couldn't fix — and no parser change can fix — is a custom function registered under a single-word construct keyword name like `show`, because the grammar sees that word as the SHOW verb at the start of a placeholder, not as a function name.

The refactor itself was contained:

- `src/plain/tokenizer.js`: removed the `collapseKeywords` pass. The tokenizer now emits `word` tokens with original casing instead of pre-classified `keyword`/`identifier`. `and`/`or`/`not` → `&`/`|`/`!` operator conversion is kept at tokenizer level because operators have position-independent meaning. A new `matchKeywordAt(tokens, index, allowedPhrases)` helper is exported for the parser.
- `src/plain/parser.js`: replaced every `t.type === 'keyword'` check with a context-specific call to `peekKeyword(p, allowedSet)`. Defined `CONSTRUCT_KEYWORDS`, `MODIFIER_KEYWORDS`, and sub-keyword sets (`THEN_OR_SHOW`, `ELSE_OR_OTHERWISE`, `IN_KEYWORD`, `DO_KEYWORD`, `ASCENDING_KEYWORD`, `DESCENDING_KEYWORD`, `WHERE_OR_IF`) as the allowed sets for each grammar position. `parseValue` accepts a `word` as identifier unconditionally — it's in a value position so it doesn't care about keyword interpretation.
- Key subtlety: `isFunctionCallStart` had to learn to consult `MODIFIER_KEYWORDS`. Under the old tokenizer, a following `WHERE` was typed `keyword` and would fail the "is this value-ish?" check; under the new tokenizer it's a plain `word`, so `isFunctionCallStart` needs to peek for modifier keywords and bail if it finds one. Without this, `{pubs.title WHERE refereed}` would incorrectly enter function-call mode (with `pubs.title` as the name) and lose the list-root for bare-var prefixing in the WHERE condition.
- Refinement: `isStranded(p, kw)` — a single-word construct keyword match that consumes all remaining tokens (e.g., `{show}` alone) falls through to identifier interpretation instead of entering a doomed parseShowBody. Multi-word keyword matches never strand by this rule.

Tests: 11 keyword-shadow regression tests were added to `tests/plain/engine.test.js` BEFORE the refactor to lock in the current (fallback-reliant) behavior. After the refactor, those tests still pass — but now through the principled grammar path. Empirical verification showed every case that previously went through the fallback now compiles directly. Tokenizer tests were updated from `keyword`/`identifier` type assertions to `word` assertions, and a new suite for `matchKeywordAt` was added. Final count: **185 tests passing** (from 175 pre-refactor + 10 new).

Pre-existing limitations surfaced during stress-testing (not introduced by this refactor, do not block the commit):

- `{TOTAL OF grants.amount AS currency USD}` — the parser's `sum`/`average`/`total` branches never call `parseModifiers`, so `AS` after a total is dropped. Verified by git-stashing the refactor and running against the pre-refactor baseline: same failure. Worth fixing separately, and easy to fix — wrap the sum/average branches with the same modifier chain that `parseShowBody` uses.
- `{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}` — the translator's `stripBraces` on a loom passthrough removes the outer braces without wrapping the inner Compact expression in parens, so a parent formatter wrapper fragments the nested expression. The README-v3 example showing this pattern is aspirational.
- `{greet (SHOW name AS label)}` — function call with a parenthesized Plain sub-expression as an argument. The group unwrapping path doesn't compose cleanly with show-node translation.

These three are tracked as potential follow-up work. None relate to position-aware matching.

**Commit 4 (or separate session): `docs: rewrite basics, quick-guide, language, examples, and history for Plain-as-default`**
- Doc rewrites per the "Docs to rewrite" section.
- Can land together with commit 2 or as a follow-up. If deferred to a new session, write a handoff document summarizing what's current vs stale so the next session starts from accurate ground.

---

## Testing strategy

### Before starting

Run the existing test suite and record the pass count. It should be 128 passing. If it isn't, something else is broken that this plan doesn't account for — investigate before making any changes.

```bash
cd framework/loom && pnpm test
```

### After commit 1 (falsy split)

The test suite will have some failures. Expected breakages and their resolutions:

| Category | Example assertion | Resolution |
|---|---|---|
| `isEmpty(0)` now false | `expect(isEmpty(0)).toBe(true)` | Update to `expect(isEmpty(0)).toBe(false)` and add a companion `expect(isFalsy(0)).toBe(true)`. |
| `isEmpty(false)` now false | similar | Update to expect false; add `isFalsy(false) === true`. |
| `isEmpty("0")` now false | similar | Update to expect false; add `isFalsy("0") === true`. |
| `{! []}` now true | `expect(result).toBe(false)` | Update to `true`; document the semantic change in the commit message. |
| `{!! []}` now false | `expect(result).toBe(true)` | Update to `false`. |
| Join with `0` values | `expect(output).toBe("")` | Update to the new output that includes `0` (e.g., `"Likes: 0"`). |
| `logicalAnd` / `logicalOr` with mixed list | may shift because `isFalsy` != `isEmpty` on empty collections | Audit case-by-case; the new semantics treat empty arrays/objects as falsy. |

**New tests to add** (lock in the semantics so a future refactor doesn't quietly regress them):

- `isEmpty` returns false for `0`, `"0"`, `false`.
- `isEmpty` returns true for `""`, `null`, `undefined`, `NaN`, `[]`, `{}`.
- `isFalsy` returns true for everything `isEmpty` returns true for, plus `0`, `"0"`, `false`.

(These two helpers are internal, so tests for them will live in the same file as the implementation or be exercised indirectly through the operators that use them. Either approach is fine.)
- `{+? 'Likes: ' likes}` with `likes=0` renders `"Likes: 0"`.
- `{+? 'Likes: ' likes}` with `likes=null` renders `""`.
- `{++!! [1, 0, 2]}` returns 2.
- `{++!! [true, false, true]}` returns 2.
- `{++!! [[1], [], [2]]}` returns 2.
- `{! []}` returns true.
- `{!! {}}` returns false.
- `{? 0 'yes' 'no'}` returns `'no'`.
- `{? [] 'yes' 'no'}` returns `'no'`.

### After commit 2 (snippet fix)

Add tests:

- A snippet defined with a Plain-form body (`[listRefereed items] { {COUNT OF items WHERE refereed} }`) works when invoked.
- A snippet defined with a Compact-form body continues to work identically.
- A snippet defined with a mixed body (Plain syntax wrapping a Compact passthrough) works.
- The object-form snippet constructor accepts Plain bodies.
- The existing `$0` flag-bag snippet tests still pass.

### After commit 3 (rename)

- All tests pass with updated imports.
- `import { Loom } from '@uniweb/loom'` works.
- `import { LoomCore } from '@uniweb/loom/core'` works.
- `import { Plain } from '@uniweb/loom/plain'` fails (subpath removed).
- A Plain-form template rendered through `Loom` produces the same output as the equivalent Compact-form template rendered through `LoomCore`.

---

## Risks and gotchas

**Plain parser fallthrough ambiguity.** The Plain parser catches parse errors and passes the original input through to the symbolic engine unchanged. This fallback works because pure Compact expressions (operator-led, `#`-led, etc.) fail in the Plain parser and get rescued. The risk: an expression that happens to parse as *valid* Plain but was meant as Compact will be silently mis-translated. The known-risky class is keyword shadowing (e.g., a user variable named `show` or `count` in a position where Plain would consume it as a keyword). The mitigation is the ALL CAPS contract documented in the README. This is a documentation concern; no code fix is possible without inspecting the user's variable set, which isn't available at parse time.

**The `FOR EACH` form.** The Plain translator compiles `FOR EACH` via a naive textual substitution of the loop identifier with `$1` (see `src/plain/translator.js:translateForEach`). This is fragile for bodies more complex than a single variable reference. `FOR EACH` is deprioritized in the current docs in favor of implicit list-awareness. Don't try to fix this during the rename — it's a pre-existing sharp edge that the rename inherits unchanged. Leave a comment at the `translateForEach` function noting this limitation.

**The `{{…}}` escape hatch** (in `src/plain/engine.js:translateTemplate`, lines 64-68): any placeholder whose inner content also starts with `{` and ends with `}` is passed through unchanged to the symbolic engine. This is Loom's existing double-brace passthrough form. Preserve this behavior in the rename — it's the fallback for users who need to force a placeholder to be interpreted as raw Compact form even after the Plain-as-default flip.

**The passthrough `{…}` token in the Plain tokenizer** (in `src/plain/tokenizer.js:splitRawTokens`, the `if (c === '{')` branch): any balanced `{…}` block inside a Plain expression is emitted as a `loom` token and passed through verbatim to the translator, which strips the outer braces and emits the inner content as-is. This is the elegant escape hatch for symbolic precision inside a natural-language template (`{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}`). Preserve it.

**`BaseEntity.isEmpty()`** in `src/functions.js:1324` — there's an instanceof check against `BaseEntity` and a call to `entity.isEmpty()` as part of Loom's isEmpty rules. This is the hook for user-defined entity classes to participate in emptiness. Both new functions (`isEmpty` and `isFalsy`) should consult this the same way the old `isEmpty` did. Don't drop it.

**String literal quoting** inside Plain translation. The Plain translator's `quote` function (`src/plain/translator.js:quote`) decides how to emit user-supplied string literals in the translated Compact form. Don't touch this during the rename unless tests fail — it's correct but finicky.

**`setLocale` and `getProperty`** are re-exported from the main index. These are runtime-level configuration / introspection that users have in their code. After the rename, they must still be importable from `@uniweb/loom` (not just `@uniweb/loom/core`) to preserve the public API. The new `src/index.js` re-export list covers this; verify it.

---

## Things I did not verify while writing this plan

Flagging these so you can double-check before acting on them:

- **Exact stringification of `true` and `false` in a join context.** I know there's a typed-boolean formatter at `functions.js:1016` (`? '1' : '0'`), but whether that path runs for a default join wasn't verified. Before writing tests that assert specific output strings for boolean joins, run the current code in a tiny harness and observe.
- **The `parseSnippets` output shape.** The snippet-fix pseudocode assumes a specific object structure with `body` and a body-type indicator. Read `parseSnippets` in `src/tokenizer.js` (post-rename: `src/core/tokenizer.js`) before coding the fix.
- **Whether the symbolic `Loom` constructor accepts an object form for `snippets`** (as opposed to only a string). Determines whether Approach A or B in the snippet-fix section is viable.
- **The exact set of tests that will break after the falsy split.** I estimated 5–15 but didn't run the suite. Actual count may differ.
- **Whether any test file under `tests/` imports from `src/plain/index.js` directly** (as opposed to `src/plain/engine.js`). If so, those imports need updating during the rename.
- **The `$0` flag-bag parameter interaction with the snippet-translation pass.** `$0` is symbolic-engine machinery. The Plain translator should pass it through as an ordinary identifier, but this wasn't traced through the tokenizer/parser/translator by hand.
- **Whether `logicalNot` / `logicalNotNot` are exposed in ways I didn't notice.** If a user somewhere calls the `!` or `!!` operator and depends on the *JavaScript* semantics (`![] === false`), the behavior change will break them. The acceptance checklist tests the new semantics; a failing test means either the implementation is wrong or a user was depending on the old behavior. Investigate before assuming the implementation is wrong.

If any of these turn out differently than the plan describes, prefer updating the plan and proceeding over silently diverging. The plan is a design document, not a contract — if reality contradicts it, reality wins.

---

## Out of scope for this implementation

Things that came up in design discussion but are **not** part of this work:

- **`reservedVariables` / `reservedNames` constructor option.** Considered, rejected. The ALL CAPS convention is the full collision-avoidance mechanism. Don't add a config option.
- **A unary modifier to opt into treating 0 as empty.** Considered, rejected as solving the wrong problem. If a user genuinely wants "0 should drop from this particular join," they can write `{+? ... (? is_nonzero likes)}` or use a ternary. No new operator.
- **Case-sensitive keyword matching.** The tokenizer's case-insensitive matching stays. The ALL CAPS guarantee is a documentation contract, not a runtime enforcement. Tightening to case-sensitive would be a future breaking change; don't do it now.
- **TypeScript definitions.** Not adding types in this pass. The package remains pure JS.
- **Bundle-size or performance optimization.** The Plain translator adds a small per-placeholder parsing cost. This is a non-issue for Loom's use cases; don't try to optimize it.
- **Deprecation warnings for the old `@uniweb/loom/plain` subpath.** Clean break. The subpath is removed in commit 3 without a deprecation cycle. The package is pre-1.0; breaking changes are allowed.

---

## Acceptance checklist

When the implementation is done, all of the following should be true:

- [ ] `pnpm test` passes (128+ tests, possibly more with additions).
- [ ] `import { Loom } from '@uniweb/loom'` works and accepts both Plain and Compact form.
- [ ] `import { LoomCore } from '@uniweb/loom/core'` works and accepts only Compact form.
- [ ] `import { Plain } from '@uniweb/loom/plain'` fails (subpath removed).
- [ ] Snippet bodies written in Plain form work at both construction and invocation time.
- [ ] `isEmpty(0) === false`, `isEmpty(false) === false`, `isEmpty("") === true`.
- [ ] `isFalsy(0) === true`, `isFalsy(false) === true`, `isFalsy("") === true`, `isFalsy([]) === true`, `isFalsy({}) === true`.
- [ ] `{+? 'Likes: ' 0}` renders `"Likes: 0"`, not `""`.
- [ ] `{++!! [1, 0, 2]}` returns 2.
- [ ] `{! []}` returns true (Loom, not JS, semantics).
- [ ] `README.md` matches the content of `README-v3.md` exactly; `README-v2.md` and `README-v3.md` are deleted.
- [ ] The `package.json` `"exports"` field has `.` and `./core`, and does not have `./plain`.
- [ ] No file under `src/plain/` imports from a deleted path.
- [ ] The `{…}` passthrough escape hatch inside Plain expressions still works for mixed-form templates (e.g., `{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}`).
- [ ] The `$0` flag-bag snippet form still works.
- [ ] `setLocale` and `getProperty` remain importable from `@uniweb/loom`.

---

## Reference: key files to read before starting

- **`README-v3.md`** — the new README (source of truth for the final README). Read this first; it's the clearest expression of what the library becomes.
- **`src/functions.js`** — home of `isEmpty`, `isFalsy` (new), and all the call sites. Large file (~1600 lines); use grep to find the specific functions rather than reading top-to-bottom.
- **`src/plain/engine.js`** — the `Plain` class to be promoted to `Loom`. Small (90 lines), read fully.
- **`src/plain/tokenizer.js`, `parser.js`, `translator.js`** — the Plain pipeline. Understand the shape but don't need to modify unless fixing a bug.
- **`src/engine.js`** — the current `Loom` class (symbolic engine) that becomes `LoomCore`. Read the class surface; move it to `src/core/engine.js` and rename.
- **`docs/plain.md`** — the existing Plain-form reference. Will dissolve; its content moves into README + basics + language.
- **`tests/`** (all files) — to understand which tests exercise which layer, and to plan the import rewrites.

---

**End of plan.**
