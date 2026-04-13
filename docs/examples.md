# Loom Examples

A curated collection of worked examples organized by task. All examples are tested — they come from the project's test suite and produce the indicated output.

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
{users.0.name} is {users.0.age} years old and likes to eat {users.0.favoriteFruit},
while {users.1.name} is {users.1.age} years old and likes to eat {users.1.favoriteFruit}.
```

Result:

```
John is 25 years old and likes to eat apple, while Jane is 30 years old and likes to eat banana.
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

Default formatting turns lists into comma-separated text:

```
Types: {publications.type}
```

Result:

```
Types: journal, book, journal
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

### Simple join with separator

```js
vars = { city: 'Fredericton', province: 'NB', country: 'Canada' }
```

```
{', ' city province country}
// → "Fredericton, NB, Canada"
```

### Join drops empty values

```js
vars = { city: 'Fredericton', province: '', country: 'Canada' }
```

```
{', ' city province country}
// → "Fredericton, Canada"
```

The empty `province` is dropped — no double comma.

### Conditional join

`+?` joins only if **all** referenced values are truthy. If any are empty, the whole expression is empty:

```
{+? 'Dr. ' title}
// title = "Smith"  → "Dr. Smith"
// title = ""       → ""
```

### Multi-part conditional join

```
{+? '(' (', ' affiliation department) ')'}
```

If either `affiliation` or `department` is empty, nothing is produced (no dangling parentheses). If both are present:

```
{+? '(' (', ' "Engineering" "UNB") ')'}
// → "(Engineering, UNB)"
```

## Math and aggregation

### Basic arithmetic

```
{+ 2 3}           // → 5
{+ a b}           // → (a + b)
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

### Aggregations

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
{++ grants.amount}                    // → 500000
{# -currency=usd (++ grants.amount)}  // → "$500,000.00"

{++!! grants.amount}                  // → 3   (count of truthy values)

{/ (++ grants.amount) (++!! grants.amount)}
// → 166666.66...   (average)
```

### Report-style sentence

```
From {startYear} to {endYear}, {name} received a total funding of
{# -currency=usd (++ grants.amount)} from {++!! grants} grants,
with an average funding per grant of
{# -currency=usd (/ (++ grants.amount) (++!! grants))}.
```

Result:

```
From 2020 to 2022, John Doe received a total funding of $500,000.00 from 3 grants,
with an average funding per grant of $166,666.67.
```

## Formatting

### Dates

```js
vars = { start_date: '2000/01/15' }
```

```
{# -date=full start_date}    // "Saturday, January 15, 2000"
{# -date=long start_date}    // "January 15, 2000"
{# -date=medium start_date}  // "Jan 15, 2000"
{# -date=short start_date}   // "1/15/00"
{# -date=y start_date}       // "2000"
{# -date=m start_date}       // "January"
{# -date=mm start_date}      // "01"
{# -date=ym start_date}      // "January 2000"
{# -date=ymm start_date}     // "01/2000"
```

### Date ranges

```js
vars = { start_date: '2000/01/02', end_date: '' }
```

```
{# (~ start_date end_date)}
// → "Jan 2, 2000 – Present"
```

If the end date is empty, the range formatter shows "Present". Full symmetry with `start_date` being empty:

```js
vars = { start_date: '', end_date: '2010/12/31' }
```

```
{# (~ start_date end_date)}
// → "Until Dec 31, 2010"
```

### Currency and numbers

```js
vars = { price: 1200 }
```

```
{# -number price}         // "1,200"
{# -currency=usd price}   // "$1,200.00"
{# -currency=eur price}   // "€1,200.00"
```

### Phone numbers

```js
vars = { phone: '1-613-444-5555' }
```

```
{# -phone phone}
// → "+1 (613) 444-5555"
```

### Labels

```js
vars = {
    name: 'John Smith',
    '@name': 'Full Name',     // the localized label for `name`
}
```

```
{': ' (# -label @name) name}
// → "Full Name: John Smith"
```

## Conditionals

### Simple if-else

```
{? is_adult "Adult" "Minor"}
{? (> age 18) "Adult" "Minor"}
{? has_discount (* price 0.9) price}
```

### Elide on false

Omit the "else" value when you want nothing on a false condition:

```
{? is_premium "⭐ Premium"}
// is_premium = true  → "⭐ Premium"
// is_premium = false → ""
```

### Multi-branch

```
{??? (> age 65) (> age 18) (> age 13) "Senior" "Adult" "Teen" "Child"}
// age = 70 → "Senior"
// age = 30 → "Adult"
// age = 15 → "Teen"
// age = 5  → "Child"
```

### Conditions as lists

```
{? [(> age 18) (> age 25)] "Adult" "Youth"}
// age = 20 → ["Adult", "Youth"]     (first is Adult, second is Youth since age < 25)
```

## Filtering and counting

### Equality filters

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
{= publications.type "book"}
// → [false, true, false, false]

{? (= publications.type "book") 'long' 'short'}
// → ["short", "long", "short", "short"]
```

### Counting matches

```
In {year}, {name} published {++!! publications.refereed} refereed papers
and {++!! (= publications.type "conference")} conference papers.
```

### Conditional counts inside sentences

```
{name} has {++!! publications.refereed} refereed publications
and {++!! (! publications.refereed)} non-refereed ones.
```

## Sorting

### Basic sort

```
{>> "b" "a" "c"}        // → ["a", "b", "c"]
{>> 2 1 3}              // → [1, 2, 3]
{>> -desc "a" "b" "c"}  // → ["c", "b", "a"]
{>> -desc 3 2 1}        // → [3, 2, 1]
```

### Sort as dates

```
{>> -date ["2001/02/10"] ["2001/02/1"] ["July 1, 2000"]}
// → [["July 1, 2000"], ["2001/02/1"], ["2001/02/10"]]
```

### Sort maps by first property

```
{>> {name: "b"} {name: "a"} {name: "c"}}
// → [{name: "a"}, {name: "b"}, {name: "c"}]
```

## Snippets

### Simple greeting

```js
const loom = new Loom(`
    [greet name day timeOfDay] { Good {timeOfDay}, {name}! How are you doing on this fine {day}? }
`)
```

```
{greet "John" "Monday" "morning"}
// → "Good morning, John! How are you doing on this fine Monday?"
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
// → "Options: {\"date\":true,\"type\":\"test\"} Title: The Great Gatsby Var args: [\"a\",\"b\",\"c\"]"
```

### Expression snippets

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

Custom functions can use context variables inside their implementation:

```js
const loom = new Loom({}, {
    runningTotal: function (flags, amount) {
        if (this._index === 0) return amount
        return this._items[this._index - 1].runningTotal + amount
    },
})
```

When called on list items, each call gets the current `_index` and full `_items` array.

## Advanced: matrix operations

```
{# -json (^ -sz=3 "a" "b")}
// → [["a","b"],["a","b"],["a","b"]]    (3 rows of ["a", "b"])

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

These examples come from the project's Vitest suite in `tests/engine.test.js`. For additional cases — matrix operations, deep snippets, multi-list function composition — see the test file directly or the design docs at [`kb/plans/loom-docs`](../../../kb/plans/) in the Uniweb workspace repository.
