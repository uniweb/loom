/**
 * Loom — the default front door for @uniweb/loom.
 *
 * Loom is one language with two surface forms:
 *
 *   - Plain form: natural-language syntax — `SHOW publications.title
 *     WHERE refereed SORTED BY date DESCENDING`. Reads like a description
 *     of what you want. This is the audience-appropriate front door.
 *
 *   - Compact form: symbolic Polish-notation — `{+: ', ' (>> -desc -by=date
 *     (? refereed publications.title))}`. Terser, for power users.
 *
 * Both forms parse to the same internal representation and run on the
 * same evaluator (LoomCore). Plain is a strict superset: any Compact
 * expression is also valid Plain, so mixed templates work seamlessly —
 * a `{…}` block inside a Plain expression passes through as Compact.
 *
 * This class wraps a private LoomCore instance. Calls to render() and
 * evaluateText() first translate the Plain surface syntax to Compact
 * form, then delegate to the core evaluator. If translation fails for
 * any reason, the original input is passed through unchanged so that
 * raw Compact expressions always work.
 *
 * Users who want to skip the Plain parser entirely (for parsing speed,
 * or to avoid Plain keyword shadowing of variable names) can import
 * LoomCore directly from `@uniweb/loom/core`.
 */

import LoomCore from './core/engine.js'
import { findEnclosures, parseSnippets } from './core/tokenizer.js'
import { tokenize } from './plain/tokenizer.js'
import { parse } from './plain/parser.js'
import { translate } from './plain/translator.js'

export default class Loom {
    /**
     * @param {Object|string} snippets - Same forms as LoomCore accepts
     *   (source string, object, or empty). Bodies written in Plain
     *   syntax are eagerly translated to Compact form at construction
     *   time so the evaluator never sees Plain syntax.
     * @param {Object} functions - Passed through to LoomCore unchanged.
     */
    constructor(snippets = {}, functions = {}) {
        const prepared = this._prepareSnippets(snippets)
        this.core = new LoomCore(prepared, functions)
    }

    /**
     * Pre-parse and translate snippet bodies so that any Plain syntax
     * inside a body is converted to Compact form before the body is
     * stored. After this step, the core evaluator never sees Plain
     * syntax — it just sees a library of normal Compact-form snippets.
     *
     * Uses the core tokenizer's parseSnippets to handle the source-string
     * form and to normalize the object form. Pre-built function values
     * pass through unchanged.
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
     * Render a template, translating each `{…}` placeholder from Plain
     * to Compact form before handing the result to the core renderer.
     */
    render(template, variables = null, auxVariables = null) {
        const translated = this.translateTemplate(template)
        return this.core.render(translated, variables, auxVariables)
    }

    /**
     * Evaluate a single expression. Accepts both Plain and Compact form.
     * Returns whatever the core engine returns — string, number, array,
     * object, etc.
     */
    evaluateText(expression, variables = null, auxVariables = null) {
        const translated = this.translateExpression(expression)
        return this.core.evaluateText(translated, variables, auxVariables)
    }

    /**
     * Walk a template, find each balanced `{…}` block, translate its
     * contents from Plain to Compact form, and rebuild the template.
     * Plain text outside placeholders is untouched.
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

            // The core engine's render() tolerates `{{…}}` as a
            // pass-through form; mirror that by leaving double-brace
            // blocks alone so mixed templates can force raw Compact
            // interpretation.
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
