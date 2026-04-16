import { instantiateContent, instantiateRepeated } from './instantiate.js'
import { getProperty } from './core/functions.js'
import Loom from './engine.js'

/**
 * Create a handlers object for a Loom-based Uniweb foundation.
 *
 * Returns `{ content }` — a content handler that reads the `source`
 * and `where` frontmatter params (configurable) to decide between
 * simple instantiation and the split-iterate-reassemble repeat
 * pattern, optionally filtering the source array first.
 *
 * @param {Object} options
 * @param {Function} options.vars - Required. Extracts the Loom variable
 *   namespace from the assembled data object. Receives `(data)` where
 *   data is `block.parsedContent.data`; returns the plain object that
 *   Loom expressions resolve against. Example: `(data) => data.profile?.[0]`
 * @param {Object} [options.engine] - Loom instance (or any { render }).
 *   Defaults to `new Loom()`.
 * @param {string|null} [options.sourceParam='source'] - Frontmatter
 *   field that names the data array to iterate. When the section has
 *   `source: education`, the handler calls `instantiateRepeated` with
 *   'education' as the field. Set to `null` to disable the repeat
 *   pattern (always simple instantiation).
 * @param {string|null} [options.whereParam='where'] - Frontmatter
 *   field containing a Loom filter expression. When set, the source
 *   array is filtered before iteration — only items where the
 *   expression evaluates to truthy are included. Expressions use
 *   Plain form: `type = 'book'`, `year > '1870'`,
 *   `type = 'book' AND refereed`, or a bare truthy check like
 *   `refereed`. Set to `null` to disable.
 * @returns {{ content: Function }} Handlers object for foundation.js
 *
 * @example
 * // Minimal — most foundations need just this
 * import { createLoomHandlers } from '@uniweb/loom'
 *
 * export default {
 *   handlers: createLoomHandlers({
 *     vars: (data) => data?.profile?.[0],
 *   }),
 * }
 *
 * @example
 * // Section frontmatter with where filtering
 * // ---
 * // type: PublicationList
 * // source: publications
 * // where: "type = 'book'"
 * // ---
 */
export function createLoomHandlers(options = {}) {
  const {
    vars: getVars,
    engine = new Loom(),
    sourceParam = 'source',
    whereParam = 'where',
  } = options

  if (typeof getVars !== 'function') {
    throw new Error('createLoomHandlers requires a vars function')
  }

  return {
    content: (data, block) => {
      const v = getVars(data)
      if (!v) return null

      const doc = block.rawContent?.doc ?? block.rawContent
      const source = sourceParam ? block.properties?.[sourceParam] : null

      if (!source) return instantiateContent(doc, engine, v)

      // Apply where filter if present
      const whereExpr = whereParam ? block.properties?.[whereParam] : null
      if (whereExpr) {
        const items = getProperty(source, v)
        if (Array.isArray(items)) {
          const filtered = items.filter(item =>
            engine.evaluateText(whereExpr, { ...v, ...item })
          )
          return instantiateRepeated(doc, engine, { ...v, [source]: filtered }, source)
        }
      }

      return instantiateRepeated(doc, engine, v, source)
    },
  }
}
