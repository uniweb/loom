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
import { findEnclosures } from '../tokenizer.js'
import { tokenize } from './tokenizer.js'
import { parse } from './parser.js'
import { translate } from './translator.js'

export { Plain }

class Plain {
    /**
     * @param {Object|string} snippets - Passed through to Loom.
     * @param {Object} functions - Passed through to Loom.
     */
    constructor(snippets = {}, functions = {}) {
        this.loom = new Loom(snippets, functions)
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
