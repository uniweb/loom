# Loom Examples

Worked examples organized by task. Examples lead with Plain form and drop into Compact form where it reads better or shows something Plain doesn't have a verb for. Every example runs against the current implementation.

## Variable access

### Basic substitution

```js
vars = { name: 'John', age: 25, fruits: ['apple', 'banana', 'cherry'] }
```

```
Hello, {name}! Your age is {age}, and you love {. '0' fruits} and {. '1' fruits}.
```

Result:

```
Hello, John! Your age is 25, and you love apple and banana.
```

### Nested properties

```js
vars = {
    users: [
        { name: 'John', age: 25, favoriteFruit: 'apple' },
        { name: 'Jane', age: 30, favoriteFruit: 'banana' },
    ],
}
```

```
{users.0.name} is {users.0.age} years old and likes {users.0.favoriteFruit}.
{users.1.name} is {users.1.age} years old and likes {users.1.favoriteFruit}.
```

### Reaching into a list of maps

```js
vars = {
    publications: [
        { title: 'A', year: 2020, type: 'journal' },
        { title: 'B', year: 2021, type: 'book' },
        { title: 'C', year: 2022, type: 'journal' },
    ],
}
```

```
{publications.title}       // → ["A", "B", "C"]
{publications.year}        // → [2020, 2021, 2022]
{publications.type}        // → ["journal", "book", "journal"]
```

Default rendering turns lists into comma-separated text:

```
Types: {publications.type}
// → "Types: journal, book, journal"
```

### Accessor function for picking and renaming

```js
vars = {
    person: {
        id: 'A-20',
        info: { name: 'John', details: { age: 30, location: 'NY' } },
    },
}
```

```
{. 'info.name' person}
// → "John"

{. ['id' 'info.details.location'] person}
// → { id: "A-20", "info.details.location": "NY" }

{. {'id': 'newName', 'info.details.location': 'city'} person}
// → { newName: "A-20", city: "NY" }
```

## Joining text

### Simple join with a separator

```js
vars = { city: 'Fredericton', province: 'NB', country: 'Canada' }
```

```
{', ' city province country}
// → "Fredericton, NB, Canada"
```

### Empty values are dropped

```js
vars = { city: 'Fredericton', province: '', country: 'Canada' }
```

```
{', ' city province country}
// → "Fredericton, Canada"
```

No double commas; the empty field is dropped.

### Conditional join

`+?` joins only if all referenced values are non-empty. If any are empty, the whole expression is empty.

```
{+? 'Dr. ' title}
// title = "Smith"  → "Dr. Smith"
// title = ""       → ""
```

### Multi-part sentences that handle missing data

```
{+? 'Born in ' year}{+? ' in ' city}.
// year = 1985, city = "Montreal"  → "Born in 1985 in Montreal."
// year = 1985, city missing       → "Born in 1985."
// year missing                    → ""
```

### Grouped optional clause

```
{+? '(' (', ' affiliation department) ')'}
// affiliation = "UNB", department = "Engineering" → "(Engineering, UNB)"
// either missing                                   → ""
```

## Math and aggregation

### Basic arithmetic

```
{+ 2 3}            // → 5
{+ a b}            // → (a + b)
{* quantity unit_price}
{/ total count}
```

### List arithmetic

```js
vars = { prices: [100, 50, 20] }
```

```
{+ prices 10}           // → [110, 60, 30]
{* prices 1.13}         // → [113, 56.5, 22.6]
{/ (+ prices 10) 2}     // → [55, 30, 15]
```

### Plain-form aggregation

```js
vars = {
    grants: [
        { title: 'Grant 1', amount: 200000 },
        { title: 'Grant 2', amount: 150000 },
        { title: 'Grant 3', amount: 150000 },
    ],
}
```

```
{TOTAL OF grants.amount}                    // → "500,000"
{AVERAGE OF grants.amount}                  // → "166,666.667"
{COUNT OF grants}                           // → "3"
{TOTAL OF grants.amount AS number}          // → "500,000"
```

Those numeric outputs are locale-formatted by Loom's default formatter when rendered into text. Use `evaluateText` instead of `render` if you want the raw number:

```js
loom.evaluateText('TOTAL OF grants.amount', { grants }) // → 500000 (number)
```

### Aggregation with filters

```
{COUNT OF grants WHERE amount > 150000}
{SUM OF grants.amount WHERE active}
{AVERAGE OF pubs.year WHERE refereed}
```

`WHERE` on `SUM` / `TOTAL` / `AVERAGE` filters the source list before aggregating, so `SUM OF grants.amount WHERE active` is the total of active-grant amounts.

