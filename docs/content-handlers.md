# Content Handlers

A content handler is a transform layer declared in a Uniweb foundation's `foundation.js` that runs between data assembly and the component. The framework calls it once per block, passing the assembled data and the block object. The handler can return transformed ProseMirror content — resolving Loom `{placeholders}` against live data, repeating sections per data item, filtering collections — before the framework parses the result and hands it to the component.

## The quick way: createLoomHandlers

Most foundations need three lines:

```js
import { createLoomHandlers } from '@uniweb/loom'

export default {
  handlers: createLoomHandlers({
    vars: (data) => data?.profile?.[0],
  }),
}
```

The `vars` function extracts the Loom variable namespace from the block's assembled data. It receives the full `data` object and returns the plain object that Loom expressions resolve against.

The returned handler reads the `source` and `where` frontmatter params to decide what to do:

- **No `source`**: simple substitution — every `{placeholder}` in the markdown is resolved against the vars object.
- **With `source`**: the markdown is split at `---` dividers and the body is repeated per item in the named data array.
- **With `where`**: the source array is filtered before iteration.

## The source convention

Sections declare `source: fieldName` in frontmatter to name the data array to iterate. A `---` divider in the markdown splits the content into regions:

- **Header** (before the first divider) — rendered once against the full vars.
- **Body** (between dividers) — repeated once per item. Each item's fields are merged into the vars namespace.
- **Footer** (after the second divider) — rendered once after all items.

### Three-part example (header + body + footer)

```markdown
---
type: CvEntry
source: education
---
# Education
{COUNT OF education} degrees earned.
---
## {degree}
{institution} — {field} ({start}–{end})
---
Total: {COUNT OF education} entries.
```

The header renders once and can use aggregate expressions like `{COUNT OF education}`. The body repeats per education item — each item's fields (`degree`, `institution`, etc.) are directly available. The footer renders once after all items.

### Two-part example (header + body, no footer)

```markdown
---
type: PublicationList
source: publications
---
# Publications ({COUNT OF publications})
---
**{title}** ({year}) — {journal}
```

A single `---` divider means no footer. The header renders once; the body repeats per publication.

## The where convention

Add `where` to frontmatter to filter the source array before iteration. The expression is evaluated per item — only truthy matches are included:

```markdown
---
type: PublicationList
source: publications
where: "type = 'book'"
---
# Books ({COUNT OF publications})
---
**{title}** ({year})
```

`where` uses Plain-form Loom expressions:

| Expression | Meaning |
|---|---|
| `type = 'book'` | Equality |
| `year > 1870` | Comparison |
| `refereed` | Truthy check (field is present and non-empty) |
| `type = 'book' AND refereed` | Boolean combination |

Aggregate expressions in the header (like `{COUNT OF publications}`) reflect the **filtered** set, because the handler replaces the source array with the filtered result before instantiation.

## Options reference

| Option | Type | Default | Description |
|---|---|---|---|
| `vars` | `(data) => object` | *required* | Extracts the Loom variable namespace from assembled data |
| `engine` | Loom instance | `new Loom()` | Custom Loom instance (with snippets or custom functions) |
| `sourceParam` | `string \| null` | `'source'` | Frontmatter field for the data array to iterate. `null` disables. |
| `whereParam` | `string \| null` | `'where'` | Frontmatter field for a Loom filter expression. `null` disables. |

Pass a custom `engine` when you need snippets or custom functions:

```js
import { Loom, createLoomHandlers } from '@uniweb/loom'

const loom = new Loom(`
  [fullName first last] { {first} {last} }
`)

export default {
  handlers: createLoomHandlers({
    vars: (data) => data?.profile?.[0],
    engine: loom,
  }),
}
```

## Writing a custom handler

When `createLoomHandlers` doesn't cover your case, use `instantiateContent` and `instantiateRepeated` directly. This gives you full control over data preparation, multiple collections, and conditional logic.

Example — merging data from two collections before instantiation:

```js
import { Loom, instantiateContent, instantiateRepeated } from '@uniweb/loom'

const loom = new Loom()

export default {
  handlers: {
    content: (data, block) => {
      const profile = data?.profile?.[0]
      const org = data?.organization?.[0]
      if (!profile) return null

      // Merge two data sources into one vars namespace
      const vars = { ...profile, org_name: org?.name, org_city: org?.city }

      const doc = block.rawContent?.doc ?? block.rawContent
      const source = block.properties?.source

      if (!source) return instantiateContent(doc, loom, vars)
      return instantiateRepeated(doc, loom, vars, source)
    },
  },
}
```

Two things to watch for when writing custom handlers:

**Always pass vars as a plain object.** `instantiateContent` forwards vars directly to `Loom.render`. When vars is an object, Loom uses its internal dot-path resolver — so `{publications.title}`, `{funding.0.amount}`, and `{COUNT OF publications WHERE refereed}` all work. If you pass a function, Loom calls it verbatim with the full dotted key as a single string, which is almost never what you want.

**Unwrap the ProseMirror envelope.** `block.rawContent` may arrive wrapped (`{ doc: { type: 'doc', ... } }`) or unwrapped (`{ type: 'doc', ... }`). Always unwrap: `block.rawContent?.doc ?? block.rawContent`. The `instantiateRepeated` function handles this automatically, but `instantiateContent` does not.

## The three handler hooks

The framework supports three handler hooks in `foundation.js`:

```js
export default {
  handlers: {
    data:    (data, block) => { /* ... */ },
    content: (data, block) => { /* ... */ },
    props:   (content, params, block) => { /* ... */ },
  },
}
```

| Handler | Receives | Returns | Purpose |
|---|---|---|---|
| `data` | `(data, block)` | New data object, or null | Filter, reshape, or augment assembled data |
| `content` | `(data, block)` | ProseMirror document, or null | Transform raw content (Loom instantiation) |
| `props` | `(content, params, block)` | `{ content, params }`, or null | Post-process the final shape before the component sees it |

All three are optional and error-isolated. `createLoomHandlers` returns a `content` handler. You can add `data` or `props` handlers alongside it:

```js
import { createLoomHandlers } from '@uniweb/loom'

export default {
  handlers: {
    ...createLoomHandlers({
      vars: (data) => data?.profile?.[0],
    }),
    props: (content, params, block) => {
      // Post-process after Loom instantiation + parsing
      return { content, params: { ...params, itemCount: content.items.length } }
    },
  },
}
```

See `AGENTS.md` (the project guide shipped by `uniweb create`) for the full handler pipeline documentation.

## Utilities reference

These functions are exported from `@uniweb/loom`:

| Function | Signature | Description |
|---|---|---|
| `instantiateContent` | `(content, engine, vars)` | Walk a ProseMirror tree and resolve `{placeholders}` in text nodes. Returns a new tree (immutable). |
| `instantiateRepeated` | `(doc, engine, vars, field)` | Split at dividers, instantiate header once, repeat body per item, instantiate footer once. Falls back to `instantiateContent` when the field is not an array or there are no dividers. |
| `splitAtDividers` | `(nodes)` | Split a ProseMirror content array at divider nodes. Returns an array of segments. |
| `getProperty` | `(path, value)` | Dot-path resolver. Navigates nested objects, arrays, and Maps. Maps automatically when the path crosses an array of objects. Note: parameter order is path first, data second. |

See the [README](../README.md#instantiating-structured-documents) for detailed usage of each function.
