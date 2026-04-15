# Loom Basics

Loom is a small expression language for weaving data into text. You mix regular text with **placeholders** in curly braces `{}`, and each placeholder is evaluated against a data resolver and replaced with its result.

This page is your first long exposure to the language. If you want a faster tour, see [`quick-guide.md`](./quick-guide.md). If you want an exhaustive reference, see [`language.md`](./language.md).

## The idea in one example

```js
import { Loom } from '@uniweb/loom'

const loom = new Loom()

loom.render('Hello, {name}!', { name: 'Diego' })
// → "Hello, Diego!"
```

Loom's strength isn't simple substitution — every template engine does that. It's what happens when the data on the other side of the placeholder is a list, or a tree of objects, or a set of grants that need to be filtered, sorted, aggregated, and formatted inline:

```js
const profile = {
    first_name: 'Diego',
    publications: [
        { title: 'Cellular Bio', year: 2018, refereed: true },
        { title: 'Forestry', year: 2022, refereed: false },
        { title: 'Hydrology', year: 2023, refereed: true },
    ],
}

loom.render(
    'Hello, {first_name}! You have {COUNT OF publications} publications, ' +
        '{COUNT OF publications WHERE refereed} of them refereed.',
    profile,
)
// → "Hello, Diego! You have 3 publications, 2 of them refereed."
```

That second placeholder, `{COUNT OF publications WHERE refereed}`, is Loom doing its real job — filtering a list and counting the result without leaving the template.

## Loom is like SQL for templates

A developer writes the template; non-technical staff read and adjust it without having to re-ship code. SQL works the same way: engineers write the queries, analysts read and tweak them. Loom is that relationship applied to text generation — reports, CVs, dashboards, form letters.

This is why the natural-language form is the default. You shouldn't need to memorize Polish-notation operators to change "show publications sorted by year" to "show publications sorted by year descending."

## Variables

Wrap a name in braces to insert a variable:

```
Hello, {name}!
```

Variable values come from a resolver — either a plain object or a `(key) => value` function — passed as the second argument to `render()`:

```js
loom.render('Hello, {name}!', { name: 'John' })
// → "Hello, John!"
```

Variables can hold any JSON-serializable value: strings, numbers, booleans, lists, nested maps. What makes Loom compact is the set of things you can do with those values *inside* a placeholder.

### Dot notation

