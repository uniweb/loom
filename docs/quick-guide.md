# Loom Quick Guide

A 10-minute tour of the features you'll use most often. Read [`basics.md`](./basics.md) first if you haven't — this guide assumes you know what placeholders and Plain form are.

## Setup

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()
```

You create one `Loom` instance and reuse it. It holds your snippet library and any custom JavaScript functions, and has two main methods:

- `loom.render(template, vars)` — walks a template string, evaluates every `{…}`, returns resolved text
- `loom.evaluateText(expr, vars)` — evaluates a single expression, returns any type

The `vars` argument is either a plain object or a `(key) => value` function — both work the same way.

## Variables and dot notation

```js
const data = {
    first_name: 'Diego',
    family_name: 'Macrini',
    member: {
        age: 42,
        address: { city: 'Fredericton', province: 'NB' },
    },
}
```

```
{first_name}                       // "Diego"
{family_name}                      // "Macrini"
{member.age}                       // 42
{member.address.city}              // "Fredericton"
```

Accessing a property on a list of maps gives you the list of that property:

```js
const data = {
    publications: [
        { title: 'A', year: 2020 },
        { title: 'B', year: 2021 },
    ],
}
```

```
{publications.title}               // ["A", "B"]
```

## Joining with a separator

When the first token inside a placeholder is a quoted string, it's the separator:

```
{', ' first_name family_name}
// → "Diego, Macrini"

{', ' member.address.city member.address.province country}
// → "Fredericton, NB"        (country missing, skipped)
```

Empty values are dropped — no dangling separators.

## Conditional join

`+?` joins only if all referenced values are present. If any are empty, the whole expression is empty:

```
{+? 'Dr. ' title}
// title = "Macrini"  → "Dr. Macrini"
// title missing      → ""

{+? '(' (', ' affiliation department) ')'}
// → "(Engineering, UNB)"   or   ""
```

This is the single most important idiom in Loom for writing templates that handle missing data gracefully.

## SHOW and modifiers

`SHOW` displays a value with optional modifiers. The modifiers can appear in any order:

```
{SHOW publications.title WHERE refereed SORTED BY year DESCENDING JOINED BY ', '}
```

The five main modifiers:

| Modifier | What it does |
|---|---|
| `WHERE` (or trailing `IF`) | Filter a list by condition |
| `SORTED BY … ASCENDING`/`DESCENDING` | Sort a list |
| `JOINED BY 'sep'` | Custom separator when rendering |
| `AS format` | Format the value |
| `WITH LABEL` | Prepend a localized label |

### Sorting

```
{SHOW items}                                 // plain display
{SHOW items SORTED BY name}                  // ascending (default)
{SHOW items SORTED BY name DESCENDING}       // descending
{SHOW dates FROM HIGHEST TO LOWEST date}     // long form, same as DESCENDING
```

### Filtering

```
{SHOW publications.title WHERE refereed}
{SHOW publications.title WHERE year > 2020}
{SHOW publications.title WHERE refereed AND year > 2020}
{SHOW publications.title WHERE funded OR sponsored}
{SHOW publications.title WHERE NOT draft}
```

Bare identifiers in the `WHERE` clause are automatically prefixed with the list root — `refereed` in the condition means `publications.refereed`. Drop into a `{…}` sub-expression if you need to reference a top-level variable from inside a filter.

### Joining

```
{SHOW publications.title JOINED BY ', '}
{SHOW publications.title JOINED BY ' • '}
{SHOW publications.title JOINED BY '\n'}
```

### Formatting

```
{SHOW start_date AS long date}       // → "January 15, 2000"
{SHOW start_date AS full date}       // → "Saturday, January 15, 2000"
{SHOW start_date AS year only}       // → "2000"
{SHOW price AS number}               // → "1,200"    (locale grouping)
{SHOW members AS JSON}               // → JSON string
```

Supported format types: `date` (styles: `long`, `full`, `short`, `medium`, `year only`, `month only`), `number`, `JSON`, plus the specialized creators `currency`, `phone`, `address`, `email` (see the [language reference](./language.md#creators) for their object forms).

### Labels

```
{SHOW price WITH LABEL}              // uses the default label for price
{SHOW price WITH LABEL 'Cost'}       // custom label
```

## Conditionals

### IF … OTHERWISE

```
{IF is_member SHOW 'Member' OTHERWISE SHOW 'Guest'}
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
```

Several shorter forms all compile to the same thing:

```
{IF age >= 18 SHOW 'Adult' OTHERWISE 'Minor'}     // SHOW after OTHERWISE optional
{IF age >= 18 THEN 'Adult' ELSE 'Minor'}          // SQL-style
{IF age >= 18 'Adult' 'Minor'}                    // bare values
```

The `OTHERWISE` branch is optional. Without it, a false condition produces an empty string:

```
{IF is_premium SHOW '⭐ Premium'}
```

### Leading IF vs trailing IF

There are two places `IF` can appear, and they mean different things:

- **Leading `IF`** — branching. `{IF condition SHOW A OTHERWISE SHOW B}` picks between two values.
- **Trailing `IF`** — filter. `{SHOW list.property IF condition}` is a synonym for `WHERE` and keeps matching elements.

Use `IF` at the start when you're branching and at the end when you're filtering.

### Multi-branch

For more than two branches, drop into Compact form (covered below) with `??` / `???`:

```
{??? (> age 65) (> age 18) (> age 13) 'Senior' 'Adult' 'Teen' 'Child'}
```

## Aggregation

Four verbs that collapse a list to a single value:

```
{TOTAL OF grants.amount}                     // sum of all amounts
{SUM OF grants.amount}                       // same as TOTAL OF
{AVERAGE OF grants.amount}                   // mean
{COUNT OF publications}                      // how many publications
{COUNT OF publications WHERE refereed}       // how many refereed
```

All four accept `WHERE`, `AS`, and `WITH LABEL`:

```
{TOTAL OF grants.amount WHERE active AS currency USD}
{COUNT OF publications WHERE year > 2020 WITH LABEL 'Recent'}
```

The `WHERE` on `SUM`, `TOTAL`, and `AVERAGE` filters the source list before aggregating — `SUM OF grants.amount WHERE active` is the sum of active-grant amounts.

## Composition in a single expression

Modifiers chain naturally in whichever order reads best:

```
{SHOW publications.title WHERE refereed AND year > 2020
    SORTED BY year DESCENDING JOINED BY ', '}
