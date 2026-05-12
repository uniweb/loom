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
 *   set and present in frontmatter, the (already-filtered) items are
 *   sorted before iteration. The ordering is total and deterministic
 *   whatever the column holds: numbers and date-shaped strings (`2012`,
 *   `2012/9`, `2012-09-30`, …) share one chronological/numeric scale,
 *   so a column mixing bare years and `YYYY-MM` strings interleaves
 *   correctly; other strings compare with `localeCompare`; records
 *   with no value for the field (`null`, `undefined`, or a blank
 *   string) always sort last, in both directions. The sort is stable —
 *   equal keys keep source order. Set to `null` to disable.
 * @param {string|null} [options.orderParam='order'] - Frontmatter
 *   field for the sort direction. Accepts `asc` (default) or `desc`,
 *   case-insensitive; reverses only the ordering among records that
 *   have a value (missing values stay last either way). Ignored when
 *   `sort_by` is unset. Set to `null` to disable (always ascending
 *   when `sort_by` is present).
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
          const descending =
            String(orderRaw ?? '').trim().toLowerCase() === 'desc'
          items = sortRecordsByField(items, sortBy, descending ? -1 : 1)
        }

        if (whereExpr || sortBy) {
          return instantiateRepeated(doc, engine, { ...v, [source]: items }, source)
        }
      }

      return instantiateRepeated(doc, engine, v, source)
    },
  }
}

// ── Sorting iterated records ────────────────────────────────────────
//
// `sort_by:` orders the records a section iterates over. The comparator
// is built to be *total* and *direction-stable*: any column produces a
// well-defined order, and `order: desc` reverses only the ordering of
// records that actually have a value — "no value" is not a magnitude,
// so reversing the sort must never float blank records to the top.

/** Sort key tiers (ascending): scalars (numbers + date strings) before plain text. */
const SCALAR_TIER = 0
const TEXT_TIER = 1

// Multiplier that puts a bare year-as-number on the same scale as a
// parsed `YYYY[/-MM[/-DD]]` string: the number `2012` and the string
// `'2012'` both reduce to 20120000, so a column mixing the two forms
// interleaves chronologically. Harmless for non-year numbers — scaling
// by a positive constant preserves their numeric order.
const DATE_SCALE = 10000

/**
 * Return a new array of `records` ordered by each record's `field`.
 * `dir` is 1 for ascending, -1 for descending. The input is not mutated.
 * See the section comment above for the ordering rules.
 *
 * @param {Array} records
 * @param {string} field
 * @param {1 | -1} dir
 * @returns {Array}
 */
function sortRecordsByField(records, field, dir) {
  // Decorate–sort–undecorate: compute each key once, and carry the
  // original index so the result is stable independent of the engine's
  // sort stability.
  return records
    .map((record, index) => ({
      record,
      index,
      key: sortKeyForValue(record == null ? undefined : record[field]),
    }))
    .sort((a, b) => {
      // Records with no usable value sink to the end, in both
      // directions; among themselves they keep source order.
      if (a.key === null || b.key === null) {
        if (a.key === null && b.key === null) return a.index - b.index
        return a.key === null ? 1 : -1
      }
      // Scalars sort ahead of plain text (ascending); `dir` flips that.
      if (a.key.tier !== b.key.tier) return dir * (a.key.tier - b.key.tier)
      const cmp =
        a.key.tier === SCALAR_TIER
          ? a.key.value - b.key.value
          : String(a.key.value).localeCompare(String(b.key.value))
      return dir * cmp || a.index - b.index
    })
    .map((entry) => entry.record)
}

/**
 * Reduce a record's field value to a sort token `{ tier, value }`, or
 * `null` when the value is effectively absent (`null`, `undefined`, or
 * a blank string). Numbers and date-shaped strings land in the scalar
 * tier with a numeric `value`; any other string lands in the text tier
 * with the trimmed string as `value`; other types (boolean, object, …)
 * fall back to their string form in the text tier so the order stays
 * deterministic.
 *
 * @param {unknown} value
 * @returns {{ tier: number, value: number | string } | null}
 */
function sortKeyForValue(value) {
  if (value == null) return null

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { tier: SCALAR_TIER, value: value * DATE_SCALE }
      : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const dateKey = parseDateKey(trimmed)
    if (dateKey !== null) return { tier: SCALAR_TIER, value: dateKey }
    return { tier: TEXT_TIER, value: trimmed }
  }

  return { tier: TEXT_TIER, value: String(value) }
}

/**
 * Parse a date-shaped string into a comparable integer key
 * (`year * DATE_SCALE + month * 100 + day`), or `null` when the string
 * doesn't begin with a 4-digit year. Accepts `YYYY`, `YYYY/M`,
 * `YYYY-M`, `YYYY/M/D`, `YYYY-M-D` (1- or 2-digit month/day) and
 * ignores trailing text, so `'2012-09 (est.)'` still sorts as
 * September 2012.
 *
 * This is a deliberately small heuristic for the dates CV/report data
 * carries — not a general date parser. It reads *any* string starting
 * with four digits as a year (an 8-digit id like `'12345678'` parses
 * as the year 1234), so point `sort_by` at a real date string or a
 * number, not arbitrary digit-prefixed text.
 *
 * @param {string} str  already trimmed
 * @returns {number | null}
 */
function parseDateKey(str) {
  const m = /^(\d{4})(?:[/-](\d{1,2}))?(?:[/-](\d{1,2}))?/.exec(str)
  if (!m) return null
  return (
    parseInt(m[1], 10) * DATE_SCALE +
    parseInt(m[2] ?? '0', 10) * 100 +
    parseInt(m[3] ?? '0', 10)
  )
}
