# Plain

> **Note (2026-04):** Plain form is now the default surface for `@uniweb/loom`. The separate `@uniweb/loom/plain` subpath has been removed — import `Loom` from `@uniweb/loom` and you get Plain form out of the box. See the top-level [`README.md`](../README.md) for the current API. This reference document still uses the old `Plain` class name in its examples and imports; treat it as a syntax reference while it waits for a full rewrite. Wherever you see `new Plain(...)`, read it as `new Loom(...)` from `@uniweb/loom`.

**Plain** is a natural-language layer on top of Loom. It lets you write template expressions in English-like phrases that compile to Loom's Polish notation at parse time.

Where Loom is compact and symbolic:

```
{+: ', ' (>> -desc -by=date (? refereed publications.title))}
```

Plain says the same thing the way you'd describe it to a colleague:

```
{SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ', '}
```

Both compile to the same Loom expression and run on the same evaluator. Plain is purely a parsing/translation layer — there's no separate runtime, no new semantics. Anything Plain can do, Loom can do; Plain just lets you say it differently.

This page teaches Plain from the ground up. Read [Loom basics](./basics.md) first if you're new to the underlying engine — Plain inherits Loom's variable model, data types, and standard library.

## Why Plain

Plain exists for one audience: **non-technical or lightly-technical staff** who write report templates but don't want to memorize a symbolic language. If you're a developer comfortable with Polish notation, stick with Loom — it's shorter. If you're a research-office coordinator writing a CV template and you'd rather write what you mean than learn `>>` and `++!!`, reach for Plain.

Plain is a strict superset of Loom, so you can mix freely. A template can use Plain for the human-readable bits and drop into raw Loom when Plain would be awkward.

## Quick start

```js
import { Plain } from '@uniweb/loom/plain'

const plain = new Plain()
const vars = {
    first_name: 'Diego',
    publications: [
        { title: 'Cellular Bio', year: 2018, refereed: true },
        { title: 'Forestry', year: 2022, refereed: false },
        { title: 'Hydrology', year: 2023, refereed: true },
    ],
}

plain.render(
    'Hello {first_name}! You have {COUNT OF publications} publications, ' +
        '{COUNT OF publications WHERE refereed} of them refereed.',
    vars
)
// → "Hello Diego! You have 3 publications, 2 of them refereed."
```

Plain ships as a subpath export at `@uniweb/loom/plain` so templates that don't need it don't pay the parser cost. Constructor, API, variable model, and snippet system are identical to `Loom`.

## The core idea: SHOW

The main verb in Plain is `SHOW`. It displays a value, with optional modifiers that filter, sort, join, format, and label the result.

```
{SHOW publication.title}
```

SHOW is optional when the expression is just a value:

```
{publication.title}
```

These two forms compile to exactly the same Loom expression (`{publication.title}`) and render identically. Use SHOW when you want to add modifiers — it reads better — and omit it for bare values.

### Case-insensitive, comma-friendly

Plain doesn't care about keyword casing: `SHOW`, `show`, `Show` all work. Commas between words are optional punctuation and are dropped by the parser. So all of these are equivalent:

```
{SHOW publication.title SORTED BY date DESCENDING}
{show publication.title sorted by date descending}
{Show publication.title, sorted by date, descending}
```

Docs and examples use ALL CAPS for visual distinction from data variables, but the parser accepts any casing. Pick whichever style reads best to you.

## Modifiers

SHOW accepts a chain of post-fix modifiers that can appear in any order. Each modifier transforms the value before it reaches the output.

### AS — format

Formats a value. The word after `AS` becomes the format type.

```
{SHOW publication.date AS long date}        → "March 15, 2024"
{SHOW publication.date AS short date}       → "3/15/24"
{SHOW publication.date AS year only}        → "2024"
{SHOW price AS currency USD}                → "$99.00"
{SHOW member.phone AS phone}                → "(555) 123-4567"
{SHOW data AS JSON}                         → '{"key":"value"}'
```

The recognized format types are: `date` (with modifiers `long`, `full`, `short`, `medium`, `year only`, `month only`), `currency` (with an optional currency code), `number`, `phone`, `address`, `email`, `JSON`, `label`, `text`, and `tag`. Unknown types fall through to Loom as best-effort flag names.

