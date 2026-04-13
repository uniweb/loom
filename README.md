# @uniweb/loom

A small expression language for **weaving data into text**. Polish-notation syntax, a standard library of ~80 functions (sort, filter, aggregate, format, join, compare, branch), user-defined snippets, and a two-mode API: string templating *and* typed expression evaluation.

Pure JavaScript. Zero runtime dependencies. Works in Node and the browser.

```bash
npm install @uniweb/loom
```

## Why another template engine?

Most template engines (Handlebars, Mustache, Liquid, EJS) are designed for HTML output: strings in, strings out, with a handful of helpers. Loom targets a different problem: **expressing small data transformations in human-authorable text.** You're writing a CV template, an invoice format, a research report — and you need to join fields, format dates, sort lists, filter by condition, and aggregate values. All of that, inline, without escaping into a separate JavaScript file for every small operation.

Loom handles both:

- **Text with placeholders** (the template-engine half): `"Hello {first_name} {family_name}"` → resolved string
- **Pure expressions** (the mini-language half): `"{>> -desc date items}"` → a sorted array, not a string

The two halves share a syntax, a standard library, and a variable model. You can write simple substitutions when that's all you need, and reach for the full expression language when you need more.

## Quick start

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()
const profile = {
    first_name: 'Diego',
    family_name: 'Macrini',
    city: 'Fredericton',
    province: 'NB',
    country: 'Canada',
}

// Text with {placeholders}
loom.render('Hello {first_name} {family_name}', (key) => profile[key])
// → "Hello Diego Macrini"

// Join with separator — a literal string as the first token becomes the separator
loom.render("{', ' city province country}", (key) => profile[key])
// → "Fredericton, NB, Canada"

// Conditional join — drops everything if any referenced value is empty
loom.render("{+? 'Dr. ' title}", (key) => ({ title: 'Macrini' })[key])
// → "Dr. Macrini"

loom.render("{+? 'Dr. ' title}", () => undefined)
// → ""  (title missing, whole expression resolves to empty)
```

## Two modes

### `render(template, vars)` — text with placeholders

Finds every `{…}` in a string, evaluates each, returns the resolved text.

```js
loom.render('Report for {first_name} {family_name}', (k) => profile[k])
```

The variable resolver can be a function `(key) => value` or a plain object. Both shapes are supported.

### `evaluateText(expr, vars?)` — typed expression evaluation

Evaluates a single expression and returns any type — number, boolean, string, array, object. Useful for data selection, filtering, sorting, and aggregation pipelines where you want the result as data, not text.

```js
loom.evaluateText('+ 1 2')                    // → 3
loom.evaluateText('> 5 3')                    // → true
loom.evaluateText('? true "yes" "no"')        // → "yes"
loom.evaluateText('>> 2 1 3')                 // → [1, 2, 3]
loom.evaluateText('>> -desc 2 1 3')           // → [3, 2, 1]
loom.evaluateText('++ 1 2 3')                 // → 6

