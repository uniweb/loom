# Loom — AI Prompt

A compact, self-contained language summary you can paste into an LLM chat (ChatGPT, Claude, etc.) to get help generating Loom expressions from plain-English requirements. Copy everything from the horizontal rule down into your chat and add your task below it.

---

# Loom: A Template Expression Language

Loom is an expression language for weaving data into text. It has two modes:

1. **Text with placeholders**: find every `{…}` in a string, evaluate each, return the resolved text
2. **Typed expression evaluation**: evaluate a single expression and return any type (number, boolean, list, map)

Loom is **one language with two surface forms**:

- **Plain form** — natural-language verbs and modifiers. `{SHOW publications.title WHERE refereed SORTED BY year DESCENDING JOINED BY ', '}`. This is the default and the audience-appropriate front door.
- **Compact form** — symbolic Polish-notation. `{+: ', ' (>> -desc -by=year (? publications.refereed publications.title))}`. Terser, useful when Plain phrasing gets long. The evaluator runs everything as Compact internally.

**Lead with Plain form.** Prefer natural-language verbs and modifiers in generated expressions; drop into Compact form only when Plain doesn't have a verb for what you need, or when Compact reads more clearly for a short inline expression.

## Variables

```
Hello, {name}!
```

Dot notation for nested fields:

```
{member.name}
{member.publications.1.title}
```

Accessing a property on a list of maps gives you the list of that property:

```
{publications.title}   // → ["A", "B", "C"]
```

Prefix a name with `@` to get its localized label instead of its value:

```
{@address}: {address}   // → "Address: 123 Main St"
```

## Plain form verbs

| Verb | Role |
|---|---|
| `SHOW` | Display a value, with optional modifiers. Optional when the expression is just a value. |
| `IF … OTHERWISE …` | Branching. `IF cond SHOW A OTHERWISE SHOW B` — also `THEN`/`ELSE`, bare values. |
| `COUNT OF list` | Count a list (optionally filtered) |
| `TOTAL OF list.field` / `SUM OF` | Sum a numeric field |
| `AVERAGE OF list.field` | Mean of a numeric field |

## Plain form modifiers

Chain onto any value. Order is free — the translator applies them in a canonical sequence internally.

| Modifier | What it does |
|---|---|
| `WHERE cond` / trailing `IF cond` | Filter a list |
| `SORTED BY field` + `ASCENDING` / `DESCENDING` | Sort (default ascending) |
| `FROM LOWEST TO HIGHEST field` / `FROM HIGHEST TO LOWEST field` | Long-form sort |
| `JOINED BY 'sep'` | Custom separator when rendering |
| `AS type` | Format: `AS long date`, `AS currency USD`, `AS phone`, `AS JSON`, … |
| `WITH LABEL` / `WITH LABEL 'text'` | Prepend a localized label |

Full Plain examples:

```
{SHOW publications.title WHERE refereed SORTED BY year DESCENDING JOINED BY ', '}
{COUNT OF publications WHERE refereed}
{TOTAL OF grants.amount AS currency USD}
{AVERAGE OF pubs.year WHERE refereed}
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
{SHOW start_date AS long date}
{SHOW price WITH LABEL 'Cost'}
```

Logical operators inside `WHERE`: `AND`, `OR`, `NOT` (or `&&`, `||`, `!`).

```
{SHOW publications.title WHERE refereed AND year > 2020}
{SHOW publications.title WHERE funded OR sponsored}
```

Bare identifiers in a `WHERE` clause are auto-prefixed with the list root, so `WHERE refereed` on `publications.title` means "where `publications.refereed` is true" evaluated per-element.

## Graceful missing data

In Loom, a value is **empty** if it's `""`, `null`, `undefined`, `NaN`, `[]`, or `{}`. Numbers like `0` are NOT empty.

The conditional join `+?` (Compact form) drops the entire clause if any referenced value is empty:

