# @uniweb/loom

An expression language for weaving live data into text. Loom lets you filter, sort, aggregate, format, and localize data inline — a single placeholder can produce a sentence, a list, a sum, or a formatted date range, all resolved from the same data source.

Pure JavaScript. Zero runtime dependencies. Works in Node and the browser.

```bash
npm install @uniweb/loom
```

## What Loom is for

Every template engine handles `Hello {name}`. Where Loom earns its keep is when the other side of the placeholder isn't a string — it's a list of publications, a set of grants, a tree of addresses, a collection of section headings. Loom was built for reports where the hard part is "format this date range, drop the clause if either end is missing, and localize the field label" — all in one line.

**Loom is to templates what SQL is to data.** A developer writes the template; non-technical authors read and validate the business logic expressed in it, and often adjust it over time without needing a developer to re-ship. SQL is a language developers write but analysts can read and edit; Loom is the same, applied to text generation instead of queries.

Concretely, a single Loom expression can:

- Reach into nested data with dot paths (`{publications.title}`)
- Filter a list by condition (`{SHOW publications.title WHERE refereed}`)
- Sort it (`SORTED BY date DESCENDING`)
- Join it with a separator (`JOINED BY ', '`)
- Format each element (`AS long date`, `AS currency USD`, `AS phone`)
- Aggregate (`{TOTAL OF grants.amount}`, `{COUNT OF publications WHERE refereed}`)
- Compose all of the above in a single placeholder

When data is missing, the enclosing clause quietly drops — no dangling commas, no `"Dr. undefined"`, no broken grammar. Operations apply element-by-element to lists by default, so you rarely write an explicit loop.

Loom runs entirely in the browser or in Node. No backend, no build step, no templating server. You instantiate it once and call `render()` or `evaluateText()`.

## Quick start

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()

loom.render('Hello {name}!', { name: 'Diego' })
// → "Hello Diego!"
```

And a realistic one:

```js
const profile = {
    first_name: 'Diego',
    family_name: 'Macrini',
    publications: [
        { title: 'Cellular Bio', year: 2018, refereed: true },
        { title: 'Forestry', year: 2022, refereed: false },
        { title: 'Hydrology', year: 2023, refereed: true },
    ],
}

loom.render(
    'Hello {first_name}! You have {COUNT OF publications} publications, ' +
        '{COUNT OF publications WHERE refereed} of them refereed.',
    profile
)
// → "Hello Diego! You have 3 publications, 2 of them refereed."

loom.render(
    'Recent refereed work: ' +
        '{SHOW publications.title WHERE refereed SORTED BY year DESCENDING JOINED BY ", "}.',
    profile
)
// → "Recent refereed work: Hydrology, Cellular Bio."
```

## Two methods

A Loom instance has two main methods:

- **`loom.render(template, vars)`** — walks a template string, evaluates every `{…}` placeholder, returns the resolved text.
- **`loom.evaluateText(expression, vars)`** — evaluates a single expression and returns any type. Use this when you want the data itself (an array, a number, a boolean) rather than a string.

```js
loom.evaluateText('COUNT OF publications WHERE refereed', profile)
// → 2    (a number, not a string)