### Report-style sentence

```
{name} received {COUNT OF grants} grants totaling
{TOTAL OF grants.amount}, averaging {AVERAGE OF grants.amount}
per grant.
```

With `name = "Dr. Smith"` and the grants above:

```
Dr. Smith received 3 grants totaling 500,000, averaging 166,666.667 per grant.
```

Loom's default renderer applies locale number grouping to any numeric placeholder result. That's the right default for counts and monetary amounts, but it surprises people who try to render year integers (`{year}` renders `2020` as `"2,020"`). Pass year values as strings (`year: "2020"`), or use `{SHOW y AS year only}` on a date, to sidestep the grouping.

## Formatting

### Dates

```js
vars = { start_date: '2000/01/15' }
```

```
{SHOW start_date AS full date}     // "Saturday, January 15, 2000"
{SHOW start_date AS long date}     // "January 15, 2000"
{SHOW start_date AS short date}    // "1/15/00"
{SHOW start_date AS year only}     // "2000"
```

The Compact-form equivalents use the `#` formatter:

```
{# -date=full start_date}          // same as "AS full date"
{# -date=long start_date}
{# -date=short start_date}
{# -date=y start_date}
```

### Date ranges

```js
vars = { start_date: '2000/01/02', end_date: '' }
```

```
{# (~ start_date end_date)}
// → "Jan 2, 2000 – Present"
```

The range formatter shows "Present" when the end date is empty, and has symmetric handling if the start is empty:

```js
vars = { start_date: '', end_date: '2010/12/31' }
```

```
{# (~ start_date end_date)}
// → "Present – Dec 31, 2010"
```

### Numbers

```js
vars = { price: 1200 }
```

```
{SHOW price AS number}    // → "1,200"   (locale-formatted)
```

Currency, phone, address, and email formats (`AS currency USD`, `AS phone`, `AS address`, `AS email`) dispatch to specialized formatters that expect their corresponding creator objects (`(currency …)`, `(phone …)`, `(address …)`, `(email …)`) rather than bare strings. Plain string inputs pass through mostly unchanged. See the language reference for the creator-object forms.

### Labels

```
{SHOW price WITH LABEL}
{SHOW price WITH LABEL 'Cost'}
```

## Conditionals

### Simple if-else

```
{IF is_adult SHOW 'Adult' OTHERWISE SHOW 'Minor'}
{IF age >= 18 SHOW 'Adult' OTHERWISE SHOW 'Minor'}
{IF has_discount (* price 0.9) price}
```

### Elide on false

Omit the "else" branch when you want an empty result on false:

```
{IF is_premium SHOW '⭐ Premium'}
// is_premium = true   → "⭐ Premium"
// is_premium = false  → ""
```

### Multi-branch

Plain has `IF`; for three-plus branches, use Compact form's `??` / `???`:

```
{??? (> age 65) (> age 18) (> age 13) 'Senior' 'Adult' 'Teen' 'Child'}
// age = 70 → "Senior"
// age = 30 → "Adult"
// age = 15 → "Teen"
// age = 5  → "Child"
```

## Filtering and counting

### Filter and display

```js
vars = {
    publications: [
        { title: 'A', type: 'journal', refereed: true },
        { title: 'B', type: 'book', refereed: false },
        { title: 'C', type: 'journal', refereed: true },
        { title: 'D', type: 'conference', refereed: true },
    ],
}
```

```
{SHOW publications.title WHERE refereed}
{SHOW publications.title WHERE type = 'journal'}
{SHOW publications.title WHERE refereed AND type = 'journal'}
```

### Counting matches

```
In {year}, {name} published {COUNT OF publications WHERE refereed} refereed papers
and {COUNT OF publications WHERE type = 'conference'} conference papers.
```

### Count with comparison

```
{COUNT OF publications WHERE year > 2020}
```

## Sorting

### Basic sort (Compact)

```
{>> "b" "a" "c"}         // → ["a", "b", "c"]
{>> 2 1 3}               // → [1, 2, 3]
{>> -desc "a" "b" "c"}   // → ["c", "b", "a"]
```

### Sort as dates

```
{>> -date ["2001/02/10"] ["2001/02/1"] ["July 1, 2000"]}
// → [["July 1, 2000"], ["2001/02/1"], ["2001/02/10"]]
```

### Sort with a Plain expression

```
{SHOW items SORTED BY name DESCENDING}
{SHOW items FROM HIGHEST TO LOWEST priority}
```

## Snippets

### Simple greeting

```js
const loom = new Loom(`
    [greet name day timeOfDay] { Good {timeOfDay}, {name}! How are you on this fine {day}? }