### WITH LABEL — prepend a label

Prepends a localized label to the value:

```
{SHOW price WITH LABEL}                     → "Price: $99.00"
{SHOW price WITH LABEL 'Cost'}              → "Cost: $99.00"
```

Without a custom label, Loom looks up the variable's localized label (the same lookup as `@`-prefix in raw Loom).

### WHERE / trailing IF — filter

Filters a list. `WHERE` and trailing `IF` are synonyms — use whichever reads better in context.

```
{SHOW publications.title WHERE refereed}
{SHOW publications.title IF refereed}
```

Compound conditions use `AND`, `OR`, `NOT` (or `&&`, `||`, `!` for users coming from programming languages):

```
{SHOW publications.title WHERE refereed AND year > 2020}
{SHOW publications.title WHERE funded OR sponsored}
{SHOW publications.title WHERE NOT draft}
```

### SORTED BY — sort a list

```
{SHOW publications.title SORTED BY publications.date}
{SHOW publications.title SORTED BY date ASCENDING}
{SHOW publications.title SORTED BY date DESCENDING}
```

`ASCENDING` is the default and can be omitted. For readers who prefer the longer form, Plain also accepts:

```
{SHOW publications.title FROM LOWEST TO HIGHEST date}
{SHOW publications.title FROM HIGHEST TO LOWEST date}
```

Both forms compile to the same Loom sort expression.

### JOINED BY — custom separator

By default, a list is joined with `, ` when it reaches the output. Use `JOINED BY` to pick a different separator:

```
{SHOW publications.title JOINED BY ', '}
{SHOW publications.title JOINED BY ' • '}
{SHOW publications.title JOINED BY '\n'}
```

## Conditionals: IF ... OTHERWISE

Plain has a branching form that reads like a sentence:

```
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
```

Several shorter forms also work — use whichever feels most natural:

```
{IF age >= 18 SHOW 'Adult' OTHERWISE 'Minor'}       // SHOW after OTHERWISE optional
{IF age >= 18 THEN 'Adult' ELSE 'Minor'}            // SQL-style
{IF age >= 18 'Adult' 'Minor'}                      // Bare values
```

All four compile to the same Loom expression: `{? (>= age 18) 'Adult' 'Minor'}`.

The `OTHERWISE` branch is optional — a trailing IF with no alternate is allowed:

```
{IF refereed SHOW 'Peer-reviewed'}
```

### Trailing IF vs. leading IF

There are two places `IF` can appear, and they mean different things:

- **Leading IF** (branching): `{IF condition SHOW A OTHERWISE SHOW B}` — picks between two values based on the condition.
- **Trailing IF** (filter): `{SHOW list.property IF condition}` — keeps list elements where the condition is true, drops the rest.

The trailing form is a synonym for `WHERE` and is meant for list filtering. Use `IF` at the start of an expression when you're branching, and at the end when you're filtering.

## Aggregation

Plain has four aggregation verbs for summing, averaging, and counting lists:

```
{TOTAL OF grants.amount}         → sum of all grant amounts
{SUM OF grants.amount}           → same as TOTAL OF
{AVERAGE OF grants.amount}       → mean of all grant amounts
{COUNT OF publications}          → number of publications
```

`COUNT OF` accepts a `WHERE` clause to count only matching items:

```
{COUNT OF publications WHERE refereed}
{COUNT OF publications WHERE year > 2020}
{COUNT OF publications WHERE refereed AND year > 2020}
```

All four aggregation verbs can be combined with the formatting modifiers:

```
{TOTAL OF grants.amount AS currency USD}
{AVERAGE OF grants.amount AS currency}
```

## Composition

Modifiers compose naturally. You can chain filter, sort, join, and format in a single expression, in the order that reads best:

```
{SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ', '}
```

The translator applies them in a canonical order internally (filter → sort → join → format → label), so the surface ordering doesn't change the result. Write them in whatever order reads most naturally.

Realistic report examples:

```
CV for {first_name} {family_name} at {institution}.

Total publications: {COUNT OF publications}.
Refereed publications: {COUNT OF publications WHERE refereed}.

Funding history: from {start_year} to {end_year}, received a total of
{TOTAL OF grants.amount AS currency USD} from {COUNT OF grants} grants,
averaging {AVERAGE OF grants.amount AS currency USD} per grant.

Recent refereed work:
{SHOW publications.title WHERE refereed AND year > 2020 SORTED BY date DESCENDING JOINED BY '\n'}
```

