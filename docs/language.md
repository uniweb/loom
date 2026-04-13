# Loom Language Reference

Complete reference for the Loom expression language. For a gentler introduction, read [`basics.md`](./basics.md) first, then [`quick-guide.md`](./quick-guide.md). This document is the authoritative reference — every function, every flag, every syntactic form.

## Table of contents

- [Syntax](#syntax)
- [Data types](#data-types)
- [Variables](#variables)
- [Functions](#functions)
- [Option flags](#option-flags)
- [Working with lists and maps](#working-with-lists-and-maps)
- [Function categories](#function-categories)
    - [Accessors](#accessors)
    - [Creators](#creators)
    - [Filters](#filters)
    - [Mappers](#mappers)
    - [Switchers](#switchers)
    - [Transformers](#transformers)
    - [Compound functions](#compound-functions)
- [The format function `#`](#the-format-function)
- [The switch-case functions `?`, `??`, `???`](#the-switch-case-functions)
- [The `.` accessor function](#the-accessor-function)
- [Step-in behavior](#step-in-behavior)
- [Default result formatting](#default-result-formatting)
- [JavaScript built-in functions](#javascript-built-in-functions)
- [Snippets](#snippets)
- [Special context variables](#special-context-variables)
- [Error handling](#error-handling)
- [Localization](#localization)

---

## Syntax

A Loom template is ordinary text with **placeholders** — expressions enclosed in curly braces `{}`. When rendered with `loom.render(template, vars)`, each placeholder is evaluated and replaced with its result.

```
Hello, {name}! You have {# -currency=usd balance} remaining.
```

A placeholder contains either:

- A **variable reference**: `{name}`, `{member.age}`, `{`Start Date`}`, `{@price}`
- A **function call**: `{+ 2 3}`, `{', ' a b c}`, `{# -date=long start_date}`
- A nested combination of the above

Function calls use **Polish notation** — the function name comes first, followed by space-separated arguments. When the entire placeholder is a single function call, the outer parentheses are optional:

```
{+ 2 3}          // shorthand
{(+ 2 3)}        // equivalent, explicit
```

Nested function calls require their own parentheses:

```
{+ 2 (* 3 4)}
```

Commas `,` can be used as visual separators between arguments but are optional and ignored by the parser.

## Data types

Loom expressions support these value types:

| Type | Example | Notes |
|---|---|---|
| **Number** | `7`, `-0.5`, `3.14` | Integers and floats |
| **Text** | `"Hello"`, `'World'`, `` `Hello` `` | Enclosed in single, double, or backtick quotes |
| **List** (array) | `[1 "two" [3 4]]` | Space-separated values in square brackets |
| **Map** (object) | `{name: "John" age: 30}` | Key-value pairs in curly braces (inside a function call) |
| **Range** | `(~ "2000/01/01" "2010/12/31")` | Built with the `~` function |
| **Regex** | `(\\ "[a-z]+" "i")` | Built with the `\` function |
| **Function** | `(+ a b)` | Polish-notation call |

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

### Backtick variable names

Variable names are case-sensitive and cannot contain spaces in their "bare" form. To reference a variable with spaces or unusual casing, wrap the name in backticks — Loom normalizes it to snake_case:

```
{`Start Date`}    // equivalent to {start_date}
{`First Name`}    // equivalent to {first_name}
```

### Localized variable labels

Prefix a variable name with `@` to retrieve its label instead of its value:

```
{@address}: {address}
// → "Address: 123 Main St"   (or localized equivalent)
```

Your variable resolver decides what `@address` returns — typically a human-readable, possibly localized, field label.

### Empty values

A value is considered **empty** (falsy) if it equals any of:

```
""   "0"   0   false   null   []   {}   undefined
```

Empty values are treated specially by several functions — especially the conditional join `+?` and the filter functions `&` and `|`.

## Functions

Functions perform operations on their arguments. They use Polish notation:

```
(function-name arg1 arg2 …)
```

Inside a placeholder, you can omit the outer parentheses:

```
{function-name arg1 arg2 …}
```

For example:

```
{+ 2 3}                     // → 5
{+ price 5}                 // add 5 to the value of `price`
{+ 2 (* 3 4)}               // → 14   (nested call)
```

## Option flags

Flags modify the behavior of a function. A flag of the form `-x` turns on the option named `x`, and `-x=y` sets the value of the option `x` to `y`.

```
(>> -date "2001/02/10" "2001/02/1" "July 1, 2000")
// → ["July 1, 2000", "2001/02/1", "2001/02/10"]   (sorted as dates)

(>> -date -desc "2001/02/10" "2001/02/1" "July 1, 2000")
// → ["2001/02/10", "2001/02/1", "July 1, 2000"]   (descending)
```

Flags can be placed anywhere in the argument list, but by convention they go at the start or end.

### Generic flags

Most flags are function-specific, but two apply to all functions:

- **`-r`** — reverse the result list
- **`-l`** — "list mode": treat list arguments as single elements rather than iterating over them

```
{+ "a" ["b" "c"]}         // → ["ab", "ac"]   (iterates over the list)
{+ -l "a" ["b" "c"]}      // → ["a", "b", "c"] (treats list as a single element)
{+ -r "a" ["b" "c"]}      // → ["ac", "ab"]
```

## Working with lists and maps

Loom's functions are designed to handle lists naturally. If you have a list variable and apply a function, the function usually operates element-by-element:

```js
prices = [100, 50, 20]
```

```
{/ (+ prices 10) 2}     // → [55, 30, 15]   (add 10, divide by 2, per element)
{+ '$' prices}          // → ["$100", "$50", "$20"]   (prefix each)
{+ prices '$'}          // → ["100$", "50$", "20$"]   (suffix each)
```

This list-awareness is what makes Loom compact: you rarely need an explicit loop. If you want to treat a list as a single value, use the `-l` flag.

### Joining text with a separator

Joining text with a separator is so common that Loom special-cases it: when the first token in a placeholder is a quoted string, it's treated as the separator for `+:`:

```
{', ' a b c}            // same as {+: ', ' a b c}
```

Empty values are dropped during the join, so missing fields don't produce awkward leading or trailing separators.

## Function categories

Loom's core functions are grouped by how they process arguments:

| Category | Role |
|---|---|
| **Accessors** | Retrieve properties from objects and lists |
| **Creators** | Build specialized data structures (ranges, matrices, regex…) |
| **Filters** | Reduce a list to a subset |
| **Mappers** | Apply a main argument to the other ones, producing a list of results |
| **Switchers** | Select outputs based on conditions |
| **Transformers** | Process arguments collectively, producing a different output |

### Accessors

| Function | Name | Description |
|---|---|---|
| `.` | Get | Retrieves properties from objects and lists — see [The `.` accessor function](#the-accessor-function) |

### Creators

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

### Filters

Filters reduce a list of values to a subset.

| Function | Name | Description |
|---|---|---|
| `&` | AND | First falsy value, or last truthy |
| `\|` | OR | First truthy value |

### Mappers

Mappers apply the first argument to each of the others, returning a list of results.

| Function | Name | Description |
|---|---|---|
| `=` | Equal | Loose equality |
| `==` | Strict Equal | Strict equality |
| `!=` | Not Equal | Loose inequality |
| `!==` | Strict Not Equal | Strict inequality |
| `<` | Less than | |
| `<=` | Less than or equal | |
| `>` | Greater than | |
| `>=` | Greater than or equal | |
| `!` | Logical NOT | Inverts truthiness |
| `%` | Percentage | |
| `*` | Multiply | |
| `/` | Divide or Split | Divides numbers, splits strings |
| `+` | Add or Merge | Adds numbers, concatenates strings, merges lists |
| `-` | Subtract | |

### Switchers

Switchers pick outputs based on conditions.

| Function | Name | Description |
|---|---|---|
| `?` | Ternary | if-else |
| `??` | 2-branch | if-elseif-else |
| `???` | 3-branch | if-elseif-elseif-else |

See [The switch-case functions](#the-switch-case-functions) for details.

### Transformers

Transformers process arguments collectively.

| Function | Name | Flags | Description |
|---|---|---|---|
| `#` | Format | many (see below) | Universal formatter — dates, numbers, currency, JSON, lists, etc. |
| `>>` | Sort | `-desc`, `-date` | Sorts with localized comparison |
| `++` | Sum | | Adds numeric arguments, concatenates strings, merges lists |
| `+:` | Join | `-sep=STR` | Joins arguments with a separator |
| `+?` | Conditional Join | | Joins only if all arguments are truthy |

### Compound functions

Compound functions are built-in compositions of core functions, named to reflect their expanded form.

| Function | Name | Equivalent | Description |
|---|---|---|---|
| `\|=` | In | `(\| (= v list))` | Checks if a value is in a list |
| `&=` | Only contains | `(& (= v list))` | Checks if a list only contains a value |
| `\|?` | First match | `(\| (? c list))` | First list element matching condition |
| `&?` | Last match | `(& (? c list))` | Last list element matching condition |
| `!!` | Double NOT | `(! (! v))` | Coerces to `true` or `false` |
| `\|>>` | Minimum | `(\| (>> list))` | Smallest truthy value |
| `&>>` | Maximum | `(& (>> list))` | Largest value |
| `++!!` | Count | `(++ (!! list))` | Counts truthy values |

Compound functions are most useful when applied to lists:

```
{!! ["a" "b" ""]}       // → [true, true, false]
{|= "a" ["b" "a" "c"]}  // → true
{++!! publications.refereed}   // count of refereed publications
```

## The format function

`#` is the most feature-rich function in Loom. It handles every kind of formatting: dates, numbers, currency, phone, lists, JSON, labels, and more. Its behavior is controlled entirely by flags.

### All `#` flags

| Flag | Description | Example |
|---|---|---|
| `-date=STYLE` | Format as a date. Styles: `full`, `long`, `medium` (default), `short`, `y`, `ym`, `ymm`, `m`, `mm` | `{# -date=long start_date}` |
| `-number` | Format as a number | `{# -number price}` |
| `-currency=CODE` | Format as a currency amount (`usd`, `eur`, `cad`, …) | `{# -currency=usd price}` |
| `-phone` | Format as a phone number | `{# -phone contact.phone}` |
| `-address` | Format as an address | `{# -address location}` |
| `-email` | Format as an email address | `{# -email user.email}` |
| `-label` | Prepend the localized field label | `{# -label -date=long @date start_date}` |
| `-list` | Treat the value as a list | `{# -list members}` |
| `-range` | Format as a range | `{# -range duration}` |
| `-json` | Format as JSON | `{# -json data}` |
| `-h1`, `-h2`, `-h3`, `-h4`, `-h5`, `-h6` | Apply heading-level markup | `{# -h1 title}` |
| `-bold`, `-italic`, `-underline`, `-line-through` | Apply text decoration | `{# -bold emphasis}` |
| `-sort=asc`, `-sort=desc` | Sort list values | `{# -sort=asc items}` |
| `-title` | Localized title casing | `{# -title heading}` |
| `-wrap='()'` | Wrap with characters | `{# -wrap='[]' name}` |
| `-r` | Reverse list order | `{# -r items}` |
| `-row=INDICES` | Format as table cells, `INDICES` picks columns | `{# -row=1,3 location}` |
| `-sep=SEP` | Custom separator when joining | `{# -sep=' · ' items}` |

### Date format styles

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

### Implicit `#` invocation

When a placeholder or function call contains multiple arguments and the first argument is not a recognized function name or a quoted string, Loom automatically assumes `#`:

```
{start_date -date=full}        // same as {# start_date -date=full}
{price -currency=usd}          // same as {# price -currency=usd}
```

When the `#` name is omitted, it often feels more natural to place flags at the end of the argument list.

### Common patterns

Assuming variables:

```js
name: 'John Smith'
phone_numbers: ['1-613-444-5555', '54-912-555-5555']
publication: { title: 'theory of relativity', refereed: true }
```

```
{': ' (# -label @name) (' ' first_name last_name)}
// → "Name: John Smith"

{'\n' (# -phone phone_numbers)}
// → "+1 (613) 444-5555
//    +54 (912) 555-5555"

{' ' (# -title -bold publication.title) (# -wrap (? publication.refereed 'Refereed'))}
// → "**Theory of Relativity** (Refereed)"
```

If `publication.refereed` is false, the parentheses around "Refereed" don't show — `-wrap` wraps nothing into nothing.

## The switch-case functions

The functions `?`, `??`, and `???` are variants of the same switch-case operator. The number of question marks indicates how many case conditions the function accepts.

### Ternary `?`

```
{? condition if_true else}
{? condition if_true}                // else defaults to null
```

Minimum 2 arguments (at least one condition and one true-case body).

```
{? (> age 18) "Adult" "Minor"}
{? is_premium "⭐ Premium"}
```

### List conditions

If the condition is a list (or one of the bodies is), the operation becomes a matrix evaluated element-by-element:

```
{? [(> age 18) (> age 25)] "Adult" "Youth"}
// For age = 20:
//   row 1: true  → "Adult"
//   row 2: false → "Youth"
// → ["Adult", "Youth"]
```

### Multi-branch `??` and `???`

```
{?? cond1 cond2 then_1 then_2 else}
{??? cond1 cond2 cond3 then_1 then_2 then_3 else}
```

```
{??? (> age 65) (> age 18) (> age 13) "Senior" "Adult" "Teen" "Child"}
// age = 5  → "Child"
// age = 15 → "Teen"
// age = 30 → "Adult"
// age = 70 → "Senior"
```

## The accessor function

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

### Basic property access

```
{. 'info.name' person}
// → "John"
```

### Index access

```
{. '0' publications}
// → { title: 'Bio' }

{. 0 publications}
// → { title: 'Bio' }    (numeric index works too)
```

### Picking multiple properties

Pass a list of paths:

```
{. ['id' 'info.details.location'] person}
// → { id: "A-20", "info.details.location": "NY" }
```

### Pick and rename

Pass a map where keys are source paths and values are the new names:

```
{. {'id': 'newId', 'info.details.location': 'city'} person}
// → { newId: "A-20", city: "NY" }
```

### Stepping into lists

```
{. 'info.publications.title' person}
// → ["Bio", "Robotics"]
```

This is equivalent to `{person.info.publications.title}` for simple cases, but the `.` function also works on function results and other expressions that don't have a bare variable name.

## Step-in behavior

Loom functions prefer to **step into** lists when looking for arguments. Lists are treated as collections of elements, and operations are applied per-element.

```
{< 5 prices}    // compares 5 to each element in `prices`
```

To treat a list as a single element, use the `-l` flag:

```
{# ["a" "b" "c"]}       // formats each element: "a, b, c"
{# -l ["a" "b" "c"]}    // formats the list as one value: "[a, b, c]"
```

## Default result formatting

When a placeholder's result is not a number or string, Loom automatically calls `#` with `-l` and `-sep=', '` to produce a final string. So if a placeholder evaluates to the list `["journal", "book", "journal"]`, you get `"journal, book, journal"` in the rendered text.

## JavaScript built-in functions

In addition to Loom's symbolic core functions, you can call standard JavaScript `Math`, `String`, and `Array` methods:

```
{min 10 5 8}              // → 5
{max 10 5 8}              // → 10
{round 3.7}               // → 4
{toUpperCase "hello"}     // → "HELLO"
{toLowerCase "HELLO"}     // → "hello"
{sort [3 1 4]}            // → [1, 3, 4]
```

Callback-based methods like `sort` and `filter` accept an inline expression, with callback arguments available as special variables `$1`, `$2`, etc.:

```
{sort [3 1 4] "(- $1 $2)"}    // descending sort → [4, 3, 1]
```

For full method lists, see:

- [Math](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math)
- [String](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)
- [Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)

## Snippets

Snippets are reusable patterns defined alongside your templates. You define them in plain text and pass them to the `Loom` constructor.

### Defining snippets

```
[name arg1 ...args] { BODY }      // text template
[name arg1 ...args] ( BODY )      // expression / function
```

- `name` — the snippet name
- `arg1 ...args` — positional arguments; `...args` captures variadic args as a list
- `BODY` — the snippet body

The choice between `{}` and `()` determines how the body is evaluated:

- **`{ … }`** — the body is a template text (may contain inner `{…}` placeholders), evaluated with `render()`
- **`( … )`** — the body is an expression, evaluated with `evaluateText()`. Inner `{…}` are interpreted as maps.

Examples:

```
[tag1 age] { I'm {age}yo }

[greet name day timeOfDay] { Good {timeOfDay}, {name}! How are you doing on this fine {day}? }

[xor a b] (& (| a b) (! (& a b)))

[getSecondItem ...args] (. 1 args)
```

### Using snippets

```
{tag1 25}
// → "I'm 25yo"

{greet "Alice" "Friday" "afternoon"}
// → "Good afternoon, Alice! How are you doing on this fine Friday?"

{xor true true}
// → false

{getSecondItem "apple" "banana" "orange"}
// → "banana"
```

### The `$0` parameter

If the first argument in a snippet's parameter list is `$0`, the snippet receives the **flags** object as that argument. Useful for building snippets that accept flag-style options:

```
[fancy $0 title ...args] { Options: {# $0} Title: {title} Var args: {args} }
```

```
{fancy -date -type=test "The Great Gatsby" "a" "b" "c"}
// Options: {"date":true,"type":"test"} Title: The Great Gatsby Var args: ["a","b","c"]
```

Note that `$0` cannot appear alone in a placeholder — use it inside a function call like `(# $0)`.

## Special context variables

When Loom evaluates a template that processes a list of items, the following variables are automatically available:

- **`_items`** — the full list being processed
- **`_index`** — zero-based index of the current item
- **`_count`** — total number of items

These are most useful inside custom JavaScript functions that need cross-item context (running totals, index-based conditions, etc.).

## Error handling

When an expression fails to evaluate, Loom replaces it with an error message of the form `Error[CODE]:ARG` where `CODE` is the error code and `ARG` is the main offending argument.

| Code | Meaning |
|---|---|
| `101` | Variable not found |
| `102`, `104` | Invalid function name |
| `103` | Invalid expression |

Troubleshooting:

1. Check the error code to identify the error type
2. Review the offending argument
3. For `101`, verify the variable name
4. For `102`/`104`, check that you're using a valid function name
5. For `103`, check the expression syntax
6. Simplify complex templates and test each part incrementally

## Localization

Loom has built-in hooks for localization, but it's the caller's responsibility to provide localized values through the variable resolver.

### Localizable strings

A common pattern: store translations as a map keyed by locale code:

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

### Localized variable names

As described in the [Variables](#variables) section, `@name` retrieves the localized label for `name`. Your resolver decides what that label is.

### Localized formatting

The `#` function adapts to the active locale when formatting dates, numbers, and currency:

```
{# -date "2023-06-10"}
// English: "June 10, 2023"
// French:  "10 juin 2023"
```

The locale is controlled by the `setLocale()` export:

```js
import { setLocale } from '@uniweb/loom'

setLocale('fr-CA')
```

## Custom JavaScript functions

For operations not covered by the built-in library, register custom functions in the `Loom` constructor:

```js
const loom = new Loom({}, {
    totalRevenue: function () {
        return this._items.reduce((sum, item) => sum + item.amount, 0)
    },
    runningTotal: function (amount) {
        if (this._index === 0) return amount
        const prev = this._items[this._index - 1].runningTotal
        return prev + amount
    },
})
```

Inside a custom function, `this` provides access to the `_items`, `_index`, and `_count` context variables.

---

## See also

- **[basics.md](./basics.md)** — introductory guide
- **[quick-guide.md](./quick-guide.md)** — 10-minute tour of the most-used features
- **[examples.md](./examples.md)** — worked examples organized by task
- **[ai-prompt.md](./ai-prompt.md)** — compact prompt for generating Loom expressions with an LLM