`)
```

```
{greet "John" "Monday" "morning"}
// → "Good morning, John! How are you on this fine Monday?"
```

### Snippet with Plain body

Expression-body snippets can use Plain verbs directly:

```js
const loom = new Loom(`
    [countRefereed pubs] ( COUNT OF pubs WHERE refereed )
    [recent pubs]        ( SHOW pubs.title WHERE year > 2020 )
`)
```

```
{countRefereed publications}
// → 2

{recent publications}
// → "New, Mid"    (titles where year > 2020)
```

### Snippet with flags and variadic args

Using `$0` as the first parameter, a snippet receives the flags object:

```js
const loom = new Loom(`
    [fancy $0 title ...args] { Options: {# $0} Title: {title} Var args: {args} }
`)
```

```
{fancy -date -type=test "The Great Gatsby" "a" "b" "c"}
// → "Options: {"date":true,"type":"test"} Title: The Great Gatsby Var args: ["a","b","c"]"
```

### Expression snippet

A snippet defined with `( … )` is a pure expression:

```js
const loom = new Loom(`
    [xor a b] (& (| a b) (! (& a b)))
`)
```

```
{xor true false}    // → true
{xor true true}     // → false
```

### Composing snippets

```js
const loom = new Loom(`
    [fullName first last]      { {first} {last} }
    [greet who]                { Hello, {who}! }
    [greetFull first last]     { {greet (fullName first last)} }
`)
```

```
{greetFull "Diego" "Macrini"}
// → "Hello, Diego Macrini!"
```

### Passing a Plain sub-expression into a snippet

```js
const loom = new Loom('[bold text] { <b>{text}</b> }')
```

```
{bold (SHOW price AS currency USD)}
// → "<b>…formatted price…</b>"
```

The inner `SHOW price AS currency USD` is evaluated and passed to `bold` as a single argument.

## Custom JavaScript functions

```js
const loom = new Loom({}, {
    uppercase: (flags, value) => String(value).toUpperCase(),
    daysSince: (flags, date) => {
        const diff = Date.now() - new Date(date).getTime()
        return Math.floor(diff / (1000 * 60 * 60 * 24))
    },
})
```

```
{uppercase "hello world"}       // → "HELLO WORLD"
{daysSince "2024-01-01"}        // → (some number)
```

Custom functions can use the list-context variables inside their implementation:

```js
const loom = new Loom({}, {
    runningTotal: function (flags, amount) {
        if (this._index === 0) return amount
        return this._items[this._index - 1].runningTotal + amount
    },
})
```

Each call gets the current `_index` and full `_items` array when invoked on list items.

## Mixing forms

### Compact inside Plain

A nested `{…}` inside a Plain expression passes through as Compact form:

```
{SHOW {+? 'Dr. ' title} WITH LABEL 'Name'}
```

The inner `+? 'Dr. ' title` is Compact — "conditional join 'Dr. ' with title" — and the outer `SHOW … WITH LABEL` wraps it with a label.

### Placeholder-level mix

Each `{…}` is parsed independently, so you can pick whichever form reads better per placeholder:

```
{SHOW member.name}                           ← Plain
{+? 'Dr. ' member.title}                     ← Compact (conditional join)
{TOTAL OF grants.amount AS currency USD}     ← Plain
{# -date=y (>> -desc publications.date)}     ← Compact
```

## Advanced: matrix operations

```
{# -json (^ -sz=3 "a" "b")}
// → [["a","b"],["a","b"],["a","b"]]    (3 rows of ["a","b"])

{# -json (^ -sz=4 [1 2 3] [4 5 6])}
// → [[1,4],[2,5],[3,6],[null,null]]    (zip with padding)

{# -json (^ -sz=4 -t [1 2 3] [4 5 6])}
// → [[1,2,3,null],[4,5,6,null]]         (transposed)
```

## Advanced: selectors

```js
vars = {
    person: {
        id: 'A-20',
        info: {
            name: 'John',
            details: { age: 30, location: 'NY', 'special.name': 'Jack' },
        },
    },
}
```

```
{person.info.details.age}               // → 30
{person.info.details.special.name}      // → "Jack"   (dot in key works)
{. 'info.name' person}                  // → "John"
{. '1.id' [person person]}              // → "A-20"
{. 'info.name' person person}           // → ["John", "John"]
{. ['id' 'nonexistent' 'info.details.location'] person}
// → { id: "A-20", "info.details.location": "NY" }
```

## More

Additional cases — matrix operations, deep snippets, multi-list function composition — live in the test suite at `tests/engine.test.js` and `tests/plain/*.test.js`.