## Snippets

Plain fully supports Loom's snippet system — you can write snippet bodies in Plain syntax, and both text-body (`{ ... }`) and expression-body (`( ... )`) forms work. Snippet bodies are translated to Loom once at construction time, so there's no per-call overhead.

```js
import { Plain } from '@uniweb/loom/plain'

const plain = new Plain(`
    [greet name] { Hello, {SHOW name}! }
    [total grants] ( TOTAL OF grants.amount )
    [refereedCount pubs] ( COUNT OF pubs WHERE refereed )
    [recent pubs] ( SHOW pubs.title WHERE year > 2020 )
`)
```

Because Plain is a strict superset of Loom, raw-Loom snippet bodies continue to work unchanged — useful when you want the brevity of Polish notation for a particular helper.

### Calling snippets

Inside a Plain template, call a snippet like any Loom function — an identifier followed by positional arguments:

```
{greet "Diego"}
{bold (SHOW price AS currency USD)}
```

The second form passes a Plain sub-expression as an argument: the inner `SHOW ... AS currency USD` is translated to `(# -currency=usd price)` and handed to the `bold` snippet as a single formatted-value argument.

### WHERE condition prefixing

When a `WHERE` clause uses bare identifiers, Plain prefixes them with the list root so the condition evaluates per-element via Loom's list-awareness:

```
{SHOW publications.title WHERE refereed}
```

compiles to:

```
{? publications.refereed publications.title}
```

Both `refereed` in the condition and `year > 2020` get auto-prefixed. If you want to reference a *top-level* variable in a WHERE clause (not a property of the list being filtered), use the full dotted path — Plain leaves any already-dotted reference alone — or drop into a raw Loom `{…}` sub-expression.

### Reserved keywords

