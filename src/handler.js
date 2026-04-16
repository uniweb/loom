import { instantiateContent, instantiateRepeated } from './instantiate.js'
import Loom from './engine.js'

/**
 * Create a handlers object for a Loom-based Uniweb foundation.
 *
 * Returns `{ content }` — a content handler that reads the `source`
 * frontmatter param (configurable) to decide between simple
 * instantiation and the split-iterate-reassemble repeat pattern.
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
 * // With custom Loom instance and param name
 * import { Loom, createLoomHandlers } from '@uniweb/loom'
 *
 * const loom = new Loom(snippets, customFunctions)
 *
 * export default {
 *   handlers: createLoomHandlers({
 *     vars: (data) => data?.profile?.[0],
 *     engine: loom,
 *     sourceParam: 'iterate',
 *   }),
 * }
 */
export function createLoomHandlers(options = {}) {
  const {
    vars: getVars,
    engine = new Loom(),
    sourceParam = 'source',
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
      return instantiateRepeated(doc, engine, v, source)
    },
  }
}