loom.evaluateText('SHOW publications.title SORTED BY year DESCENDING', profile)
// → ['Hydrology', 'Forestry', 'Cellular Bio']
```

The `vars` argument can be a plain object or a `(key) => value` resolver function.

## Two surface forms

Loom is one language with two surface forms: **Plain form** (natural-language, the default) and **Compact form** (symbolic, power-user). Both parse to the same internal representation and run on the same evaluator.

**Plain form** reads like a description of what you want:

```
{SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ', '}
{TOTAL OF grants.amount AS currency USD}
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
```

**Compact form** is terser and uses Polish-notation operators. It's the symbolic equivalent of Plain form, and you can write it directly when you want less ceremony:

```
{+: ', ' (>> -desc -by=date (? refereed publications.title))}
{# -currency=usd (++ grants.amount)}
{? (>= age 18) 'Adult' 'Minor'}
```

You can mix the two freely. A nested `{…}` inside a Plain-form expression passes through as Compact form, which is the clean way to reach for symbolic precision inside an otherwise natural-language template:

```
{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}
```

Both forms are equally expressive. Pick whichever reads better for the expression in front of you.

### Keyword casing

Plain-form keywords (`SHOW`, `WHERE`, `SORTED BY`, `COUNT OF`, `IF`, `AND`, `OR`, …) can be written in any case — `SHOW`, `show`, and `Show` all parse as the same keyword. **ALL CAPS is the stable contract:** if you write a keyword in ALL CAPS, it is guaranteed to be interpreted as a keyword, now and in every future version.

Lowercase is SQL-style convenience. If you have a variable or custom function with the same name as a Plain keyword (`count`, `show`, `where`, etc.), write the keyword in ALL CAPS to keep them distinct:

```
{COUNT OF items}     // always the Plain keyword
{count}              // your variable named `count`
```

When in doubt, uppercase.

## What makes it different

Three things Loom does that most template engines don't:

**List-aware by default.** Most functions operate element-by-element on lists. `{+ prices 10}` adds 10 to each price. `{> ages 18}` returns a list of booleans. Accessing a property on a list of objects (`{publications.title}`) returns the list of titles. The stdlib is built around this — filter, sort, join, format, aggregate all work on lists without an explicit loop.

**Graceful with missing data.** In Loom, a value is **empty** if it's `""`, `null`, `undefined`, `NaN`, `[]`, or `{}` — things that shouldn't appear in output. The conditional join drops the enclosing clause if any referenced value is empty:

```
{+? 'Dr. ' title}
// → "Dr. Smith"    if title is "Smith"
// → ""             if title is missing
```

This is how you write `{', ' city province country}` and have it gracefully collapse to `"Fredericton, Canada"` when `province` is missing — no double commas, no dangling separators.

Numbers are never empty — `0` is a legitimate value and joins into output normally:

```
{+? 'Likes: ' likes}
// → "Likes: 0"     if likes is 0
// → ""             if likes is null or missing
```

For conditional logic (rather than output), the ternary `?` uses a broader "falsy" check where `0`, `false`, and empty collections all count as false:

```
{? likes 'has likes' 'no likes'}
// likes = 0     → "no likes"
// likes = 5     → "has likes"
```

The split is deliberate: **empty** is about "should this drop from output?" and **falsy** is about "is this a false condition?" Most users never have to think about the distinction — it just does the right thing.

**Inline pipelines.** Filter → sort → join → format → label is a single expression, not a chain of helpers. A realistic report line:

```
Awarded {TOTAL OF grants.amount AS currency USD} across {COUNT OF grants} grants,
averaging {AVERAGE OF grants.amount AS currency USD} each.
```

## Snippets

Snippets are user-defined named functions declared inline. Once defined, they behave like built-in functions.

```js
const loom = new Loom(`
    [greet name]          { Hello, {name}! }
    [fullName first last] { {first} {last} }
    [xor a b]             (& (| a b) (! (& a b)))
`)

loom.render('{greet "Diego"}')                 // → "Hello, Diego!"
loom.render('{fullName "Diego" "Macrini"}')    // → "Diego Macrini"
loom.evaluateText('xor true false')            // → true
```

Snippet bodies in `{…}` are text templates (evaluated with `render`), and bodies in `(…)` are expressions (evaluated with `evaluateText`). Snippet bodies accept both Plain and Compact forms, just like any other Loom expression.

Snippets can call other snippets, reference outer variables, and accept variadic `...args`. See the [language reference](./docs/language.md#snippets) for the full feature set including the `$0` flag-bag parameter.

## Custom JavaScript functions

For operations the standard library doesn't cover, register custom JS functions in the second constructor argument:

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    slug:      (flags, value) => String(value).toLowerCase().replace(/\s+/g, '-'),
    daysSince: (flags, date) => Math.floor((Date.now() - new Date(date)) / 86400000),
})

loom.evaluateText('uppercase "hello world"')   // → "HELLO WORLD"
loom.evaluateText('slug "My Great Title"')     // → "my-great-title"
```

Custom functions receive `(flags, ...args)` — `flags` is the parsed option bag, `args` are the positional arguments.

## The lower layer: `@uniweb/loom/core`

`@uniweb/loom` includes the Plain-form parser by default. If you only write Compact form and want to skip the Plain parser entirely, import the core engine:

```js
import { LoomCore } from '@uniweb/loom/core'

const loom = new LoomCore()
loom.render("{', ' city province country}", profile)
```

`LoomCore` has the same API as `Loom` but does not recognize Plain-form keywords. Use it when you're writing purely Compact-form templates and want the parser bypass. For most users, the default `Loom` export is the right choice.

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

The `vars` argument can be a function `(key) => value` or a plain object. `auxVars` is a `Map` of local variables that don't modify the default resolver — useful for scoped overrides.

## Documentation

Full docs live in [`docs/`](./docs/):

- **[Basics](./docs/basics.md)** — Start here. Placeholders, variables, functions, the main idioms.
- **[Quick guide](./docs/quick-guide.md)** — 10-minute tour of the most-used features.
- **[Language reference](./docs/language.md)** — Complete reference: every function, every flag, every syntactic form, both surface forms.
- **[Examples](./docs/examples.md)** — Worked examples organized by task.
- **[AI prompt](./docs/ai-prompt.md)** — Paste into ChatGPT/Claude to generate Loom expressions from plain English.

## Status

Stable core API (`render`, `evaluateText`, snippets, custom functions). 128 tests cover the evaluator, both surface forms, snippets, and report-style templates. Used in production for academic CV and funding reports.

## See also

- [`@uniweb/press`](https://github.com/uniweb/press) — A React library for generating Word (and soon Excel/PDF) documents. Loom fits naturally with Press when your document content contains dynamic `{placeholders}` — the `instantiateContent` helper in `@uniweb/press/sdk` walks a content tree and resolves placeholders through a Loom instance before the document is rendered.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
