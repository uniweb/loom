# @uniweb/loom

A small expression language for **weaving data into text**. Polish-notation syntax, ~80 built-in functions (sort, filter, aggregate, format, join, compare, branch), user-defined snippets, and a two-mode API: string templating *and* typed expression evaluation.

Pure JavaScript. No dependencies. Works in Node and the browser. ~15KB unminified.

```bash
npm install @uniweb/loom
```

## Two modes

### `render(template, vars)` — text with placeholders

Find every `{…}` in a string, evaluate each, and return the resolved text.

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()
const profile = { first_name: 'Diego', family_name: 'Macrini', city: 'Fredericton' }

loom.render('Hello {first_name} {family_name}', (key) => profile[key])
// → "Hello Diego Macrini"

loom.render("{', ' city province country}", (key) => ({ ...profile, province: 'NB', country: 'Canada' })[key])
// → "Fredericton, NB, Canada"

loom.render("{+? 'Dr. ' title}", (key) => ({ title: 'Macrini' })[key])
// → "Dr. Macrini"

loom.render("{+? 'Dr. ' title}", () => undefined)
// → "" (conditional join drops when value missing)
```

### `evaluateText(expr, vars)` — typed expression evaluation

Evaluate a single expression and return any type (number, boolean, array, object, …). Useful for data selection, filtering, and transformation pipelines.

```js
loom.evaluateText('+ 1 2')                      // → 3
loom.evaluateText('> 5 3')                      // → true
loom.evaluateText('? true "yes" "no"')          // → "yes"
loom.evaluateText('>> 2 1 3')                   // → [1, 2, 3]
loom.evaluateText('>> -desc 2 1 3')             // → [3, 2, 1]
loom.evaluateText('++ 1 2 3')                   // → 6

// With variables
const data = { items: ['apple', 'banana', 'cherry'] }
loom.evaluateText('items', (k) => data[k])      // → ['apple', 'banana', 'cherry']
```

## Syntax at a glance

Loom uses **Polish notation** — the function comes first, arguments follow:

| Form | Meaning |
|---|---|
| `{name}` | Variable substitution |
| `{@name}` | Variable label (e.g., for localized field names) |
| `{+ a b c}` | Concatenate/add |
| `{", " a b c}` | Join with separator (literal string leads → join) |
| `{? cond yes no}` | Ternary conditional |
| `{+? prefix value}` | Conditional join (drops if any value is empty) |
| `{# -date=y value}` | Universal formatter with flags |
| `{>> items}` | Sort |
| `{>> -desc items}` | Sort descending |
| `{++ items}` | Aggregate (sum/concat) |
| `{(. 0 items)}` | Nested expression — index access |
| `{/path/to/value}` | Path access |

### Functions by category

- **Accessor** (`.`) — property access, dot notation
- **Creator** (`^`, `~`, `\\`, `@`, `<>`, `phone`, `address`, `currency`, `email`, …) — construct specialized values
- **Collector** (`++`, `++!!`) — sum, concat, count
- **Filter** (`&`, `|`, `|=`, `|?`, `&?`, `+?`) — boolean logic, membership, conditional join
- **Formatter** (`#`, `!`, `!!`) — universal format (dates, numbers, lists, JSON), negation
- **Mapper** (`+`, `-`, `*`, `/`, `%`, `>`, `<`, `>=`, `<=`, `=`, `==`, `!=`) — arithmetic, comparison
- **Joiner** (`+-`, `+:`) — join with separator
- **Sorter** (`>>`) — sort by type (numbers, dates, text, mixed)
- **Switcher** (`?`, `??`, `???`, `?:`) — ternary/case branching

## User-defined snippets

Snippets are named functions defined inline in a string, passed to the constructor. They can call each other and accept positional or variadic arguments.

```js
const loom = new Loom(`
  [greet name] { Hello, {name}! }
  [fullName first last] { {first} {last} }
`)

loom.render('{greet "Diego"}')                    // → "Hello, Diego! "
loom.render('{fullName "Diego" "Macrini"}')       // → "Diego Macrini "
```

## Custom JavaScript functions

Register custom JS functions for anything the built-in library doesn't cover:

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    double: (flags, n) => n * 2,
})

loom.evaluateText('uppercase "hello"')    // → "HELLO"
loom.evaluateText('double 21')             // → 42
```

## API

```js
import { Loom } from '@uniweb/loom'

new Loom(snippets?, customFunctions?)
  //   snippets: string definitions, or { name: fn } object
  //   customFunctions: { name: (flags, ...args) => value }

.render(template, vars, auxVars?)       // → string
.evaluateText(expr, vars?, auxVars?)    // → any
.setVariables(vars)                     // set the default variable resolver
```

The `vars` argument can be either:
- A function `(key) => value`
- An object `{ key: value }` (shallow lookup)

## Status

**Pre-1.0.** Core API is stable (`render`, `evaluateText`). Function library is stable — it's ported largely unchanged from Uniweb's internal "unilang" language which has been in production use for academic CV and research report generation.

## Origin

Loom was extracted from Uniweb's internal `TemplateCore` / `unilang` — a mini-language originally built around 2018 for academic report generation (faculty CVs, funding summaries, publication lists at University of New Brunswick, Saint Mary's University, and University of Ottawa). The extracted version removes all Uniweb-specific concerns (citation handling, profile model assumptions) and ships a clean, domain-neutral expression engine.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
