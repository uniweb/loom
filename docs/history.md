# Loom — Origin and History

Loom didn't start out as a general-purpose library. It was extracted in 2026 from an internal language that had been in production use for years under the codename **unilang**. This document is the story of how unilang became Loom, and what design decisions came from where.

## The original problem

Around 2018, a team working on academic CMS tooling for university research offices had a specific problem. Faculty CVs contained hundreds of fields spread across dozens of sections — publications, funding, teaching, supervision, addresses, affiliations — and each university wanted its reports formatted differently. A one-off component for every layout wasn't maintainable.

What the team needed was a way to let the reporting template author — usually a research office staff member, not a developer — describe "I want this field here, formatted this way, but skip the line if that field is missing, and sort these by date, and group those by source." The result had to be exactly right, down to whether there was a trailing period or a dangling parenthesis when data was missing.

Existing template languages (Handlebars, Mustache, Liquid, EJS) were built for HTML output. They were great at "loop through this list, render each item." They were bad at "format this date range, drop the whole clause if either end is empty, and localize the field label." Every small data operation required escaping into JavaScript, which broke the "non-developers can edit templates" goal.

So the team built their own language. It had to be:

1. **Short enough to fit inline.** A single placeholder should be able to express a date range, a currency amount, or a labeled field — without needing to split out helper functions.
2. **Expression-first, not string-first.** Other template engines treat strings as the primary output and escape into expressions reluctantly. unilang inverted that: expressions were the core, and strings were what happened when you concatenated them.
3. **List-aware by default.** Operating on a list of values should be as easy as operating on a single value. Most functions should "just work" when given a list, returning a list of results.
4. **Graceful with missing data.** Missing fields should quietly drop their enclosing clauses, not produce broken grammar or raise exceptions.

Polish notation was chosen because it allowed function names to be symbolic (`+`, `#`, `>>`, `?`) without ambiguity — there's never a question of operator precedence because there's no infix. A short symbolic name like `+?` could mean "conditional join" without conflicting with anything. And because every call is `(function args...)`, deeply nested operations can be read without needing to check which identifier is a function vs a variable.

## The name "unilang"

"unilang" is short for "universal language" — the idea being that it should work across all the report formats a university might need. It never really was "universal" (it was designed for academic reports and showed it), but the name stuck inside the codebase.

## What got built

Over several years, the internal team built up:

- A core evaluator with ~80 built-in functions across 9 categories (accessors, creators, filters, mappers, switchers, transformers, collectors, joiners, sorters)
- A tokenizer that handled nested function calls, quoted strings (single/double/backtick, including curly Unicode quotes), lists, maps, and option flags
- A snippet system — users could define reusable named functions inline in a single string, with positional or variadic arguments
- A rich formatter function `#` that handled dates, numbers, currencies, phone numbers, addresses, emails, JSON, lists, ranges, labels, headings, text decorations, and more — all controlled via flags
- A custom-function registration API so developers could add domain-specific helpers
- A test suite of hundreds of cases covering edge behavior

The language was deployed at three Canadian universities (UNB, SMU, UOttawa) through a CMS called Uniweb, where it was used by research office staff to author CV and funding report templates.

## Why it never went public

The team behind unilang was small — one architect and a handful of collaborators. The documentation and tests grew organically and diverged from each other over time. Several versions of a natural-language layer called **PlainScript** were prototyped but never converged on a final design. The engine was solid; the surface area around it was messy.

When the larger Uniweb project needed the expression engine for a new document-generation effort in early 2026, the team looked at what unilang already did, confirmed the architecture still made sense, and extracted the engine as a standalone package.

## What changed in the extraction

The extracted version (`@uniweb/loom`) removes all Uniweb-specific concerns:

- **No citation integration.** The original engine had a stub `Citation` class that was part of the `#` formatter. It smuggled JSON through a `<u-cite>` HTML tag expecting a downstream interpreter that never existed in the modern stack. Citation formatting is now considered a consumer concern — Loom doesn't know about citations at all, and consumers who need them can use libraries like [`citestyle`](https://github.com/uniweb/citestyle) at the component level.
- **No CMS integration.** The original engine assumed a Uniweb CMS data model — fields like `block.input.data`, profile models, section definitions. Loom is data-agnostic: you pass in a variable resolver function, and that's the only coupling.
- **No Uniweb globals.** References to `uniweb.language()`, `uniweb.log`, and similar globals were replaced with standard JS (`Intl.NumberFormat`, a configurable locale setter).
- **Pure JavaScript, no dependencies.** The extracted version has zero runtime dependencies and works in Node and the browser.

What didn't change:

- The syntax — everything that worked in unilang works in Loom
- The function library — all ~80 functions were ported with no semantic changes
- The snippet system
- The `_items` / `_index` / `_count` context variables for custom functions
- The error codes and error message format

## The sibling package: Press

At the same time Loom was extracted, a related package called **`@uniweb/press`** was extracted from the same ancestor codebase. Press is a React library for generating downloadable documents (Word, Excel, PDF) from React components. The connection to Loom: Press provides a helper called `instantiateContent` that walks a content tree and resolves placeholders through a Loom instance before the document is rendered. So a report author can write Markdown content with Loom placeholders (`{family_name}`, `{", " city province country}`), and Press's foundation handlers run the content through Loom before components render it — giving you dynamic data in an otherwise-static document pipeline.

Press and Loom are separable: you can use Loom on its own for any text-generation task, and you can use Press with any other expression engine (or none). But together, they reproduce the pattern that made the original academic-reporting use case work.

## What's next

The most interesting unfinished piece is **PlainScript** — a natural-language layer that compiles English-like phrasings (`{SHOW user.name AS 'label'}`, `{FOR EACH publication IN publications SHOW publication.title JOINED BY ', '}`) into Loom's Polish-notation expressions. The goal is to make the language approachable to staff who would rather write "show each publication title joined by commas" than memorize that `{+: ', ' publications.title}` does the same thing.

PlainScript exists in the original codebase as a sketch — a tokenizer, parser, and translator that work for a basic subset but never converged on a final syntax across multiple iterations. The plan is to survey the existing material, propose a unified syntax, and ship PlainScript as an optional mode on the `Loom` class. See [`kb/plans/plainscript.md`](../../../kb/plans/plainscript.md) in the Uniweb workspace for the design document.