Reach into nested maps and lists with `.`:

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
{member.publications.title}      // ["Cellular Bio", "Forestry"]
```

The last one is the key idea: when you access a property on a **list of maps**, Loom returns the list of that property across all elements. This is the foundation for list-processing — most Loom operations treat lists naturally and you rarely need an explicit loop.

### Variable names with spaces

Variable names are case-sensitive and can't contain spaces in their bare form. Wrap the name in backticks and Loom normalizes it to snake_case:

```
{`Start Date`}    // equivalent to {start_date}
{`First Name`}    // equivalent to {first_name}
```

### Variable labels

Prefix a variable name with `@` to get its **label** instead of its value:

```
{@address}: {address}
// → "Address: 123 Main St"
```

Your resolver decides what `@address` returns — typically a human-readable (and possibly localized) field label. If the resolver returns nothing for a given `@name`, Loom falls back to **prettifying the variable name itself**: `first_name` becomes `"First Name"`, `date_of_birth` becomes `"Date of Birth"`. That means the common pattern is a small map of labels that actually need overrides, with prettification catching everything else for free.

**For rows that should disappear when the value is empty**, use Plain's multi-value `SHOW … IF PRESENT` so Loom can drop the whole clause:

```
{SHOW @email, ': ', email IF PRESENT}
// email = "a@b.com"  → "Email: a@b.com"
// email = ""         → ""   (nothing shown)
```

The plain `{@email}: {email}` form is two separate placeholders, so it would leave `"Email: "` hanging when the value is missing. See [Variable labels](./language.md#variable-labels) and [Multi-value SHOW](./language.md#multi-value-show) in the language reference for the full pattern.

## Plain form: verbs, values, modifiers

The default way to write a Loom expression reads like a description of what you want. There are a handful of verbs:

- **`SHOW`** — display a value, optionally with modifiers
- **`IF … OTHERWISE …`** — pick between two values
- **`COUNT OF`**, **`TOTAL OF`** / **`SUM OF`**, **`AVERAGE OF`** — aggregate a list

And a handful of modifiers that chain onto any value:

- **`WHERE`** / trailing **`IF`** — filter a list by a condition
- **`SORTED BY`** … **`ASCENDING`** / **`DESCENDING`** — sort a list
- **`JOINED BY`** — pick a custom separator when the list is rendered
- **`AS`** — format the value (`AS long date`, `AS currency USD`, `AS phone`, …)
- **`WITH LABEL`** — prepend a localized label

Here's what a realistic expression looks like:

```
{SHOW publications.title WHERE refereed SORTED BY year DESCENDING JOINED BY ', '}
```

Read it left to right: *show the titles of the publications where refereed is true, sorted by year descending, joined by commas.* That's exactly what it does.

### SHOW is optional for bare values

If all you're doing is inserting a value, you don't need to say `SHOW`:

```
{publication.title}
{SHOW publication.title}    // same thing
```

Use `SHOW` when you want to attach modifiers. It reads better when modifiers are involved and is noise when they aren't.

### Modifiers compose

`SHOW` accepts modifiers in any order. The translator applies them in a canonical sequence internally (filter → sort → join → format → label), so you can write them in whichever order reads best:

```
{SHOW publications.title SORTED BY year DESCENDING WHERE refereed JOINED BY ', '}
```

parses the same as the earlier example.

### Conditionals

`IF … OTHERWISE …` picks between two values:

```
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
```

The `SHOW` after `OTHERWISE` is optional when both branches are simple values, and `THEN` / `ELSE` work as synonyms for readers coming from SQL:

```
{IF age >= 18 THEN 'Adult' ELSE 'Minor'}
{IF age >= 18 'Adult' 'Minor'}
```

All three compile to the same thing.

### Aggregation

Four verbs for collapsing a list to a single value:

```
{COUNT OF publications}                   // 3
{COUNT OF publications WHERE refereed}    // 2
{TOTAL OF grants.amount}                  // sum of all grant amounts
{SUM OF grants.amount}                    // same as TOTAL OF
{AVERAGE OF grants.amount}                // mean of the amounts
```

All four accept `WHERE`, `AS`, `WITH LABEL`, and the other modifiers:

```
{COUNT OF publications WHERE refereed AS number}
{TOTAL OF grants.amount WHERE active AS currency USD}
```

## Joining text with a separator

Joining fields with a separator is so common that Loom special-cases it. When the first token inside a placeholder is a quoted string, Loom treats it as the separator and joins everything after it:

```
{', ' city province country}
// → "Fredericton, NB, Canada"
```

**Empty values are dropped**, so if `province` is missing you get `"Fredericton, Canada"` — no dangling comma. This is how you write `{', ' city province country}` and have it handle every missing-field combination without broken grammar.

## Graceful missing data

In Loom, a value is **empty** if it's `""`, `null`, `undefined`, `NaN`, `[]`, or `{}` — the things that shouldn't appear in output. The conditional join `{+? …}` drops the entire clause if any referenced value is empty:

```
{+? 'Dr. ' title}
// → "Dr. Smith"   if title is "Smith"
// → ""            if title is missing
```

Combine it with plain text to build sentences that gracefully collapse when fields are missing:

```
{+? 'Born in ' year}{+? ' in ' city}.
// → "Born in 1985 in Montreal."
// → "Born in 1985."        (city missing)
// → ""                      (year missing)
```

**Numbers are never empty.** `0` is a legitimate value and joins into output normally:

```
{+? 'Likes: ' likes}
// likes = 0     → "Likes: 0"
// likes = null  → ""
```

Loom also has a separate notion of "falsy" for conditional logic, where `0` and empty collections count as false. Most of the time you don't have to think about the distinction — `+?` and the join shortcut use "empty" (so `0` shows up), and `?` / `&` / `|` use "falsy" (so `0` fails the condition). See [`language.md`](./language.md#empty-vs-falsy) for the full rules.

## Formatting

The `AS` modifier formats a value:

```
{SHOW start_date AS long date}       // → "January 15, 2000"
{SHOW start_date AS full date}       // → "Saturday, January 15, 2000"
{SHOW start_date AS year only}       // → "2000"
{SHOW price AS number}               // → "1,200"    (locale grouping)
{SHOW data AS JSON}                  // → JSON string
```

The recognized format types include `date` (with styles `long`, `full`, `short`, `medium`, `year only`, `month only`), `number`, `JSON`, and the specialized creators `currency`, `phone`, `address`, `email` (these expect their corresponding creator objects and are covered in the [language reference](./language.md#creators)).

`WITH LABEL` prepends the localized field label:

```
{SHOW price WITH LABEL}              // uses the default label for `price`
{SHOW price WITH LABEL 'Cost'}       // uses a custom label
```

## Calling `render` vs `evaluateText`

A `Loom` instance has two methods:

- **`loom.render(template, vars)`** — walks a template string, evaluates every `{…}` placeholder, returns the resolved text.
- **`loom.evaluateText(expression, vars)`** — evaluates a single expression and returns whatever type it produces. Use this when you want the data itself — a number, a boolean, a list — rather than a string.

```js
loom.evaluateText('COUNT OF publications WHERE refereed', profile)
// → 2   (a number)

