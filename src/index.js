/**
 * @uniweb/loom — an expression language for weaving data into text.
 *
 * Loom is one language with two surface forms:
 *
 *   - Plain form (default): natural-language syntax that reads like a
 *     description of what you want.
 *
 *       {SHOW publications.title WHERE refereed SORTED BY date DESCENDING}
 *
 *   - Compact form: symbolic Polish-notation for power users. Equivalent
 *     to Plain form; you can mix the two freely in the same template.
 *
 *       {+: ', ' (>> -desc -by=date (? refereed publications.title))}
 *
 * Usage:
 *
 *   import { Loom } from '@uniweb/loom'
 *
 *   const loom = new Loom()
 *   loom.render("Hello {first_name}!", { first_name: 'Diego' })
 *   // → "Hello Diego!"
 *
 *   loom.evaluateText("COUNT OF publications WHERE refereed", profile)
 *   // → 2
 *
 * For the raw symbolic engine without the Plain parser, import LoomCore
 * from `@uniweb/loom/core`.
 *
 * Pure JavaScript. Zero runtime dependencies. Works in Node and the browser.
 */

export { default as Loom } from './engine.js'
export { instantiateContent, instantiateRepeated } from './instantiate.js'
export { splitAtDividers } from './split.js'
export { findEnclosures, parseSnippets } from './core/tokenizer.js'
export { setLocale, getProperty } from './core/functions.js'
