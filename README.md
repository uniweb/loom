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

### Keyword casing and shadowing

Plain-form keywords (`SHOW`, `WHERE`, `SORTED BY`, `COUNT OF`, `IF`, `AND`, `OR`, …) can be written in any case — `SHOW`, `show`, and `Show` all parse as the same keyword. ALL CAPS reads clearer and is the convention in examples and the language reference, but lowercase works too.

**Variable names can shadow keywords in most positions.** Loom recognizes keywords only where the grammar actually expects one — at the start of a placeholder for construct verbs (`SHOW`, `IF`, `COUNT OF`, …), immediately after a value for modifiers (`WHERE`, `AS`, `SORTED BY`, …), and in specific sub-keyword slots inside constructs (`THEN`, `ELSE`, `IN`, `DO`, …). A word in any other position — including any value position — is always an identifier. So user variables that happen to share a name with a keyword just work:

```
{count}              // your variable named `count`
{COUNT OF items}     // the aggregation keyword
{SHOW count}         // "show the count variable"
{person.where}       // dotted access to a `where` field
{title SORTED BY year}   // `title` is a bare value, SORTED BY is a modifier
```

**The one exception**: a custom function registered under a name that matches a **single-word construct keyword** (`show`, `if`) cannot be invoked through Plain's function-call syntax, because the grammar sees that word as the construct verb at the start of a placeholder. If you need a custom function with that name, either rename it or call it through `@uniweb/loom/core` with Compact-form templates, which don't recognize Plain keywords:

```js
const loom = new Loom({}, {
    show: (flags, value) => `[${value}]`, // ⚠ unreachable from Plain
})
loom.render('{show "Hi"}') // → "Hi", not "[Hi]"
```

Multi-word keyword prefixes (`count of`, `total of`, `sum of`, `average of`, `for each`) don't have this limitation — `{count "x"}` with a custom `count` function works fine because `count` alone isn't a keyword (only `count of` is).

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

## Instantiating structured documents

`render()` and `evaluateText()` operate on strings. When your templates live inside a structured document — a ProseMirror tree, a Uniweb markdown page, any content graph where the text to resolve is buried in text nodes — use `instantiateContent` to walk the tree and resolve placeholders in place:

```js
import { Loom, instantiateContent } from '@uniweb/loom'

const loom = new Loom()

const doc = {
    type: 'doc',
    content: [
        {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Hello {first_name}!' }],
        },
        {
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: 'You have {COUNT OF publications WHERE refereed} refereed publications.',
                },
            ],
        },
    ],
}

const resolved = instantiateContent(doc, loom, (key) => profile[key])
```

`instantiateContent(content, engine, vars)` accepts:

- `content` — a ProseMirror-style document (`{ type: 'doc', content: [...] }`) or a plain array of nodes. Any node without a text field or children passes through unchanged.
- `engine` — any object with a `render(text, vars)` method. A `Loom` instance is the expected caller, but the duck-typed contract means the walker can be reused by any future template engine.
- `vars` — a `(key) => value` resolver, same shape `Loom.render()` accepts.

The function returns a new tree with every text node's `text` field run through `engine.render()`. The input is not mutated.

The primary consumer is a Uniweb foundation's content handler, which instantiates a report template against a freshly-fetched profile before it ever reaches the renderer:

```js
// foundation.js
import { Loom, instantiateContent } from '@uniweb/loom'

const engine = new Loom()

export default {
    handlers: {
        content(content, block) {
            const data = block.content?.data
            if (!data) return content
            return instantiateContent(content, engine, (key) => data[key])
        },
    },
}
```

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

Stable core API (`render`, `evaluateText`, snippets, custom functions). 175 tests cover the evaluator, both surface forms, snippets, and report-style templates. Used in production for academic CV and funding reports.

## See also

- [`@uniweb/press`](https://github.com/uniweb/press) — A React library for generating Word (and soon Excel/PDF) documents. Loom fits naturally with Press when your document content contains dynamic `{placeholders}`: a Uniweb foundation's content handler can call `instantiateContent` (exported from `@uniweb/loom`) to resolve placeholders against live data before Press ever sees the content.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
