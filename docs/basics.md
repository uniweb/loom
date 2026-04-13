# Loom Basics

Loom is a small expression language for weaving data into text. You use it by mixing regular text with **placeholders** enclosed in curly braces `{}`. When the text is rendered, each placeholder is evaluated against a variable resolver and replaced with its result.

This page walks you through the essentials. If you want a dense reference, see [`language.md`](./language.md). If you want a 10-minute tour with just enough to start writing templates, see [`quick-guide.md`](./quick-guide.md).

## Variables

Insert a variable by wrapping its name in braces:

```
Hello, {name}!
```

If `name` resolves to `"John"`, the output is:

```
Hello, John!
```

Variable values come from a resolver function or object you pass into `loom.render()`:

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()
loom.render('Hello, {name}!', { name: 'John' })
// → "Hello, John!"
```

Variables can hold any JSON-serializable value: strings, numbers, lists, nested maps. Loom's strength is in the operations you can perform on those values inside a placeholder.

### Variable names with spaces or special casing

Variable names are case-sensitive and cannot contain spaces. To reference a variable with unusual casing, wrap the name in backticks — Loom converts it to the standard snake_case form:

```
{`Start Date`}    // equivalent to {start_date}
{`First Name`}    // equivalent to {first_name}
```

### Localized variable labels

Prefix a variable name with `@` to retrieve its **label** instead of its value. Labels are typically the human-readable name of a field, and can be localized:

```
{@address}: {address}
```

In English, this might render as `Address: 123 Main St`. In Spanish, `Dirección: 123 Main St`. The `@`-prefixed lookup returns the label; the bare lookup returns the value. Whether a given resolver provides labels is up to you — Loom just gives you a clean syntax for asking.

### Dot notation

Use dot notation to reach into nested maps and lists:

```js
const data = {
    member: {
        name: 'John',
        publications: [{ title: 'Cellular Bio' }, { title: 'Forestry' }],
    },
}
```

```
{member.name}                    // "John"
{member.publications.0.title}    // "Cellular Bio"
{member.publications.1.title}    // "Forestry"
{member.publications.title}      // ["Cellular Bio", "Forestry"]
```

Notice the last form: when you access a property on a list of maps, Loom returns a list of that property across all elements. This is the foundation for list-processing — most Loom functions can operate on lists naturally.

## Functions

Placeholders can contain functions in addition to variables. Functions use **Polish notation**: the function name comes first, then the arguments, separated by spaces.

```
{+ 2 3}           // → 5
{+ price 10}      // adds 10 to the value of `price`
{+ 2 (* 3 4)}     // nested: → 14
```

Inside a placeholder, you can omit the outer parentheses. These two are equivalent:

```
{+ 2 3}
{(+ 2 3)}
```

Nested function calls require explicit parentheses:

```
{+ price (* tax 0.05)}
```

## Data types

Loom expressions can use these types:

- **Number** — `7`, `-0.5`, `3.14`
- **Text** — enclosed by single quotes, double quotes, or backticks: `"Hello"`, `'World'`
- **List** — space-separated values in square brackets: `[1 "two" [3 4]]`
- **Map** — key-value pairs in curly braces (inside a function call): `{name: "John" age: 30}`
- **Range** — intervals with a start and end, built with the `~` function: `(~ "2000/01/01" "2010/12/31")`
- **Regex** — built with the `\` function

Commas are optional and ignored — they can be used as visual separators but don't change meaning.

## Empty values

A value is considered **empty** (or falsy) if it equals any of:

```
""   "0"   0   false   null   []   {}   undefined
```

This matters because several Loom functions — especially the conditional join `+?` and the filter functions `&` and `|` — treat empty values specially.

## Joining with a separator

Joining pieces of text with a separator is so common that Loom has a shortcut: when the first token inside a placeholder is a quoted string, it's treated as the separator for a join function.

```
{', ' a b c}               // same as: {+: ', ' a b c}
{', ' city province country}
// → "Ottawa, ON, Canada"
```

Empty values are skipped, so if `province` is missing you get `"Ottawa, Canada"` — no awkward trailing comma or double separator.

This is a big part of why Loom templates stay readable: joining variable fields is the most common operation, and it reads like English.

## Conditional logic

The `?` function is a ternary conditional — first argument is the condition, second is the "yes" value, third is the optional "no" value:

```
{? is_adult "Adult" "Minor"}
{? (> age 18) "Can vote" "Cannot vote yet"}
```

If the "no" value is omitted and the condition is false, the result is empty.

For multi-branch logic, use `??` or `???` (each extra `?` adds another condition slot):

```
{??? (> age 65) (> age 18) (> age 13) "Senior" "Adult" "Teen" "Child"}
```

If `age = 5`, the result is `"Child"`.

## Formatting with `#`

The format function `#` is the Swiss Army knife of Loom: it handles dates, numbers, currencies, phone numbers, labels, lists, JSON, and more. You control what it does with **option flags**.

```
{# -date=full start_date}          // "Saturday, January 15, 2000"
{# -date=long start_date}          // "January 15, 2000"
{# -currency=usd price}            // "$1,200.00"
{# -json members}                  // JSON string of the members variable
{# -label @location}               // the localized label for "location"
```

You can omit the `#` when the intent is clear from the flags:

```
{start_date -date=full}
{price -currency=usd}
```

See the [language reference](./language.md#the-format-function) for the full list of `#` flags.

## A realistic example

Here's a small template that pulls together everything above:

```
Home Address:

{', ' street city province country postal_code}

{+? 'Phone: ' phone}

{+? 'Faculty/Department of ' faculty_department}

Education: {', ' (. 'degree_name' education) (. '0.organization' education)}
```

Given a data resolver:

```js
{
    street: '123 Main St',
    city: 'Fredericton',
    province: 'NB',
    country: 'Canada',
    postal_code: 'E3B 5A3',
    phone: '555-0123',
    faculty_department: 'Engineering',
    education: [
        { degree_name: 'PhD', organization: 'University of Toronto' },
    ],
}
```

The template renders as:

```
Home Address:

123 Main St, Fredericton, NB, Canada, E3B 5A3

Phone: 555-0123

Faculty/Department of Engineering

Education: PhD, University of Toronto
```

And if `phone` and `faculty_department` were missing, those lines would render as empty strings — the conditional join `+?` drops the whole expression when any referenced value is empty. No broken sentences, no dangling prefixes.

## Next steps

- **[Quick guide](./quick-guide.md)** — a 10-minute tour of the most-used features, with more examples
- **[Language reference](./language.md)** — the complete reference: all functions, all flags, all syntactic forms
- **[Examples](./examples.md)** — worked examples organized by task
- **[AI prompt](./ai-prompt.md)** — a concise language summary you can paste into an LLM chat when you want help generating Loom expressions
