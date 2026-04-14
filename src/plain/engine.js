/**
 * Plain — natural-language skin on top of Loom.
 *
 * The `Plain` class composes a private `Loom` instance. Calls to render()
 * and evaluateText() first translate the Plain surface syntax to a Loom
 * expression string, then delegate to Loom's evaluator. If translation
 * fails for any reason, the original input is passed through unchanged so
 * that raw Loom expressions always work (Plain is a superset).
 */

import Loom from '../engine.js'
import { findEnclosures, parseSnippets } from '../tokenizer.js'
import { tokenize } from './tokenizer.js'
import { parse } from './parser.js'
import { translate } from './translator.js'

export { Plain }

class Plain {
    /**
     * @param {Object|string} snippets - Same forms as Loom accepts (source
     *   string, object, or empty). Bodies written in Plain syntax are
     *   eagerly translated to Loom at construction time.
     * @param {Object} functions - Passed through to Loom unchanged.
     */
    constructor(snippets = {}, functions = {}) {
        const prepared = this._prepareSnippets(snippets)
        this.loom = new Loom(prepared, functions)
    }

    /**
     * Pre-parse and translate snippet bodies so that any Plain syntax
     * inside a body is converted to Loom before the body is stored. After
     * this step, Loom's evaluator never sees Plain syntax — it just sees
     * a library of normal Loom snippets.
     *
     * Uses Loom's own parseSnippets to handle the source-string form and
     * to normalize the object form. Pre-built function values are passed
     * through unchanged.
     */
    _prepareSnippets(snippets) {
        const parsed = parseSnippets(snippets)
        const result = {}
        for (const [name, def] of Object.entries(parsed)) {
            if (typeof def === 'function') {
                result[name] = def
                continue
            }
            result[name] = {
                ...def,
                body: def.isText
                    ? this.translateTemplate(def.body)
                    : this.translateExpression(def.body),
            }
        }
        return result
    }

    /**
     * Render a template, translating each `{…}` placeholder from Plain to
     * Loom before handing the result to Loom's renderer.
     */
    render(template, variables = null, auxVariables = null) {
        const translated = this.translateTemplate(template)
        return this.loom.render(translated, variables, auxVariables)
    }

    /**
     * Evaluate a single Plain expression. Returns whatever Loom returns —
     * string, number, array, object, etc.
     */
    evaluateText(expression, variables = null, auxVariables = null) {
        const translated = this.translateExpression(expression)
        return this.loom.evaluateText(translated, variables, auxVariables)
    }

    /**
     * Walk a template, find each balanced `{…}` block, translate its
     * contents to Loom, and rebuild the template. Plain text outside
     * placeholders is untouched.
     */
    translateTemplate(template) {
        const tokens = findEnclosures(template, { '{': '}' })
        let out = ''

        for (const token of tokens) {
            if (token.type !== 'enclosure') {
                out += token.value
                continue
            }

            let inner = token.value.slice(1, -1)

            // Loom's render() tolerates `{{…}}` as a pass-through form;
            // mirror that behavior by leaving double-brace blocks alone.
            if (inner.startsWith('{') && inner.endsWith('}')) {
                out += token.value
                continue
            }

            const translated = this.translateExpression(inner, { wrapped: false })
            out += `{${translated}}`
        }

        return out
    }

    /**
     * Translate a single expression (the contents of a placeholder, or a
     * standalone expression passed to evaluateText). Falls back to the
     * original input on any parse or translation failure.
     */
    translateExpression(expression) {
        try {
            const ast = parse(tokenize(expression))
            return translate(ast)
        } catch {
            return expression
        }
    }
}