```

The translator applies modifiers in a canonical order internally (filter → sort → join → format → label), so surface order is a readability choice, not a semantic one.

## Snippets

Define reusable patterns and pass them to the constructor:

```js
const loom = new Loom(`
    [greet name]           { Hello, {name}! }
    [fullName first last]  { {first} {last} }
    [recent pubs]          ( SHOW pubs.title WHERE year > 2020 )
    [countRefereed pubs]   ( COUNT OF pubs WHERE refereed )
`)
```

Use them like built-in functions:

```
{greet "Alice"}                      // "Hello, Alice!"
{fullName "Diego" "Macrini"}         // "Diego Macrini"
```

Body conventions:

- **`{ body }`** — text template, evaluated with `render()`
- **`( body )`** — expression, evaluated with `evaluateText()`

Snippet bodies accept Plain form, Compact form, or a mix.

## Custom JavaScript functions

For operations Loom's standard library doesn't cover, register custom functions in the second constructor argument:

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    slug:      (flags, value) => String(value).toLowerCase().replace(/\s+/g, '-'),
    daysSince: (flags, date) => {
        const diff = Date.now() - new Date(date).getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    },
})

loom.evaluateText('uppercase "hello world"')   // → "HELLO WORLD"
loom.evaluateText('slug "My Great Title"')     // → "my-great-title"
```

Custom functions receive `(flags, ...args)` — `flags` is the parsed flag bag from any `-name` or `-name=value` arguments, and `args` are the positional arguments.

## Compact form — the symbolic shorthand

Plain form covers the common cases. Loom has a second surface, **Compact form**, that uses Polish-notation operators. It's the same language — same evaluator, same semantics — just terser.

```
Plain:   {SHOW publications.title SORTED BY year DESCENDING JOINED BY ', '}
Compact: {+: ', ' (>> -desc -by=year publications.title)}
```

A few Compact building blocks you'll see in examples:

```
{+ 2 3}                    // → 5
{+ price 10}               // add 10 to price
{+ prices 10}              // add 10 to each element of prices (list-aware)
{? condition 'yes' 'no'}   // ternary
{>> items}                 // sort ascending
{>> -desc items}           // sort descending
{++ prices}                // sum
{++!! items}               // count of non-empty values
{# -date=long start_date}  // format as date
{# -currency=usd price}    // format as currency
```

You can mix the two forms freely. A nested `{…}` inside a Plain expression passes through as Compact form:

```
{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}
```

This is the clean way to reach for symbolic precision when Plain's verbs don't quite cover what you want.

The [language reference](./language.md) documents both forms in full.

## Common idioms

### Graceful sentence construction

Build a sentence where some parts may be missing:

```
{+? 'Awarded in ' year}{+? ' by ' granting_body}{+? ', totaling ' (TOTAL OF amounts)}.
```

Any missing field drops its own clause without breaking the grammar.

### Labeled field

```
{+? (@ field_name) ': ' field_value}
// → "Address: 123 Main St"   (if both present, otherwise empty)
```

### Localized date range

```
{SHOW (~ start_date end_date) AS ym date}
// → "January 2020 – December 2022"
```

## What's next

- **[Language reference](./language.md)** — every verb, every modifier, every function, every flag
- **[Examples](./examples.md)** — worked examples organized by task
- **[AI prompt](./ai-prompt.md)** — paste into an LLM chat to generate Loom expressions from plain-English requirements