// With variables
const data = { items: ['apple', 'banana', 'cherry'] }
loom.evaluateText('items', (k) => data[k])    // → ['apple', 'banana', 'cherry']
```

## Syntax at a glance

Loom uses **Polish notation** — the function token comes first, arguments follow. A literal string as the first token is shorthand for "join with this separator."

| Form | Meaning |
|---|---|
| `{name}` | Variable substitution |
| `{@name}` | Variable label (e.g., `"Family Name"` for key `family_name`) |
| `{', ' a b c}` | Join with separator: `"A, B, C"` |
| `{+ a b c}` | Concatenate |
| `{? cond yes no}` | Ternary conditional |
| `{+? prefix value}` | Conditional join — drops if any value is empty |
| `{# -date=y value}` | Universal formatter with flags |
| `{>> items}` | Sort ascending |
| `{>> -desc items}` | Sort descending |
| `{++ items}` | Aggregate (sum for numbers, concat for strings) |
| `{(. 0 items)}` | Nested expression — index access into `items` |

### Functions by category

- **Accessor** (`.`) — property access, dot-path traversal
- **Creator** (`^`, `~`, `\`, `@`, `<>`, `phone`, `address`, `currency`, `email`, …) — construct specialized values
- **Collector** (`++`, `++!!`) — sum, concat, count non-empty
- **Filter** (`&`, `|`, `|=`, `|?`, `&?`, `+?`) — boolean logic, membership, conditional join
- **Formatter** (`#`, `!`, `!!`) — universal format (dates, numbers, lists, JSON), negation
- **Mapper** (`+`, `-`, `*`, `/`, `%`, `>`, `<`, `>=`, `<=`, `=`, `==`, `!=`) — arithmetic and comparison
- **Joiner** (`+-`, `+:`) — join with separator
- **Sorter** (`>>`) — sort by type (numbers, dates, text, mixed)
- **Switcher** (`?`, `??`, `???`, `?:`) — ternary and case branching

See the test file (`tests/engine.test.js`) for worked examples of each category.

## User-defined snippets

Snippets are named functions defined inline, passed to the constructor. They can reference variables, call each other, and take positional or variadic arguments.

```js
const loom = new Loom(`
    [greet name] { Hello, {name}! }
    [fullName first last] { {first} {last} }
    [salutation title first last] { {+? title ' '}{fullName first last} }
`)

loom.render('{greet "Diego"}', () => undefined).trim()
// → "Hello, Diego!"

loom.render('{fullName "Diego" "Macrini"}', () => undefined).trim()
// → "Diego Macrini"

loom.render('{salutation "Dr." "Diego" "Macrini"}', () => undefined).trim()
// → "Dr. Diego Macrini"
```

Snippets defined inside `{ … }` (braces) are rendered as text templates. Snippets defined inside `( … )` are treated as expressions — `evaluateText` runs on them directly, useful for reusable data-transformation helpers.

## Custom JavaScript functions

For operations the standard library doesn't cover, register custom JS functions in the second constructor argument:

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    slug: (flags, value) => String(value).toLowerCase().replace(/\s+/g, '-'),
    double: (flags, n) => n * 2,
})

loom.evaluateText('uppercase "hello world"')    // → "HELLO WORLD"
loom.evaluateText('slug "My Great Title"')      // → "my-great-title"
loom.evaluateText('double 21')                  // → 42
```

Custom functions receive `(flags, ...args)` — `flags` is the parsed flag object (e.g., from `-foo=bar` in the expression) and `args` are the positional arguments.

## API

```js
import { Loom } from '@uniweb/loom'

new Loom(snippets?, customFunctions?)
//   snippets:          string of snippet definitions, OR { name: fnDef } object
//   customFunctions:   { name: (flags, ...args) => value }

loom.render(template, vars?, auxVars?)       // → string
loom.evaluateText(expr, vars?, auxVars?)     // → any
loom.setVariables(vars)                      // persist a default resolver
```

The `vars` argument can be either:
- A function `(key) => value`
- A plain object `{ key: value }` — converted to a function automatically

`auxVars` is a `Map` of local variables that don't modify the loom's default resolver — useful for scoped overrides.

## Documentation

Full docs live in [`docs/`](./docs/):

- **[Basics](./docs/basics.md)** — Start here. Placeholders, variables, functions, the main idioms.
- **[Quick guide](./docs/quick-guide.md)** — 10-minute tour of the most-used features.
- **[Language reference](./docs/language.md)** — Complete reference: every function, every flag, every syntactic form.
- **[Examples](./docs/examples.md)** — Worked examples organized by task.
- **[AI prompt](./docs/ai-prompt.md)** — Paste into ChatGPT/Claude to generate Loom expressions from plain English.
- **[History](./docs/history.md)** — The story of where Loom came from.

## Status

**Pre-1.0.** Core API (`render`, `evaluateText`, snippets, custom functions) is stable. The standard library is ported largely unchanged from an internal "unilang" mini-language that has been in production use for academic reporting since around 2018. 42 tests cover variables, math, conditionals, joins, sorting, formatting, logical operations, snippets, and report-style templates.

A natural-language layer called **Plain** — an English-like syntax that compiles to Loom's Polish notation, for authors who'd rather write `{SHOW publications.title SORTED BY date}` than learn the symbolic form — is designed but not yet implemented. It will ship as a separate subpath export at `@uniweb/loom/plain`.

## See also

- [`@uniweb/press`](https://github.com/uniweb/press) — A React library for generating Word (and soon Excel/PDF) documents. Loom fits naturally with Press when your document content contains dynamic `{placeholders}` — the `instantiateContent` helper in `@uniweb/press/sdk` walks a content tree and resolves placeholders through a Loom instance before the document is rendered.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
