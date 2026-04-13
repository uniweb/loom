/**
 * @uniweb/loom/plain — natural-language layer on top of Loom.
 *
 * Plain lets content authors write template expressions using English-like
 * phrasing ({SHOW publications.title SORTED BY date DESCENDING}) that
 * compile to equivalent Loom expressions at parse time.
 *
 * Plain is a strict superset of Loom: any valid Loom expression is also
 * valid Plain, and the parser falls through to raw Loom when an input
 * doesn't match a Plain pattern.
 *
 * Usage:
 *   import { Plain } from '@uniweb/loom/plain'
 *
 *   const plain = new Plain()
 *   plain.render('Hello {first_name}', { first_name: 'Diego' })
 *   // → 'Hello Diego'
 */

export { Plain } from './engine.js'
export { tokenize } from './tokenizer.js'
export { parse } from './parser.js'
export { translate } from './translator.js'