```
{+? 'Dr. ' title}
// title = "Smith"  → "Dr. Smith"
// title = ""       → ""

{+? 'Born in ' year}{+? ' in ' city}.
// year = 1985, city = "Montreal"  → "Born in 1985 in Montreal."
// city missing                    → "Born in 1985."
// year missing                    → ""
```

For **conditional logic** (rather than output), `0`, `false`, and empty collections are all "falsy" — so `{? likes 'has' 'none'}` with `likes=0` returns `"none"`.

Use `+?` (Compact) for graceful sentence construction — it's the most important idiom for handling missing data, and there's no Plain-form verb for it.

## Joining

Two shortcuts for joining text with a separator:

```
{', ' city province country}    // join with ", ", drop empty values
{+? 'Dr. ' title}                // conditional join (empty if any arg is empty)
{SHOW items JOINED BY ' • '}     // Plain form — custom separator inside SHOW
```

## Compact form essentials

Compact form uses Polish notation — function name first, space-separated args. Keep it in your toolkit for inline precision inside Plain expressions.

```
{+ 2 3}                    // → 5
{+ price 10}               // → price + 10
{+ prices 10}              // → [each price + 10]   (list-aware)
{? cond 'yes' 'no'}        // ternary
{?? c1 c2 v1 v2 else}      // multi-branch
{>> items}                 // sort ascending
{>> -desc items}           // sort descending
{++ prices}                // sum
{++!! items}               // count of non-falsy
{# -date=long start_date}  // format as long date
{# -currency=usd price}    // format as currency
{# -phone contact.phone}   // format as phone number
{# -json data}             // JSON string
{. 'name' people}          // pick `name` from each (also supports pick+rename)
```

Compact-form mixing inside Plain — a nested `{…}` passes through verbatim:

```
{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}
```

## Snippets (user-defined functions)

Define reusable patterns:

```
[greet name]          { Hello, {name}! }
[fullName first last] { {first} {last} }
[recent pubs]         ( SHOW pubs.title WHERE year > 2020 )
[xor a b]             (& (| a b) (! (& a b)))
```

- `{ … }` body: text template (evaluated with `render()`)
- `( … )` body: expression (evaluated with `evaluateText()`)

Invoke like a built-in:

```
{greet "Alice"}                  // "Hello, Alice!"
{fullName "Diego" "Macrini"}     // "Diego Macrini"
{recent publications}            // list of titles with year > 2020
```

Snippet bodies accept Plain form, Compact form, or a mix.

## Keyword casing

Plain-form keywords (`SHOW`, `WHERE`, `SORTED BY`, `COUNT OF`, `IF`, `AND`, `OR`, `NOT`, …) are case-insensitive — `SHOW`, `show`, `Show` all parse the same. **ALL CAPS is the stability contract**: a keyword written in ALL CAPS is guaranteed to be interpreted as a keyword now and in every future version. Use ALL CAPS in generated code when it improves clarity; lowercase is also fine.

## Your task

Given a description of what the user wants the output to look like, generate the Loom expression(s) that produce it. Prefer:

1. **Plain form** for filtering (`WHERE`), sorting (`SORTED BY`), aggregation (`COUNT OF` / `TOTAL OF` / `AVERAGE OF`), branching (`IF … OTHERWISE …`), and formatting (`AS …`, `WITH LABEL`). Plain form reads more naturally and is easier for non-developers to review and adjust.
2. **Compact `+?` (conditional join)** for building sentences with optional parts — there's no Plain equivalent, and it's the cleanest way to avoid broken grammar when fields are missing.
3. **Dot notation** for nested access when the path is a simple chain.
4. **Named snippets** if the same pattern appears more than once — define once, reuse.

Ask for clarification if:

- The user's data shape is unclear (especially whether a field is a list or a single value).
- It's ambiguous whether missing data should produce empty output, a placeholder, or an error.
- A custom format is needed that isn't covered by Loom's built-in format types.

---

**User request:**

(paste your task here)