Plain keywords (`SHOW`, `IF`, `WHERE`, `SORTED BY`, `TOTAL OF`, etc.) are reserved across the whole language — including snippet names and parameter names. A snippet named `show` or a parameter named `count` would collide with the tokenizer's keyword recognition and wouldn't behave as expected. Use non-keyword names for snippets and their parameters. See the [reference table](#reference-translation-table) for the full list of reserved words.

### Known limitations

Two semantic caveats worth being aware of when mixing Plain features in snippet bodies:

1. **WHERE combined with SORTED BY on a projected list.** `{SHOW pubs.title WHERE refereed SORTED BY date DESCENDING}` translates correctly, but the filtered list contains projected strings with no `date` property, so the sort produces string-order results, not date-order. For correct composition, sort the full object list first and project the title last — this is an underlying Loom constraint, not a Plain limitation. If this matters for your use case, use a raw Loom expression that sorts before projecting.

2. **Dotted access on snippet parameters.** If a snippet takes a parameter named `items` and the body references `items.amount`, Loom's aux-variable lookup doesn't traverse dotted paths — it falls through to the outer resolver instead. The workaround is to match the parameter name to the outer variable name (so the outer resolver can serve the dotted path), or to use the explicit accessor form (`(. amount items)`). This is a pre-existing Loom behavior documented here because it affects Plain snippets too.

## Mixing Plain and Loom

Plain is a strict superset of Loom. Any valid Loom expression is also valid Plain — the parser recognizes raw Loom forms and passes them through. This means you can mix the two styles freely in the same template:

```
{SHOW member.name}                           ← Plain
{+? 'Dr. ' member.title}                     ← Loom (conditional join)
{TOTAL OF grants.amount AS currency USD}     ← Plain
{# -date=y (>> -desc publications.date)}     ← Loom
```

Use whichever form reads best for each expression. If you start in Plain and hit something the syntax can't express, drop into Loom mid-template without switching files or instantiating a second engine.

## What Plain doesn't have

Plain is deliberately minimal. It does **not** have:

- **Variable assignment** — no `SET x TO y`. Use Loom snippets for reusable expressions.
- **Loops with bodies** — no `FOR i IN list: print(i * 2)`. Operations are expressions, not statements. Most iteration is handled implicitly by Loom's list-awareness: `{SHOW list.property}` already operates element-by-element.
- **Named blocks or scopes** — no `BEGIN ... END`. Snippets handle reuse.
- **Side effects** — no file I/O, no HTTP, no mutation. Plain compiles to an expression and returns a value.
- **Control-flow primitives** — no `BREAK`, `CONTINUE`, `RETURN`.

All of these would push Plain toward being a programming language, which defeats its goal of being approachable to non-technical staff.

There is a `FOR EACH` form for rare cases where Loom's implicit list-awareness isn't enough, but the vast majority of iteration should use the implicit form. If you find yourself reaching for `FOR EACH`, first check whether `{SHOW list.property ...}` would work — it usually does.

## Reference: Translation table

Every Plain form compiles to a Loom expression. This table is the exhaustive translation reference.

| Plain | Loom |
|---|---|
| `{x}` | `{x}` |
| `{SHOW x}` | `{x}` |
| `{SHOW x AS long date}` | `{# -date=long x}` |
| `{SHOW x AS date}` | `{# -date x}` |
| `{SHOW x AS currency USD}` | `{# -currency=usd x}` |
| `{SHOW x AS year only}` | `{# -date=y x}` |
| `{SHOW x AS phone}` | `{# -phone x}` |
| `{SHOW x AS JSON}` | `{# -json x}` |
| `{SHOW x WITH LABEL}` | `{# -label x}` |
| `{SHOW x WITH LABEL 'y'}` | `{# -label='y' x}` |
| `{IF a SHOW b}` | `{? a b}` |
| `{IF a SHOW b OTHERWISE SHOW c}` | `{? a b c}` |
| `{IF a THEN b ELSE c}` | `{? a b c}` |
| `{SHOW list.prop IF y}` | `{? list.y list.prop}` (bare `y` prefixed with list root) |
| `{SHOW list.prop WHERE y}` | `{? list.y list.prop}` (bare `y` prefixed with list root) |
| `{SHOW x SORTED BY y}` | `{>> -by=y x}` |
| `{SHOW x SORTED BY y DESCENDING}` | `{>> -desc -by=y x}` |
| `{SHOW x FROM LOWEST TO HIGHEST y}` | `{>> -by=y x}` |
| `{SHOW x FROM HIGHEST TO LOWEST y}` | `{>> -desc -by=y x}` |
| `{SHOW x JOINED BY 's'}` | `{+: 's' x}` |
| `{TOTAL OF x.y}` | `{++ x.y}` |
| `{SUM OF x.y}` | `{++ x.y}` |
| `{AVERAGE OF x.y}` | `{/ (++ x.y) (++!! x.y)}` |
| `{COUNT OF list}` | `{++!! list}` |
| `{COUNT OF list WHERE y}` | `{++!! list.y}` (counts truthy values of the per-element condition) |

Modifiers combine inside-out: filter → sort → join → format → label. For example:

```
{SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ', '}
```

compiles to:

```
{+: ', ' (>> -desc -by=date (? publications.refereed publications.title))}
```

You can read the nesting from the inside out: start with `publications.title`, filter by `publications.refereed` (the bare `refereed` in the source is auto-prefixed with the list root), sort by `date` descending, join with `', '`.

## API

```js
import { Plain } from '@uniweb/loom/plain'

new Plain(snippets?, customFunctions?)
//   snippets:          string of snippet definitions, OR { name: fnDef } object
//   customFunctions:   { name: (flags, ...args) => value }

plain.render(template, vars?, auxVars?)       // → string
plain.evaluateText(expr, vars?, auxVars?)     // → any
```

`Plain` wraps a private `Loom` instance and delegates to it after translation. The constructor signature, variable resolver shape, snippet system, and custom-function interface are identical to `Loom` — see the [Loom README](../README.md) and [Loom basics](./basics.md) for details.

### Fallback on parse errors

When Plain can't parse an expression (for example, an unrecognized verb or malformed syntax), it passes the original input through to Loom unchanged. This means raw Loom expressions always work, and templates that mix Plain and Loom are handled uniformly — each `{…}` placeholder is tried as Plain first, then falls through to Loom if the parse fails.

## See also

- [Loom basics](./basics.md) — the underlying engine
- [Language reference](./language.md) — every Loom function and flag
- [Examples](./examples.md) — worked examples organized by task
