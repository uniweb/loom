# Loom — AI Prompt

A compact language summary you can paste into an LLM chat (ChatGPT, Claude, etc.) to get help generating Loom expressions from plain-English requirements. This file is self-contained — copy everything from the horizontal rule down into your chat and add your request below it.

---

# Loom: A Template Expression Language

Loom is an expression language for weaving data into text. It has two modes:

1. **Text with placeholders**: find every `{…}` in a string, evaluate each, return the resolved text
2. **Typed expression evaluation**: evaluate a single expression and return any type (number, boolean, list, map)

## Placeholders

Placeholders are enclosed in `{}` and can contain a variable or a function call.

### Variables

```
Hello, {name}!
```

Use dot notation for nested fields:

```
{member.name}
{member.publications.1.title}
```

When accessing a property on a list of maps, you get a list of that property across all elements:

```
{publications.title}   // → ["A", "B", "C"]
```

Prefix a name with `@` to get its label instead of its value:

```
{@address}: {address}   // → "Address: 123 Main St"
```

### Functions

Functions use Polish notation — the function name comes first, followed by space-separated arguments:

```
{+ 2 3}              // → 5
{+ price 10}         // add 10 to the `price` variable
{+ 2 (* 3 4)}        // nested → 14
```

When a quoted string is the first token, it's treated as a separator for a join:

```
{', ' city province country}
// → "Fredericton, NB, Canada"
```

Empty values are dropped during joins.

## Formatting with `#`

`#` handles all formatting. Control it with flags (`-name` or `-name=value`):

```
{# -date=long start_date}          // "January 15, 2000"
{# -date=y start_date}             // "2000"
{# -currency=usd price}            // "$1,200.00"
{# -phone contact.phone}           // "+1 (613) 444-5555"
{# -label @price price}            // "Price: $1,200.00"
{# -json data}                     // JSON string
{# -sep=' | ' items}               // "a | b | c"
```

You can omit `#` when the flags make the intent clear:

```
{start_date -date=long}
{price -currency=usd}
```

### Date styles

- `full`: "Saturday, January 15, 2000"
- `long`: "January 15, 2000"
- `medium` (default): "Jan 15, 2000"
- `short`: "1/15/00"
- `y`: "2000"
- `m`: "January"
- `mm`: "01"
- `ym`: "January 2000"
- `ymm`: "01/2000"

## Conditionals

### Ternary `?`

```
{? condition if_true else}
{? condition if_true}            // else defaults to empty
```

```
{? (> age 18) "Adult" "Minor"}
{? is_premium "⭐ Premium"}       // empty if false
```

### Multi-branch `??` and `???`

```
{??? (> age 65) (> age 18) (> age 13) "Senior" "Adult" "Teen" "Child"}
```

Each extra `?` adds another condition slot.

## Joining

- `{', ' a b c}` — join with separator (empty values dropped)
- `{+? 'prefix ' value}` — conditional join, produces empty if any referenced value is empty
- `{+ a b c}` — concatenate (adds numbers, merges strings)

### Conditional join — the most important idiom

```
{+? 'Dr. ' title}
```

- `title = "Smith"` → `"Dr. Smith"`
- `title = ""`      → `""`

This is how you build sentences that gracefully handle missing fields:

```
{+? 'Born in ' year}{+? ' in ' city}.
// → "Born in 1985 in Montreal."
// → "Born in 1985."                  (city missing)
// → ""                                (year missing)
```

## List operations

Functions operate on lists element-by-element when you pass a list argument:

```
{+ prices 10}          // add 10 to each element
{* prices 1.13}        // multiply each by 1.13
```

### Sort

```
{>> items}             // ascending
{>> -desc items}       // descending
{>> -date dates}       // as dates
```

### Aggregate

```
{++ prices}            // sum of numeric values
{++!! items}           // count of truthy values
```

### Filter / match

```
{= publications.type "book"}    // [false, true, false, false]
{? (= publications.type "book") 'long' 'short'}
// → ["short", "long", "short", "short"]
```

### Accessor

```
{. 'name' people}                         // → ["Alice", "Bob"]
{. ['name' 'age'] people}                 // pick two fields
{. {name: 'n', age: 'a'} people}          // pick + rename
```

## Function categories

| Category | Functions |
|---|---|
| Accessor | `.` |
| Creators | `@`, `^`, `~`, `\`, `<>`, `phone`, `address`, `email`, `currency` |
| Filters | `&`, `\|`, `\|=`, `\|?`, `&?`, `+?` |
| Formatter | `#`, `!`, `!!` |
| Mappers | `+`, `-`, `*`, `/`, `%`, `>`, `<`, `>=`, `<=`, `=`, `==`, `!=` |
| Joiners | `+-`, `+:` |
| Sorter | `>>` |
| Switchers | `?`, `??`, `???` |
| Compound | `\|=`, `&=`, `\|?`, `&?`, `!!`, `\|>>`, `&>>`, `++!!` |

## Generic flags

Apply to any function:

- `-r` — reverse the result list
- `-l` — treat list arguments as single elements rather than stepping into them

## Snippets (user-defined functions)

Define reusable patterns:

```
[greet name] { Hello, {name}! }
[fullName first last] { {first} {last} }
[xor a b] (& (| a b) (! (& a b)))
```

- `{ … }` body: text template (use with `render()`)
- `( … )` body: expression (use with `evaluateText()`)

Invoke like a built-in:

```
{greet "Alice"}                  // "Hello, Alice!"
{fullName "Diego" "Macrini"}     // "Diego Macrini"
{xor true false}                 // true
```

## Your task

Given a description of what the user wants the output to look like, generate the Loom expression(s) that produce it. Prefer:

1. **Conditional joins (`+?`)** when building sentences with optional parts, to avoid broken grammar when fields are missing
2. **Formatter flags** over manual string manipulation — `{# -date=long x}` instead of writing out date parsing
3. **Dot notation** for nested access when possible; use `(. path value)` only when the path needs computation
4. **Named snippets** if the same pattern appears more than once — define it once and reuse

Ask for clarification if:

- The user's data shape is unclear (especially whether a field is a list or a single value)
- It's ambiguous whether missing data should produce empty output, placeholder text, or an error
- A custom format is needed that isn't covered by `#`

---

**User request:**

(paste your task here)
