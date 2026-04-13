/**
 * @uniweb/loom — An expression language for weaving data into text.
 *
 * Loom has two modes:
 *
 *   import { Loom } from '@uniweb/loom'
 *
 *   const loom = new Loom()
 *
 *   // Text with placeholders
 *   loom.render("Hello {first_name} {family_name}", key => profile[key])
 *   // → "Hello Diego Macrini"
 *
 *   // Single expression, any return type
 *   loom.evaluateText("personal_info/education", key => profile.getValue(key))
 *   // → [{degree: "PhD", ...}, ...]
 *
 * Domain-neutral: no React, no Uniweb assumptions, no citations, no
 * templates-for-websites. Just a small Polish-notation expression language
 * with a rich standard library (sort, filter, aggregate, format, join,
 * compare, branch) and a snippet system for user-defined functions.
 */

export { default as Loom } from './engine.js'
export { findEnclosures, parseSnippets } from './tokenizer.js'
export { setLocale, getProperty } from './functions.js'
