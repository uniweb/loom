import { instantiateContent, instantiateRepeated } from './instantiate.js'
import { getProperty } from './core/functions.js'
import Loom from './engine.js'

/**
 * Create a handlers object for a Loom-based Uniweb foundation.
 *
 * Returns `{ content }` — a content handler that reads `source`,
 * `where`, `sort_by`, and `order` frontmatter params (each
 * configurable) to decide between simple instantiation and the
 * split-iterate-reassemble repeat pattern, optionally filtering the
 * source array and/or ordering it before iteration.
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
 *   Plain form: `type = 'book'`, `year > 1870`,
 *   `type = 'book' AND refereed`, or a bare truthy check like
 *   `refereed`. Set to `null` to disable.
 * @param {string|null} [options.sortByParam='sort_by'] - Frontmatter
 *   field naming a property on each iterated record to sort by. When
 *   set and present in frontmatter, items are sorted before iteration.
 *   Date-shaped strings (`YYYY`, `YYYY/M`, `YYYY-M-D`, etc.) compare
 *   chronologically; numbers compare numerically; everything else
 *   falls back to a `localeCompare` string sort. Set to `null` to
 *   disable.
 * @param {string|null} [options.orderParam='order'] - Frontmatter
 *   field for the sort direction. Accepts `asc` (default) or `desc`,
 *   case-insensitive. Ignored when `sort_by` is unset. Set to `null`
 *   to disable (sort always ascending when sort_by is present).
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
 * // Section frontmatter with where filtering + sort
 * // ---
 * // type: PublicationList
 * // source: publications
 * // where: "type = 'book'"
 * // sort_by: year
 * // order: desc
 * // ---
 */
export function createLoomHandlers(options = {}) {
  const {
    vars: getVars,
    engine = new Loom(),
    sourceParam = 'source',
    whereParam = 'where',
    sortByParam = 'sort_by',
    orderParam = 'order',
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

      let items = getProperty(source, v)

      if (Array.isArray(items)) {
        // Where filter
        const whereExpr = whereParam ? block.properties?.[whereParam] : null
        if (whereExpr) {
          items = items.filter(item =>
            engine.evaluateText(whereExpr, { ...v, ...item })
          )
        }

        // Sort by field
        const sortBy = sortByParam ? block.properties?.[sortByParam] : null
        if (sortBy) {
          const orderRaw = orderParam ? block.properties?.[orderParam] : null
          const dir = String(orderRaw || 'asc').toLowerCase() === 'desc' ? -1 : 1
          items = [...items].sort((a, b) => dir * compareItemFields(a, b, sortBy))
        }

        if (whereExpr || sortBy) {
          return instantiateRepeated(doc, engine, { ...v, [source]: items }, source)
        }
      }

      return instantiateRepeated(doc, engine, v, source)
    },
  }
}

/**
 * Compare two records by a named field. Tries date-shaped strings
 * first (so '2012/9' vs '2012/12' sorts chronologically rather than
 * lexically as '2012/12' < '2012/9'), then numbers, then strings.
 *
 * Records lacking a parseable value sort after records with one.
 */
function compareItemFields(a, b, field) {
  const av = a == null ? undefined : a[field]
  const bv = b == null ? undefined : b[field]

  const aDate = parseDateKey(av)
  const bDate = parseDateKey(bv)
  if (aDate != null && bDate != null) return aDate - bDate
  if (aDate != null) return -1
  if (bDate != null) return 1

  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1

  return String(av).localeCompare(String(bv))
}

function parseDateKey(v) {
  if (v == null) return null
  if (typeof v === 'number') return v * 10000
  if (typeof v !== 'string') return null
  const m = v.match(/^\s*(\d{4})(?:[\/-](\d{1,2}))?(?:[\/-](\d{1,2}))?/)
  if (!m) return null
  return (
    parseInt(m[1], 10) * 10000 +
    parseInt(m[2] || '0', 10) * 100 +
    parseInt(m[3] || '0', 10)
  )
}