loom.evaluateText('SHOW publications.title SORTED BY year DESCENDING', profile)
// → ['Hydrology', 'Forestry', 'Cellular Bio']   (a list)
```

The `vars` argument can be a plain object or a `(key) => value` resolver function — both work the same way throughout the library.

## A realistic example

Putting it together:

```
{first_name} {family_name}

{', ' street city province country postal_code}
{+? 'Phone: ' phone}
{+? 'Department of ' department}

Publications: {COUNT OF publications} total, {COUNT OF publications WHERE refereed} refereed.

Recent work:
{SHOW publications.title WHERE refereed AND year > 2020 SORTED BY year DESCENDING JOINED BY ', '}
```

If `phone` or `department` is missing, those lines render as empty strings. If `province` is missing, the address line closes up around it. If no publications meet the filter, the "Recent work" line leaves an empty list.

The template author can read this. They can change `refereed` to `published`, or `year > 2020` to `year > 2015`, without knowing JavaScript.

## Loom's compact mode

Everything above is Loom's **Plain form** — the natural-language default. Loom has a second surface, **Compact form**, that uses Polish-notation operators and is terser:

```
{SHOW publications.title WHERE refereed SORTED BY year DESCENDING JOINED BY ', '}
{+: ', ' (>> -desc -by=year (? refereed publications.title))}
```

Both forms parse to the same internal representation and run on the same evaluator. Compact form is useful when the Plain phrasing gets long, or when you want something short inline inside a larger expression. You can mix the two freely — a nested `{…}` inside a Plain expression passes through as Compact form, which is the clean way to reach for symbolic precision mid-template:

```
{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}
```

For now, know that Compact form exists and you'll see it occasionally. The [language reference](./language.md) covers it in full.

## Snippets

When the same pattern shows up in several places, extract it into a **snippet**. Snippets are named reusable expressions you pass to the `Loom` constructor.

```js
const loom = new Loom(`
    [greet name]          { Hello, {name}! }
    [recent pubs]         ( SHOW pubs.title WHERE year > 2020 )
    [fullName first last] { {first} {last} }
`)

loom.render('{greet "Diego"}', () => undefined)
// → "Hello, Diego!"

loom.render('{fullName "Diego" "Macrini"}', () => undefined)
// → "Diego Macrini"
```

The body form matters:

- **`{ body }`** — a text template. The body may contain its own `{…}` placeholders and is evaluated with `render()`, returning a string.
- **`( body )`** — a single expression. Evaluated with `evaluateText()`, returns whatever type the expression produces.

Snippet bodies accept Plain form, Compact form, or a mix — they're translated once at construction time.

See [`language.md`](./language.md#snippets) for the full snippet reference, including variadic `...args` and the `$0` flag-bag parameter.

## Next steps

- **[Quick guide](./quick-guide.md)** — a 10-minute tour of the most-used features
- **[Language reference](./language.md)** — the complete reference for every function, flag, and syntactic form in both surface forms
- **[Examples](./examples.md)** — worked examples organized by task
- **[AI prompt](./ai-prompt.md)** — paste into an LLM chat to generate Loom expressions from plain-English requirements
