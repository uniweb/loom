# Loom Language Reference

Complete reference for the Loom expression language. For gentler introductions, read [`basics.md`](./basics.md) first, then [`quick-guide.md`](./quick-guide.md). This document is the authoritative reference — every verb, every modifier, every function, every flag, every syntactic form, in both surface forms.

## Table of contents

- [Two surface forms](#two-surface-forms)
- [Syntax](#syntax)
- [Data types](#data-types)
- [Variables](#variables)
- [Empty vs falsy](#empty-vs-falsy)
- [Plain form](#plain-form)
    - [SHOW](#show)
    - [Modifiers](#modifiers)
    - [IF … OTHERWISE …](#if--otherwise)
    - [Aggregation verbs](#aggregation-verbs)
    - [Keyword reference](#plain-keyword-reference)
    - [Keyword casing and shadowing](#keyword-casing-and-shadowing)
    - [WHERE condition prefixing](#where-condition-prefixing)
    - [Function calls and snippet invocation](#plain-function-calls)
    - [What Plain doesn't have](#what-plain-doesnt-have)
    - [Known limitations](#known-limitations)
    - [Translation table](#translation-table)
- [Compact form](#compact-form)
    - [Function categories](#function-categories)
    - [Option flags](#option-flags)
    - [The `#` format function](#the-format-function)
    - [The switch-case functions](#the-switch-case-functions)
    - [The `.` accessor function](#the-accessor-function)
    - [Step-in behavior](#step-in-behavior)
    - [Default result formatting](#default-result-formatting)
    - [JavaScript built-in functions](#javascript-built-in-functions)
- [Mixing the two forms](#mixing-the-two-forms)
- [Snippets](#snippets)
- [Custom JavaScript functions](#custom-javascript-functions)
- [Special context variables](#special-context-variables)
- [Error handling](#error-handling)
- [Localization](#localization)
- [The core-only package](#the-core-only-package)

---

## Two surface forms

Loom is one language with two surface forms:

- **Plain form** — natural-language. `{SHOW publications.title WHERE refereed SORTED BY year DESCENDING}`. The default, audience-appropriate front door.
- **Compact form** — symbolic Polish-notation. `{>> -desc -by=year (? publications.refereed publications.title)}`. Terser, useful when Plain phrasing gets long, and the form that evaluates all templates internally.

Both forms parse to the same internal representation and run on the same evaluator. You can mix them freely — a nested `{…}` inside a Plain expression passes through as Compact form, and the Plain parser falls through to Compact form on any input it doesn't recognize. Pick whichever reads better for the expression in front of you.

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()
loom.render(template, vars)             // → string
loom.evaluateText(expression, vars)     // → any type
```

The `vars` argument is either a plain object or a `(key) => value` resolver function. Both work the same way throughout.

## Syntax

A Loom template is ordinary text with **placeholders** — expressions enclosed in curly braces `{}`. When rendered with `loom.render(template, vars)`, each placeholder is evaluated and replaced with its result.

```
Hello, {name}! You have {COUNT OF publications} publications.
```

A placeholder contains either:

- A **variable reference**: `{name}`, `{member.age}`, `{`Start Date`}`, `{@price}`
- A **Plain-form expression**: `{SHOW publications.title WHERE refereed}`, `{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}`, `{TOTAL OF grants.amount AS currency USD}`
- A **Compact-form function call**: `{+ 2 3}`, `{', ' a b c}`, `{# -date=long start_date}`

Loom recognizes which form an expression is in by looking at its shape. When a word at the start of a placeholder matches a Plain construct keyword (`SHOW`, `IF`, `COUNT OF`, …) in a grammar position that expects one, Plain form takes over. Otherwise the expression is interpreted as Compact form.

## Data types

Loom values use these types:

| Type | Example | Notes |
|---|---|---|
| **Number** | `7`, `-0.5`, `3.14` | Integers and floats |
| **Text** | `"Hello"`, `'World'`, `` `Hello` `` | Single, double, or backtick quotes |
| **List** | `[1 "two" [3 4]]` | Space-separated values in square brackets |
| **Map** | `{name: "John" age: 30}` | Key-value pairs (inside a function call, not at the top of a placeholder) |
| **Range** | `(~ "2000/01/01" "2010/12/31")` | Built with the `~` function |
| **Regex** | `(\\ "[a-z]+" "i")` | Built with the `\` function |
| **Function** | `(+ a b)` | Polish-notation call |
| **Boolean** | `true`, `false` | |

Commas can appear as visual separators between arguments but are optional and ignored by the parser.

## Variables

Insert a variable with `{name}`. Loom looks up the name through the variable resolver you provide to `render()` or `evaluateText()`.

### Dot notation

Use dots to navigate nested maps and lists:

```
{member.name}
{member.address.city}
{publications.0.title}
```

When you access a property on a list of maps, Loom returns a list of that property across all elements:

```js
publications = [
    { title: 'A', year: 2020 },
    { title: 'B', year: 2021 },
]
```

```
{publications.title}    // → ["A", "B"]
{publications.year}     // → [2020, 2021]
```

This list-awareness is the foundation for most of Loom's filter/sort/aggregate operations — they work element-by-element on projected lists without an explicit loop.

### Backtick variable names

Variable names are case-sensitive and can't contain spaces in their bare form. Wrap the name in backticks and Loom normalizes it to snake_case:

```
{`Start Date`}    // equivalent to {start_date}
{`First Name`}    // equivalent to {first_name}
```

### Localized labels

Prefix a variable name with `@` to retrieve its label instead of its value:

```
{@address}: {address}
// → "Address: 123 Main St"   (or localized equivalent)
```

Your resolver decides what `@address` returns — typically a human-readable, possibly localized, field label.

## Empty vs falsy

Loom has two distinct notions of "nothingness." Most users rarely need to think about the distinction, but the rule is:

- **Empty** — "should this drop from output?" A value is empty if it's `""`, `null`, `undefined`, `NaN`, `[]`, or `{}`. Used by joins, the conditional join `+?`, and the `-wrap` format flag.
- **Falsy** — "is this a false condition?" A value is falsy if it's empty OR also `0`, `"0"`, or `false`. Used by the ternary `?`, the multi-branch `??`/`???`, the logical operators `&` / `|` / `!` / `!!`, the count-of-truthy reducer `++!!`, and explicit boolean casts.

The distinction matters in one specific way: **numbers are never empty but `0` is falsy**. That's deliberate:

```
{+? 'Likes: ' likes}       // likes = 0  → "Likes: 0"    (not empty, joins normally)
{? likes 'has' 'none'}     // likes = 0  → "none"         (falsy in a conditional)
```

This is what most people intuitively expect: `0` is a legitimate number to display, but "do they have any likes?" is a yes/no question where zero means no.

## Plain form

Plain form reads like a description of what you want. It has a handful of verbs and a handful of modifiers; everything else is variables, values, and function calls.

### SHOW

`SHOW` displays a value, optionally with modifiers.

```
{SHOW publication.title}
```

`SHOW` is optional when the expression is just a value reference:

```
{publication.title}
{SHOW publication.title}       // same thing
```

These compile to the same thing. Use `SHOW` when you want to attach modifiers — it reads better with them — and omit it otherwise.

### Modifiers

`SHOW` accepts a chain of modifiers. They can appear in any order; the translator applies them in a canonical internal sequence (filter → sort → join → format → label).

#### `AS` — format

Formats the value. The word after `AS` is the format type.

```
{SHOW publication.date AS long date}       // → "January 15, 2000"
{SHOW publication.date AS full date}       // → "Saturday, January 15, 2000"
{SHOW publication.date AS year only}       // → "2000"
{SHOW publication.date AS month only}      // → "January"
{SHOW price AS number}                     // → "1,200"   (locale grouping)
{SHOW data AS JSON}                        // → JSON string
{SHOW price AS currency USD}               // dispatches to the currency formatter
{SHOW member.phone AS phone}               // dispatches to the phone formatter
```

Recognized format types: `date`, `number`, `json`, `label`, `text`, `string`, `list`, `object`, `tag`, plus the specialized creators `currency` (with optional code), `phone`, `address`, `email`. The specialized creators expect their corresponding creator objects (`(currency …)`, `(phone …)`, `(address …)`, `(email …)`) — see [Creators](#creators) — and pass plain strings through mostly unchanged.

`date` styles: `long`, `full`, `short`, `medium`, plus the phrases `year only`, `month only`, `year and month`.

Unknown format types fall through to the `#` formatter as best-effort flag names.

#### `WITH LABEL` — prepend a label

Prepends a localized label to the value.

```
{SHOW price WITH LABEL}                   // uses the default label for `price`
{SHOW price WITH LABEL 'Cost'}            // custom label
```

Without a custom label, Loom looks up the variable's localized label (same lookup as `@`-prefix).

#### `WHERE` / trailing `IF` — filter

Filters a list. `WHERE` and trailing `IF` are synonyms — use whichever reads better in context.

```
{SHOW publications.title WHERE refereed}
{SHOW publications.title IF refereed}
```

Compound conditions use `AND`, `OR`, `NOT` (or `&&`, `||`, `!` for readers coming from programming languages):

```
{SHOW publications.title WHERE refereed AND year > 2020}
{SHOW publications.title WHERE funded OR sponsored}
```

Bare identifiers in the condition are automatically prefixed with the list root — see [WHERE condition prefixing](#where-condition-prefixing).

#### `SORTED BY` — sort

```
{SHOW items SORTED BY date}                        // ascending (default)
{SHOW items SORTED BY date ASCENDING}
{SHOW items SORTED BY date DESCENDING}
```

Long-form synonyms:

```
{SHOW items FROM LOWEST TO HIGHEST date}
{SHOW items FROM HIGHEST TO LOWEST date}
```

Both forms compile to the same Compact sort.

#### `JOINED BY` — custom separator

By default a list is joined with `, ` when rendered. Use `JOINED BY` to pick a different separator.

```
{SHOW publications.title JOINED BY ', '}
{SHOW publications.title JOINED BY ' • '}
{SHOW publications.title JOINED BY '\n'}
```

### IF … OTHERWISE …

Plain's branching form:

```
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
```

Several shorter forms compile to the same thing:

```
{IF age >= 18 SHOW 'Adult' OTHERWISE 'Minor'}       // SHOW after OTHERWISE optional
{IF age >= 18 THEN 'Adult' ELSE 'Minor'}            // SQL-style
{IF age >= 18 'Adult' 'Minor'}                      // bare values
```

The `OTHERWISE` branch is optional:

```
{IF refereed SHOW 'Peer-reviewed'}
```

When the condition is false and no `OTHERWISE` is given, the result is empty.

### Aggregation verbs

Four verbs for collapsing a list to a single value:

```
{TOTAL OF grants.amount}         // sum of all amounts
{SUM OF grants.amount}           // same as TOTAL OF
{AVERAGE OF grants.amount}       // mean of the amounts
{COUNT OF publications}          // how many publications
```

All four accept the full modifier chain — `AS`, `WITH LABEL`, `WHERE`:

```
{COUNT OF publications WHERE refereed}
{COUNT OF publications WHERE year > 2020 AS number}
{TOTAL OF grants.amount WHERE active AS currency USD}
{AVERAGE OF pubs.year WHERE refereed}
```

`WHERE` on `SUM`, `TOTAL`, and `AVERAGE` filters the source list before aggregating — `SUM OF grants.amount WHERE active` is the sum of active-grant amounts. Modifier ordering is irrelevant; `COUNT OF x WHERE y AS number` and `COUNT OF x AS number WHERE y` produce the same result.

### Plain keyword reference

Every Plain keyword, grouped by role. **ALL CAPS is the stable form** (see the next section).

| Category | Keywords |
|---|---|
| Construct verbs | `SHOW`, `IF`, `COUNT OF`, `TOTAL OF`, `SUM OF`, `AVERAGE OF`, `FOR EACH` |
| Modifiers | `WHERE`, `AS`, `WITH LABEL`, `SORTED BY`, `JOINED BY`, `FROM LOWEST TO HIGHEST`, `FROM HIGHEST TO LOWEST`, trailing `IF` |
| Sub-keywords | `THEN`, `ELSE`, `OTHERWISE`, `ASCENDING`, `DESCENDING`, `IN`, `DO` |
| Logical operators | `AND`, `OR`, `NOT` (synonyms: `&&`, `\|\|`, `!`) |

### Keyword casing and shadowing

Plain-form keywords can be written in any case — `SHOW`, `show`, and `Show` all parse as the same keyword. **ALL CAPS is the stability contract**: a keyword written in ALL CAPS is guaranteed to be interpreted as a keyword now and in every future version. Lowercase is SQL-style convenience and is the normal style for templates that have settled into their vocabulary.

**Variable names can shadow keywords in most positions.** Loom recognizes keywords only where the grammar actually expects one — at the start of a placeholder for construct verbs, immediately after a value for modifiers, and in specific sub-keyword slots inside constructs. A word in any other position — including any value position — is always an identifier. User variables that happen to share a name with a keyword just work:

```
{count}                   // your variable named `count`
{COUNT OF items}          // the aggregation keyword
{SHOW count}              // "show the count variable"
{person.where}            // dotted access to a `where` field
{title SORTED BY year}    // `title` is a value, SORTED BY is a modifier
```

**The one exception**: a custom function registered under a name that matches a **single-word construct keyword** (`show`, `if`) cannot be invoked through Plain's function-call syntax, because the grammar sees that word as the construct verb at the start of a placeholder. If you need a custom function with one of those names, either rename it or call it through `@uniweb/loom/core` with Compact-form templates, which don't recognize Plain keywords.

Multi-word keyword prefixes (`count of`, `total of`, `sum of`, `average of`, `for each`) don't have this limitation — a custom `count` function works fine because `count` alone isn't a keyword (only `count of` is).

### WHERE condition prefixing

When a `WHERE` clause references bare identifiers, Plain prefixes them with the list root so the condition evaluates per-element via Loom's list-awareness:

```
{SHOW publications.title WHERE refereed}
```

compiles to:

```
{? publications.refereed publications.title}
```

Both `refereed` in the condition and `year > 2020` get auto-prefixed. If you want to reference a *top-level* variable inside a WHERE clause, use the full dotted path (already-dotted references are left alone), or drop into a Compact `{…}` sub-expression.

### Plain function calls

Plain's function-call syntax is `{name arg1 arg2 …}`: an identifier followed by positional arguments. Names that don't collide with single-word construct keywords (most user-chosen names, including `count` since `count` alone isn't a keyword) parse as calls cleanly.

```js
const loom = new Loom({}, {
    greet: (flags, val) => `Hi, ${val}!`,
    count: (flags, val) => `[count:${val}]`,
})

loom.render('{greet "Diego"}')      // → "Hi, Diego!"
loom.render('{count "x"}')          // → "[count:x]"
```

You can pass a Plain sub-expression as a call argument by wrapping it in parentheses:

```
{bold (SHOW price AS currency USD)}
```

The inner `SHOW price AS currency USD` is translated and handed to the `bold` function as a single formatted-value argument.

### What Plain doesn't have

Plain is deliberately minimal. It does **not** have:

- **Variable assignment** — no `SET x TO y`. Use snippets for reusable expressions.
- **Loops with bodies** — no `FOR i IN list: print(i * 2)`. Most iteration is handled implicitly by list-awareness: `{SHOW list.property}` already operates element-by-element.
- **Control-flow primitives** — no `BREAK`, `CONTINUE`, `RETURN`.
- **Side effects** — no file I/O, no mutation.

There is a `FOR EACH` construct for rare cases where implicit list-awareness isn't enough. Prefer the implicit form (`{SHOW list.property …}`) when possible.

### Known limitations

A few rough edges worth knowing about:

1. **`SORTED BY <field>` doesn't consult the named field.** Loom's sort currently ignores the `-by=field` flag and always orders by the first string-like column it finds, so `{SHOW pubs.title SORTED BY year DESCENDING}` returns the titles in reverse alphabetical order regardless of `year`. This is a pre-existing `>>` sort implementation issue, not a Plain-translator issue. Workaround: pre-sort the data in JavaScript before handing it to `render()`, or use Compact form that sorts on the displayed field directly.

2. **Dotted access on snippet parameters.** If a snippet takes a parameter named `items` and the body references `items.amount`, Loom's aux-variable lookup doesn't traverse dotted paths — it falls through to the outer resolver instead. Workaround: name the snippet parameter to match the outer variable name, or use the Compact accessor form (`(. 'amount' items)`).

3. **Grouped boolean expressions in `WHERE`.** Plain's `WHERE` clause doesn't yet parse parenthesized conditions, so `{SHOW pubs.title WHERE NOT (draft OR archived)}` fails at the parser. Apply de Morgan's law instead: `WHERE NOT draft AND NOT archived`. Both forms produce the same filtered list.

4. **Compact-form operators outside a `{…}` passthrough.** A top-level Compact expression that starts with `#`, `~`, `^`, `\`, `<>`, or bare `<` / `>` (e.g. `{# -date=long start_date}`, `{# (~ start_date end_date)}`) is handled by falling through to LoomCore after Plain's parser rejects it. This is transparent in practice — the expression just works — but it means the Plain wrapper has a small per-placeholder parse-and-catch cost on Compact-heavy templates. If that matters for your workload, import `LoomCore` from `@uniweb/loom/core` and skip the Plain parser entirely.

### Translation table

Every Plain form compiles to an equivalent Compact expression. This table is the exhaustive translation reference.

| Plain | Compact |
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
| `{SHOW list.prop WHERE y}` | `{? list.y list.prop}` |
| `{SHOW x SORTED BY y}` | `{>> -by=y x}` |
| `{SHOW x SORTED BY y DESCENDING}` | `{>> -desc -by=y x}` |
| `{SHOW x FROM LOWEST TO HIGHEST y}` | `{>> -by=y x}` |
| `{SHOW x FROM HIGHEST TO LOWEST y}` | `{>> -desc -by=y x}` |
| `{SHOW x JOINED BY 's'}` | `{+: 's' x}` |
| `{TOTAL OF x.y}` | `{++ x.y}` |
| `{SUM OF x.y}` | `{++ x.y}` |
| `{AVERAGE OF x.y}` | `{/ (++ x.y) (++!! x.y)}` |
| `{COUNT OF list}` | `{++!! list}` |
| `{COUNT OF list WHERE y}` | `{++!! (? list.y list)}` (filter-then-count) |
| `{SUM OF x.y WHERE z}` | `{++ (? x.z x.y)}` |
| `{AVERAGE OF x.y WHERE z}` | `{/ (++ (? x.z x.y)) (++!! x.z)}` |

Modifiers compose inside-out: filter → sort → join → format → label. For example:

```
{SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ', '}
```

compiles to:

```
{+: ', ' (>> -desc -by=date (? publications.refereed publications.title))}
```

Read the nesting from the inside out: start with `publications.title`, filter by `publications.refereed` (bare `refereed` is auto-prefixed), sort by `date` descending, join with `', '`.

## Compact form

Compact form is Loom's symbolic Polish-notation surface. Every Plain expression has a Compact equivalent, and Compact is the shape the evaluator actually runs. For purely symbolic templates you can import `LoomCore` directly from `@uniweb/loom/core` and skip the Plain parser — see [The core-only package](#the-core-only-package).

Function calls use Polish notation: function name first, space-separated arguments follow.

```
(function-name arg1 arg2 …)
```

Inside a placeholder, the outer parentheses are optional when the whole placeholder is a single call:

```
{+ 2 3}          // shorthand
{(+ 2 3)}        // equivalent, explicit
```

Nested calls require their own parentheses:

```
{+ 2 (* 3 4)}    // → 14
```

### Function categories

Loom's standard library groups functions by how they process arguments:

| Category | Role |
|---|---|
| **Accessors** | Retrieve properties from objects and lists |
| **Creators** | Build specialized data structures (ranges, matrices, regex, …) |
| **Filters** | Reduce a list to a subset |
| **Mappers** | Apply the first argument to the others, returning a list of results |
| **Switchers** | Pick outputs based on conditions |
| **Transformers** | Process arguments collectively, producing a different shape of output |

#### Accessors

| Function | Name | Description |
|---|---|---|
| `.` | Get | Retrieve properties from objects and lists (see [The `.` accessor function](#the-accessor-function)) |

#### Creators

| Function | Name | Description |
|---|---|---|
| `@` | Localizable | Creates a localizable object |
| `<>` | Markup | Creates markup elements |
| `^` | Matrix | Creates a matrix (list of lists) |
| `~` | Range | Creates a range with a start and end |
| `\` | Regex | Creates a regular expression |
| `phone` | Phone | Creates a phone-number object |
| `address` | Address | Creates an address object |
| `email` | Email | Creates an email object |
| `currency` | Currency | Creates a currency-amount object |

#### Filters

| Function | Name | Description |
|---|---|---|
| `&` | AND | First falsy value, or the last truthy value |
| `\|` | OR | First truthy value |

#### Mappers

| Function | Name | Description |
|---|---|---|
| `=` | Equal | Loose equality |
| `==` | Strict equal | Strict equality |
| `!=` | Not equal | Loose inequality |
| `!==` | Strict not equal | Strict inequality |
| `<` | Less than | |
| `<=` | Less than or equal | |
| `>` | Greater than | |
| `>=` | Greater than or equal | |
| `%` | Percentage | |
| `*` | Multiply | |
| `/` | Divide or split | Numbers divide, strings split |
| `+` | Add or merge | Adds numbers, concatenates strings, merges lists |
| `-` | Subtract | |

#### Unary operators

Unary operators take a single value and return a single value. They step into lists by default, so `(! list)` applies the operator to each element. Pass `-l` to treat the whole list as one value.

| Function | Name | Description |
|---|---|---|
| `!` | Logical NOT | Inverts falsiness (see [Empty vs falsy](#empty-vs-falsy)) |
| `!!` | Double NOT | Coerces to boolean |

```
{! x}                              // scalar: true if x is falsy
{! draft}                          // with draft = false → true
{! xs}                             // with xs = [true, false, true] → [false, true, false]
{! -l xs}                          // -l opt-out: treat list as one value
                                   // xs = [] → true, xs = [1] → false
```

`!` and `!!` are the element-wise logical-negation operators used by Plain's `WHERE NOT …` filter clause.

#### Switchers

| Function | Description |
|---|---|
| `?` | Ternary (if-else) |
| `??` | Two-branch (if-elseif-else) |
| `???` | Three-branch (if-elseif-elseif-else) |

See [The switch-case functions](#the-switch-case-functions) for details.

#### Transformers

| Function | Name | Description |
|---|---|---|
| `#` | Format | Universal formatter — dates, numbers, currency, JSON, lists, and more |
| `>>` | Sort | Sorts with localized comparison |
| `++` | Sum | Adds numbers, concatenates strings, merges lists |
| `+:` | Join | Joins arguments with a separator |
| `+?` | Conditional join | Joins only if all arguments are non-empty |

#### Compound functions

Built-in compositions of core functions, named for their expanded form.

| Function | Name | Equivalent | Description |
|---|---|---|---|
| `\|=` | In | `(\| (= v list))` | Checks if a value is in a list |
| `&=` | Only contains | `(& (= v list))` | Checks if a list contains only a value |
| `\|?` | First match | `(\| (? c list))` | First list element matching a condition |
| `&?` | Last match | `(& (? c list))` | Last list element matching a condition |
| `\|>>` | Minimum | `(\| (>> list))` | Smallest non-falsy value |
| `&>>` | Maximum | `(& (>> list))` | Largest value |
| `++!!` | Count | `(++ (!! list))` | Counts non-falsy values in a list |

### Option flags

Flags modify function behavior. `-x` turns on option `x`; `-x=y` sets option `x` to value `y`.

```
{>> -date -desc "2001/02/10" "2001/02/1" "July 1, 2000"}
```

Flags can appear anywhere in the argument list but conventionally go at the start or end.

#### Generic flags

Apply to every function:

- **`-r`** — reverse the result list
- **`-l`** — "list mode": treat list arguments as single elements rather than stepping into them

```
{+ "a" ["b" "c"]}         // → ["ab", "ac"]   (steps into list)
{+ -l "a" ["b" "c"]}      // → ["a", "b", "c"] (treats list as one value)
```

### The format function

`#` is the most feature-rich function in Loom. It handles dates, numbers, currency, phone, lists, JSON, labels, and more, controlled entirely by flags.

```
{# -date=long start_date}     // format as a long date
{# -currency=usd price}       // format as currency
{# -phone contact.phone}      // format as a phone number
{# -json data}                // JSON string
{# -label @price price}       // "Price: …" with localized label
```

#### All `#` flags

| Flag | Description | Example |
|---|---|---|
| `-date=STYLE` | Format as a date. Styles: `full`, `long`, `medium` (default), `short`, `y`, `ym`, `ymm`, `m`, `mm` | `{# -date=long start_date}` |
| `-number` | Format as a number | `{# -number price}` |
| `-currency=CODE` | Format as currency (`usd`, `eur`, `cad`, …) | `{# -currency=usd price}` |
| `-phone` | Format as a phone number | `{# -phone contact.phone}` |
| `-address` | Format as an address | `{# -address location}` |
| `-email` | Format as an email address | `{# -email user.email}` |
| `-label` | Prepend the localized field label | `{# -label -date=long @date start_date}` |
| `-list` | Treat the value as a list | `{# -list members}` |
| `-range` | Format as a range | `{# -range duration}` |
| `-json` | Format as JSON | `{# -json data}` |
| `-h1` … `-h6` | Heading-level markup | `{# -h1 title}` |
| `-bold`, `-italic`, `-underline`, `-line-through` | Text decoration | `{# -bold emphasis}` |
| `-sort=asc`/`desc` | Sort list values | `{# -sort=asc items}` |
| `-title` | Localized title casing | `{# -title heading}` |
| `-wrap='()'` | Wrap with characters | `{# -wrap='[]' name}` |
| `-r` | Reverse list order | `{# -r items}` |
| `-row=INDICES` | Format as table cells, `INDICES` picks columns | `{# -row=1,3 location}` |
| `-sep=SEP` | Custom separator when joining | `{# -sep=' · ' items}` |

#### Date format styles

| Style | Example |
|---|---|
| `full` | Saturday, January 15, 2000 |
| `long` | January 15, 2000 |
| `medium` (default) | Jan 15, 2000 |
| `short` | 1/15/00 |
| `y` | 2000 |
| `m` | January |
| `mm` | 01 |
| `ym` | January 2000 |
| `ymm` | 01/2000 |

#### Implicit `#` invocation

When a placeholder contains multiple arguments and the first argument is neither a recognized function name nor a quoted string, Loom assumes `#`:

```
{start_date -date=full}        // same as {# -date=full start_date}
{price -currency=usd}          // same as {# -currency=usd price}
```

With implicit `#`, flags often read more naturally at the end.

#### Joining text with a separator

Joining text with a separator is so common that Loom special-cases it: when the first token inside a placeholder is a quoted string, it's treated as the separator for `+:`.

```
{', ' a b c}              // same as {+: ', ' a b c}
```

Empty values are dropped during the join, so missing fields don't produce awkward leading or trailing separators.

### The switch-case functions

`?`, `??`, and `???` are variants of the same switch-case operator. The number of question marks indicates how many condition slots the function accepts.

#### Ternary `?`

```
{? condition if_true else}
{? condition if_true}                // else defaults to empty
```

Minimum 2 arguments.

```
{? (> age 18) "Adult" "Minor"}
{? is_premium "⭐ Premium"}
```

#### List conditions

If the condition is a list (or one of the bodies is), the operation becomes a matrix evaluated element-by-element:

```
{? [(> age 18) (> age 25)] "Adult" "Youth"}
// age = 20: row 1 true → "Adult", row 2 false → "Youth"
// → ["Adult", "Youth"]
```

#### Multi-branch `??` and `???`

```
{?? cond1 cond2 then_1 then_2 else}
{??? cond1 cond2 cond3 then_1 then_2 then_3 else}
```

```
{??? (> age 65) (> age 18) (> age 13) "Senior" "Adult" "Teen" "Child"}
```

### The accessor function

The `.` function retrieves properties from objects and lists. Unlike dot notation on variable names, `.` can be applied to any expression result.

```js
person = {
    id: 'A-20',
    info: {
        name: 'John',
        details: { age: 30, location: 'NY' },
        publications: [{ title: 'Bio' }, { title: 'Robotics' }],
    },
}
```

```
{. 'info.name' person}                        // → "John"
{. '0' publications}                          // → first element
{. ['id' 'info.details.location'] person}     // pick multiple properties
{. {'id': 'newId', 'info.details.location': 'city'} person}
                                              // pick + rename
{. 'info.publications.title' person}          // → ["Bio", "Robotics"]
```

### Step-in behavior

Loom functions prefer to **step into** lists when looking for arguments — operations apply per-element.

```
{< 5 prices}    // compares 5 to each element in `prices`
```

To treat a list as a single element, use `-l`:

```
{# ["a" "b" "c"]}       // → "a, b, c"   (formats each element)
{# -l ["a" "b" "c"]}    // → "[a, b, c]" (formats the list as one value)
```

### Default result formatting

When a placeholder's result is not a number or string, Loom automatically calls `#` with `-l` and `-sep=', '` to produce a final string. A placeholder that evaluates to `["journal", "book", "journal"]` renders as `"journal, book, journal"` in the output.

### JavaScript built-in functions

In addition to the symbolic core, you can call standard JavaScript `Math`, `String`, and `Array` methods:

```
{min 10 5 8}              // → 5
{max 10 5 8}              // → 10
{round 3.7}               // → 4
{toUpperCase "hello"}     // → "HELLO"
{toLowerCase "HELLO"}     // → "hello"
{sort [3 1 4]}            // → [1, 3, 4]
```

Callback-based methods accept an inline expression, with callback arguments available as `$1`, `$2`, etc.:

```
{sort [3 1 4] "(- $1 $2)"}    // → [4, 3, 1]   (descending)
```

## Mixing the two forms

You can mix Plain and Compact forms freely in the same template. Three ways they combine:

1. **Placeholder-level mix.** Each `{…}` is translated independently. Some placeholders can be Plain, others Compact.

    ```
    {SHOW member.name}                         ← Plain
    {+? 'Dr. ' member.title}                   ← Compact (conditional join)
    {TOTAL OF grants.amount AS currency USD}   ← Plain
    {# -date=y (>> -desc publications.date)}   ← Compact
    ```

2. **Compact inside Plain via nested `{…}`.** A balanced `{…}` block inside a Plain expression passes through verbatim as Compact form. This is the clean way to reach for symbolic precision inside an otherwise natural-language template.

    ```
    {SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}
    ```

    The inner `+? 'Dr. ' title` runs as Compact, and the outer `SHOW … WITH LABEL` wraps it with a label. Multi-token inners get parenthesized automatically when embedded; single-token inners (like `{name}`) stay bare.

3. **Fallthrough on parse failure.** When the Plain parser can't parse an expression (unrecognized verb, malformed syntax), the original input is passed to Compact evaluation unchanged. This means raw Compact expressions always work, even if the template doesn't start with a `{`-nested passthrough.

## Snippets

Snippets are reusable named patterns you define once and invoke like built-in functions.

### Defining snippets

```
[name arg1 ...args] { BODY }      // text template
[name arg1 ...args] ( BODY )      // expression
```

- `name` — the snippet name
- `arg1 ...args` — positional arguments; `...args` captures variadic args as a list
- `BODY` — the snippet body, in Plain form, Compact form, or a mix

Body-bracket choice determines how the body is evaluated:

- **`{ … }`** — text template. May contain inner `{…}` placeholders. Evaluated with `render()`.
- **`( … )`** — single expression. Evaluated with `evaluateText()`. Returns whatever type the expression produces.

Examples:

```
[tag1 age]                    { I'm {age}yo }
[greet name day timeOfDay]    { Good {timeOfDay}, {name}! How are you on this fine {day}? }
[xor a b]                     (& (| a b) (! (& a b)))
[getSecondItem ...args]       (. 1 args)
[listRefereed pubs]           ( SHOW pubs.title WHERE refereed )
[countRefereed pubs]          ( COUNT OF pubs WHERE refereed )
```

Snippet bodies are translated once at construction time. After construction the evaluator sees only Compact form, so there's no per-call parsing overhead.

### Using snippets

```
{tag1 25}                                // → "I'm 25yo"
{greet "Alice" "Friday" "afternoon"}     // → "Good afternoon, Alice! How are you on this fine Friday?"
{xor true true}                          // → false
```

### The `$0` parameter

If a snippet's first parameter is `$0`, the snippet receives the **flags** object as that argument. Useful for snippets that accept flag-style options.

```
[fancy $0 title ...args] { Options: {# $0} Title: {title} Var args: {args} }
```

```
{fancy -date -type=test "The Great Gatsby" "a" "b" "c"}
// Options: {"date":true,"type":"test"} Title: The Great Gatsby Var args: ["a","b","c"]
```

`$0` cannot appear alone in a placeholder — use it inside a function call like `(# $0)`.

### Object-form snippets

The constructor accepts snippet definitions as an object instead of a source string:

```js
new Loom({
    greet: {
        args: ['name'],
        body: 'Hello, {name}!',
        isText: true,
        hasFlags: false,
    },
})
```

Plain bodies in object form are translated the same way as string-form bodies.

## Custom JavaScript functions

For operations the standard library doesn't cover, register custom functions in the second constructor argument:

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    totalRevenue: function () {
        return this._items.reduce((sum, item) => sum + item.amount, 0)
    },
    runningTotal: function (flags, amount) {
        if (this._index === 0) return amount
        return this._items[this._index - 1].runningTotal + amount
    },
})
```

Custom functions receive `(flags, ...args)`:

- `flags` is the parsed option bag (e.g., `{date: true, type: 'test'}` from `-date -type=test`)
- `args` are the positional arguments

Inside a custom function, `this` provides access to the `_items`, `_index`, and `_count` context variables when called in a list context.

## Special context variables

When Loom processes a list of items, these variables are automatically available:

- **`_items`** — the full list being processed
- **`_index`** — zero-based index of the current item
- **`_count`** — total number of items

They're most useful inside custom JavaScript functions that need cross-item context (running totals, index-based conditions, etc.).

## Error handling

When an expression fails to evaluate, Loom replaces it with an error message of the form `Error[CODE]:ARG`.

| Code | Meaning |
|---|---|
| `101` | Variable not found |
| `102`, `104` | Invalid function name |
| `103` | Invalid expression |

For `101`, verify the variable name; for `102`/`104`, check you're using a valid function name; for `103`, check the expression syntax. Simplify complex templates and test each part incrementally when debugging.

## Localization

Loom has built-in hooks for localization, but it's the caller's responsibility to provide localized values through the variable resolver.

### Localizable strings

A common pattern stores translations as a map keyed by locale code:

```json
{
    "en": "Hello",
    "fr": "Bonjour",
    "es": "Hola"
}
```

Access translations with dot notation or the `.` accessor:

```
{greeting.es}            // "Hola"
{. '@lang' greeting}     // current-locale translation
```

### Localized variable labels

`@name` retrieves the localized label for `name`. Your resolver decides what that label is.

### Localized formatting

The `#` function adapts to the active locale when formatting dates, numbers, and currency. The locale is controlled by the `setLocale()` export:

```js
import { setLocale } from '@uniweb/loom'

setLocale('fr-CA')
```

## The core-only package

`@uniweb/loom` includes the Plain parser by default. If you only write Compact form and want to skip the Plain parser entirely, import the core engine directly:

```js
import { LoomCore } from '@uniweb/loom/core'

const loom = new LoomCore()
loom.render("{', ' city province country}", profile)
```

`LoomCore` has the same API as `Loom` but does not recognize Plain-form keywords — a template like `{SHOW x WHERE y}` will fail because `SHOW` is just an undefined function name there. Use `LoomCore` when:

- You're certain your templates are purely Compact form and want the parser bypass.
- You need variable or function names that would otherwise shadow Plain keywords (single-word construct keywords like `show` or `if`).

For most users, the default `Loom` export from `@uniweb/loom` is the right choice.

---

## See also

- **[basics.md](./basics.md)** — first long exposure to the language
- **[quick-guide.md](./quick-guide.md)** — 10-minute tour of the most-used features
- **[examples.md](./examples.md)** — worked examples organized by task
- **[ai-prompt.md](./ai-prompt.md)** — paste into an LLM chat to generate Loom expressions from plain English
