/**
 * @uniweb/loom/core — the raw symbolic engine.
 *
 * This is the Polish-notation evaluator without the Plain natural-language
 * surface. Most users should import from `@uniweb/loom` instead — that
 * default export includes both Plain and Compact form with a single parser.
 *
 * Reach for `LoomCore` when you:
 *   - write only Compact form and want to skip the Plain parser for speed
 *   - need variable or custom function names that would otherwise shadow
 *     Plain-form keywords (SHOW, WHERE, COUNT, etc.)
 *   - are building tooling around the symbolic form and don't want the
 *     Plain translation layer in the way
 *
 *   import { LoomCore } from '@uniweb/loom/core'
 *
 *   const loom = new LoomCore()
 *   loom.render("{', ' city province}", { city: 'Montreal', province: 'QC' })
 *   // → 'Montreal, QC'
 */

export { default as LoomCore } from './engine.js'
export { findEnclosures, parseSnippets } from './tokenizer.js'
export { setLocale, getProperty } from './functions.js'
