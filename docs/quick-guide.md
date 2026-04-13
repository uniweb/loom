# Loom Quick Guide

A 10-minute tour of the features you'll use most often. Read [`basics.md`](./basics.md) first if you haven't — this guide assumes you know what placeholders and Polish notation are.

## Setup

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()
```

You create one `Loom` instance and reuse it. It holds the snippet library and custom function library (if you provide them in the constructor) and has two main methods:

- `loom.render(template, vars)` — finds every `{…}` in a string and evaluates each, returns resolved text
- `loom.evaluateText(expr, vars)` — evaluates a single expression, returns any type (string, number, array, object, boolean)

The `vars` argument can be a function `(key) => value` or a plain object. Both work the same way.

## Common building blocks

### Variables and dot notation

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

### Join with separator

The first quoted string is the separator. Empty values are skipped:

```
{', ' first_name family_name}
// → "Diego, Macrini"

{', ' member.address.city member.address.province country}
// → "Fredericton, NB"    (country is missing, skipped)
```

### Conditional join

`+?` joins only if all referenced values are truthy. If anything is empty, the whole expression is empty:

```
{+? 'Dr. ' title}
// → "Dr. Macrini"   (if title = "Macrini")
// → ""              (if title is empty)

{+? '(' (", " affiliation department) ')'}
// → "(Engineering, UNB)"   or   ""
```

This is the most important idiom in Loom for writing templates that handle missing data gracefully.

## Formatting with `#`

### Dates

```js
const data = { start_date: '2000/01/15' }
```

```
{# -date=full start_date}     // "Saturday, January 15, 2000"
{# -date=long start_date}     // "January 15, 2000"
{# -date=medium start_date}   // "Jan 15, 2000"
{# -date=short start_date}    // "1/15/00"
{# -date=y start_date}        // "2000"
{# -date=ym start_date}       // "January 2000"
{# -date=m start_date}        // "January"
```

### Numbers and currency

```js
const data = { price: 1200 }
```

```
{# -number price}             // "1,200"
{# -currency=usd price}       // "$1,200.00"
{# -currency=eur price}       // "€1,200.00"
```

### Lists

When the value is a list, `#` formats each element:

```js
const data = { items: ['apple', 'banana', 'cherry'] }
```

```
{# items}                     // "apple, banana, cherry"   (default -sep)
{# -sep=' | ' items}          // "apple | banana | cherry"
```

### Labels

The `-label` flag prepends the localized field name:

```
{# -label @price price}       // "Price: $1,200.00"
```

This relies on your variable resolver providing a label when asked for `@price`. If you're not supplying labels, skip this flag.

## Conditionals

### Ternary `?`

```
{? is_member "Member" "Guest"}
{? (> age 18) "Adult" "Minor"}
{? has_discount (* price 0.9) price}    // apply discount if eligible
```

If the "else" value is omitted, the result is empty when the condition is false:

```
{? is_premium "⭐ Premium"}
```

### Multi-branch `??`, `???`

Each extra `?` adds another condition slot:

```
{?? (> age 65) (> age 18) "Senior" "Adult" "Youth"}
// age=70 → "Senior"
// age=30 → "Adult"
// age=10 → "Youth"

{??? (> score 90) (> score 75) (> score 50) "A" "B" "C" "F"}
```

## Working with lists

### Sort

```
{>> items}                // ascending
{>> -desc items}          // descending
{>> -date dates}          // sort as dates (Jan, Feb, Mar…)
{>> -desc -date dates}    // newest first
```

### Filter using comparison

Most comparison operators work on lists element-by-element:

```js
const data = { ages: [12, 25, 67, 30, 18] }
```

```
{> ages 18}               // [false, true, true, true, false]
{? (> ages 18) ages}      // [null, 25, 67, 30, null]
```

### Aggregate

```
{++ prices}               // sum of all prices
{++!! completed_tasks}    // count of truthy values
{|>> grades}              // minimum (first truthy after sort)
{&>> grades}              // maximum (last truthy after sort)
```

### Picking fields from a list of maps

```js
const data = {
    people: [
        { name: 'Alice', age: 30, email: 'a@x.com' },
        { name: 'Bob', age: 25, email: 'b@x.com' },
    ],
}
```

Dot notation gives you the field from every element:

```
{people.name}             // ["Alice", "Bob"]
```

For more control, use the `.` accessor function:

```
{. 'name' people}                            // ["Alice", "Bob"]
{. ['name' 'age'] people}                    // pick two fields
{. {name: 'n', age: 'a'} people}             // pick + rename
```

## Math

```
{+ 2 3}                   // 5
{+ price tax}             // sum of two variables
{- total discount}        // subtraction
{* quantity unit_price}   // multiplication
{/ total count}           // average
```

List arithmetic works element-by-element:

```
{+ prices 10}             // add 10 to each price
{* prices 1.13}           // apply 13% tax to each
```

## Snippets (reusable expressions)

Define your own reusable functions by passing snippet definitions to the constructor:

```js
const loom = new Loom(`
    [greet name]         { Hello, {name}! }
    [fullName first last] { {first} {last} }
    [currency amount]    { {# -currency=usd amount} }
    [xor a b]            (& (| a b) (! (& a b)))
`)
```

Snippets in `{ … }` are **text templates** — they're evaluated with `render()`.
Snippets in `( … )` are **expressions** — they're evaluated with `evaluateText()`.

Use them like built-in functions:

```
{greet "Alice"}                      // "Hello, Alice!"
{fullName "Diego" "Macrini"}         // "Diego Macrini"
{currency 1200}                      // "$1,200.00"
{xor true false}                     // true
```

## Custom JavaScript functions

For operations Loom's standard library doesn't cover, pass a map of custom functions to the second constructor argument:

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    slug:      (flags, value) => String(value).toLowerCase().replace(/\s+/g, '-'),
    daysSince: (flags, date) => {
        const diff = Date.now() - new Date(date).getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    },
})

loom.evaluateText('uppercase "hello world"')  // → "HELLO WORLD"
loom.evaluateText('slug "My Great Title"')    // → "my-great-title"
loom.evaluateText('daysSince "2024-01-01"')   // → (some number)
```

Custom functions receive `(flags, ...args)`:
- `flags` is the parsed flag object (e.g., `{date: true, format: 'long'}` from `-date -format=long`)
- `args` are the positional arguments

## Common idioms

### Safe sentence construction

Build a sentence where some parts may be missing, without getting broken grammar:

```
{+? 'Awarded in ' year}{+? ' by ' granting_body}{+? ', totaling ' (# -currency=usd amount)}.
```

Any missing field drops its own clause.

### Group by in the surrounding language

Loom doesn't have a `groupBy` built-in, but you can achieve it by combining standard-library functions with dot access:

```
Total {# -currency=usd (+ (. 'amount' grants))}
from {# (. 'source' grants)} ({+!! grants} grants)
```

### Localized date range

```
{# -date=ymm (~ start_date end_date)}
// → "January 2020 – December 2022"
```

### Labeled field

```
{+? (@ field_name) ': ' field_value}
// → "Address: 123 Main St"   (if both present, otherwise empty)
```

## What's next

- **[Language reference](./language.md)** — every function and every flag
- **[Examples](./examples.md)** — worked examples organized by task
- **[AI prompt](./ai-prompt.md)** — paste into an LLM chat to generate Loom expressions from plain English
