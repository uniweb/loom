import { splitAtDividers } from './split.js'
import { getProperty } from './core/functions.js'

/**
 * Walk a ProseMirror-style content tree and instantiate {placeholders}
 * in its text and in where its links lead, using a template engine.
 *
 * @param {Object|Array} content - ProseMirror document or content array.
 *   Shape: { type: 'doc', content: [...] } or an array of nodes.
 * @param {Object} engine - A Loom instance (or any engine with a render method).
 * @param {Object|Function} vars - The variables, passed to engine.render as
 *   given. A plain object resolves dot paths into its nested values; a
 *   `(key) => value` function is called with the whole dotted key.
 * @returns {Object|Array} The content tree with all text nodes instantiated.
 */
export function instantiateContent(content, engine, vars) {
    if (Array.isArray(content)) {
        return content.map((node) => instantiateNode(node, engine, vars))
    }

    if (!content || typeof content !== 'object') return content

    const innerContent = content.content
    if (!Array.isArray(innerContent)) return content

    return {
        ...content,
        content: innerContent.map((node) => instantiateNode(node, engine, vars)),
    }
}

/**
 * Where a link or button leads, instantiated. The semantic parser checks the
 * result like any other link, so a value can't make a link run anything.
 */
function instantiateHref(holder, engine, vars) {
    const href = holder?.attrs?.href
    if (typeof href !== 'string' || !href.includes('{')) return holder
    return { ...holder, attrs: { ...holder.attrs, href: engine.render(href, vars) } }
}

/**
 * Instantiate a single ProseMirror node. Text nodes have their `text`
 * field run through engine.render(), and a link on the text its `href`, so
 * `[{email}](mailto:{email})` leads where it says. Other nodes recurse into
 * children.
 */
function instantiateNode(node, engine, vars) {
    if (!node || typeof node !== 'object') return node

    const { type, content, text } = node

    if (type === 'text' && typeof text === 'string') {
        const instantiated = { ...node, text: engine.render(text, vars) }
        if (Array.isArray(node.marks)) {
            instantiated.marks = node.marks.map((mark) => instantiateHref(mark, engine, vars))
        }
        return instantiated
    }

    if (content && Array.isArray(content)) {
        return {
            ...instantiateHref(node, engine, vars),
            content: content.map((child) => instantiateNode(child, engine, vars)),
        }
    }

    return instantiateHref(node, engine, vars)
}

/**
 * Split a ProseMirror document at dividers and instantiate the body
 * segment once per item in a data array — the repeat pattern.
 *
 * The document is split into segments by `---` dividers:
 *   - First segment (header): instantiated once against `vars`.
 *   - Middle segments (body): instantiated once per item. Each item's
 *     fields are merged into the vars namespace: `{ ...vars, ...item }`.
 *   - Last segment (footer, only if ≥3 segments): instantiated once
 *     against `vars`, preceded by a divider node so the semantic
 *     parser can detect the boundary.
 *
 * Falls back to plain `instantiateContent` when:
 *   - The resolved field is not an array or is empty.
 *   - The document has no dividers (single segment).
 *
 * @param {Object} doc - ProseMirror document. Accepts both
 *   `{ type: 'doc', content: [...] }` and the content-API envelope
 *   `{ doc: { type: 'doc', ... } }` — auto-unwraps.
 * @param {Object} engine - A Loom instance (or any { render(text, vars) }).
 * @param {Object} vars - Plain object — the full data namespace.
 * @param {string} field - Dot-path to the array field to iterate over.
 * @returns {Object} ProseMirror document with all segments instantiated.
 */
export function instantiateRepeated(doc, engine, vars, field) {
  const unwrapped = doc?.doc ?? doc
  if (!unwrapped?.content) return instantiateContent(unwrapped, engine, vars)

  const items = getProperty(field, vars)
  const segments = splitAtDividers(unwrapped.content)

  if (!Array.isArray(items) || items.length === 0 || segments.length < 2) {
    return instantiateContent(unwrapped, engine, vars)
  }

  const result = []

  // Header — first segment, instantiated once against full vars
  if (segments[0].length > 0) {
    const resolved = instantiateContent(
      { type: 'doc', content: segments[0] },
      engine,
      vars
    )
    result.push(...(resolved.content || []))
  }

  // Body — middle segments (between first and last divider)
  const bodySegments = segments.length >= 3
    ? segments.slice(1, -1)
    : [segments[1]]
  const bodyNodes = bodySegments.reduce((acc, seg, i) => {
    if (i > 0) acc.push({ type: 'divider' })
    acc.push(...seg)
    return acc
  }, [])

  for (const item of items) {
    const resolved = instantiateContent(
      { type: 'doc', content: bodyNodes },
      engine,
      { ...vars, ...item }
    )
    result.push(...(resolved.content || []))
  }

  // Footer — last segment (only if ≥3 segments)
  if (segments.length >= 3) {
    const footer = segments[segments.length - 1]
    if (footer.length > 0) {
      result.push({ type: 'divider' })
      const resolved = instantiateContent(
        { type: 'doc', content: footer },
        engine,
        vars
      )
      result.push(...(resolved.content || []))
    }
  }

  return { type: 'doc', content: result }
}
