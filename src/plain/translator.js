/**
 * Plain → Loom translator.
 *
 * Walks a Plain AST and emits a single Loom expression string. The returned
 * string is the contents of a Loom placeholder (no outer `{…}` braces) and
 * can be concatenated into a template by the engine.
 *
 * Modifier application order (inside-out) matters for correctness:
 *   WHERE  → SORTED BY → JOINED BY → AS → WITH LABEL
 *
 * That mirrors how a user would describe it in English ("first filter, then
 * sort, then join, then format, then label") and keeps the generated Loom
 * expressions readable.
 */

export { translate }

export class PlainTranslateError extends Error {}

function translate(node) {
    if (node == null) return ''
    const s = nested(node)
    return stripOuterParens(s)
}

function nested(node) {
    switch (node.type) {
        case 'loom': {
            // A loom passthrough represents a complete Compact-form
            // sub-expression embedded in a Plain template. If its inner
            // content has more than one top-level token (whitespace
            // outside strings and nested brackets), wrap it in parens
            // so a parent modifier can safely embed it as a single
            // argument — otherwise the tokens would fragment into the
            // parent function call's arg list.
            //
            // Single-token inners like `{name}` are left bare because
            // LoomCore parses `(name)` as a function call to `name`,
            // not as a grouped identifier. Wrapping them would break
            // existing templates that use a bare variable placeholder
            // inside a Plain construct.
            //
            // The final stripOuterParens() pass unwraps any redundant
            // outer pair when this expression ends up as the top-level
            // result of translate().
            const inner = stripBraces(node.value)
            return hasTopLevelWhitespace(inner) ? `(${inner})` : inner
        }
        case 'var':
            return node.path
        case 'string':
            return quote(node.value)
        case 'number':
            return String(node.value)
        case 'group':
            return nested(node.inner)
        case 'binop':
            return `(${node.op} ${nested(node.left)} ${nested(node.right)})`
        case 'unop':
            return `(${node.op} ${nested(node.arg)})`
        case 'show':
            return translateShow(node)
        case 'if':
            return translateIf(node)
        case 'count':
            return translateCount(node)
        case 'sum':
            return `(++ ${nested(node.value)})`
        case 'average': {
            const v = nested(node.value)
            return `(/ (++ ${v}) (++!! ${v}))`
        }
        case 'call':
            return translateCall(node)
        case 'forEach':
            return translateForEach(node)
        default:
            throw new PlainTranslateError(`Unknown node type: ${node.type}`)
    }
}

function translateCall(node) {
    if (node.args.length === 0) return node.name
    const args = node.args.map(nested).join(' ')
    return `(${node.name} ${args})`
}

function translateShow(node) {
    // Multi-value SHOW (`SHOW a, b, c JOINED BY ', '` /
    // `SHOW 'Dr. ' title IF PRESENT`) is a distinct form with its own
    // translation — it can't share the single-value modifier pipeline
    // because WHERE/SORT/AS etc. have no well-defined meaning across N
    // parallel values. The parser rejects those modifier combinations
    // at parse time, so by this point we know the modifiers are limited
    // to JOINED BY and/or IF PRESENT.
    if (node.values) {
        return translateMultiValueShow(node)
    }

    // The "list root" is the prefix path used to scope bare identifiers
    // in WHERE conditions. For `SHOW pubs.title WHERE refereed`, the root
    // is `pubs`, and `refereed` gets rewritten to `pubs.refereed` so the
    // condition evaluates per-element via Loom's list-awareness.
    const listRoot = extractListRoot(node.value)

    // Sort-restructuring pre-pass.
    //
    // When SORTED BY is present and the SHOW value is a dotted path
    // (e.g., `pubs.title`), the sort must operate on the full object
    // array — not on the already-extracted display values (strings)
    // that the dotted path evaluates to. Without this, `-by=year`
    // tries to look up `year` on a string and silently falls back to
    // alphabetical order.
    //
    // When detected, we start `expr` as the list root (full objects),
    // let WHERE and SORTED BY operate on those objects, then extract
    // the display field at the end via the `.` accessor. Null entries
    // from WHERE's ternary null-replacement are dropped during
    // rendering by `formatList`.
    const hasSortedBy = node.modifiers.some((m) => m.type === 'sortedBy')
    let displayField = null
    if (hasSortedBy && node.value.type === 'var' && listRoot) {
        const path = node.value.path
        const rootPrefix = listRoot + '.'
        if (path.startsWith(rootPrefix) && path.length > rootPrefix.length) {
            displayField = path.slice(rootPrefix.length)
        }
    }

    // Aggregate-WHERE pre-pass.
    //
    // A WHERE modifier on an aggregate value (count/sum/average) needs a
    // filter-then-aggregate rewrite rather than the naive wrap-in-a-
    // ternary form that works for scalar/list values. "Count the items
    // WHERE cond" means counting after filtering, not "if cond, then
    // count; otherwise nothing."
    //
    // The rewrite REPLACES the initial expression rather than wrapping
    // it, so any modifiers already processed before we hit the WHERE
    // would be lost if this ran inside the main modifier loop. Handling
    // it as a pre-pass keeps order-independence: `COUNT OF x WHERE y
    // AS number` and `COUNT OF x AS number WHERE y` produce the same
    // result because AS is always applied AFTER the aggregate-WHERE
    // rewrite, regardless of the source-text order.
    let expr
    let skipWhereIndex = -1
    const av = node.value
    if (
        av &&
        (av.type === 'count' || av.type === 'sum' || av.type === 'average')
    ) {
        const whereIdx = node.modifiers.findIndex((m) => m.type === 'where')
        if (whereIdx >= 0) {
            const whereMod = node.modifiers[whereIdx]
            const aggRoot = extractListRoot(av.value)
            const cond = nested(prefixBareVars(whereMod.condition, aggRoot))
            if (av.type === 'count') {
                expr = `(++!! ${cond})`
            } else if (av.type === 'sum') {
                expr = `(++ (? ${cond} ${nested(av.value)}))`
            } else {
                const v = nested(av.value)
                expr = `(/ (++ (? ${cond} ${v})) (++!! ${cond}))`
            }
            skipWhereIndex = whereIdx
        }
    }
    if (expr == null) expr = displayField ? listRoot : nested(node.value)

    for (let i = 0; i < node.modifiers.length; i++) {
        if (i === skipWhereIndex) continue
        const mod = node.modifiers[i]
        switch (mod.type) {
            case 'where': {
                // Non-aggregate WHERE: wrap the expression in a ternary.
                // Aggregate WHERE was already handled by the pre-pass.
                const cond = nested(prefixBareVars(mod.condition, listRoot))
                expr = `(? ${cond} ${expr})`
                break
            }
            case 'sortedBy': {
                const prop = extractProp(mod.value)
                const descFlag = mod.order === 'desc' ? '-desc ' : ''
                expr = `(>> ${descFlag}-by=${prop} ${expr})`
                // When restructured, extract the display field now so
                // subsequent modifiers (JOINED BY, AS, etc.) see the
                // scalar display values, not the full objects.
                if (displayField) {
                    expr = `(. ${quote(displayField)} ${expr})`
                    displayField = null
                }
                break
            }
            case 'joinedBy':
                expr = `(+: ${quote(mod.sep)} ${expr})`
                break
            case 'as':
                expr = `(# ${formatFlag(mod.format)} ${expr})`
                break
            case 'withLabel': {
                const labelArg = mod.label != null ? `=${quote(mod.label)}` : ''
                expr = `(# -label${labelArg} ${expr})`
                break
            }
            default:
                throw new PlainTranslateError(`Unknown modifier type: ${mod.type}`)
        }
    }

    return expr
}

/**
 * Translate a multi-value SHOW into a Compact join expression.
 *
 * Three shapes come out of the parser for multi-value SHOW:
 *
 *   SHOW a, b, c                          → `(+: '' a b c)`
 *       concatenation with per-item drop (empties are skipped before
 *       joining). Equivalent to the `{'' a b c}` Compact idiom. The
 *       explicit empty separator keeps all behavior in `joinWithSeparator`
 *       rather than relying on the unlabeled-joiner default.
 *
 *   SHOW a, b, c JOINED BY ', '           → `(+: ', ' a b c)`
 *       per-item drop with an explicit separator. `joinWithSeparator`
 *       filters empty items before joining, matching the per-item drop
 *       semantics authors expect from "city, province, country" style
 *       expressions.
 *
 *   SHOW 'Dr. ' title IF PRESENT          → `(+? 'Dr. ' title)`
 *       all-or-nothing: `joinIfAllTrue` returns '' if any arg is empty,
 *       otherwise concatenates them with no separator. Literal strings
 *       are always non-empty, so they never trigger the drop — only
 *       variable references can cause the clause to collapse.
 *
 * The parser guarantees JOINED BY and IF PRESENT can't both appear on
 * the same SHOW, so there's no ambiguity to resolve here.
 */
function translateMultiValueShow(node) {
    const pieces = node.values.map(nested)
    const ifPresent = node.modifiers.some((m) => m.type === 'ifPresent')
    if (ifPresent) {
        return `(+? ${pieces.join(' ')})`
    }
    const joinedBy = node.modifiers.find((m) => m.type === 'joinedBy')
    const sep = joinedBy ? joinedBy.sep : ''
    return `(+: ${quote(sep)} ${pieces.join(' ')})`
}

function translateIf(node) {
    const cond = nested(node.condition)
    const thenB = nested(node.thenBranch)
    if (node.elseBranch != null) {
        return `(? ${cond} ${thenB} ${nested(node.elseBranch)})`
    }
    return `(? ${cond} ${thenB})`
}

function translateCount(node) {
    // Plain `COUNT OF x` without a WHERE modifier. The WHERE case is
    // handled uniformly by translateShow's WHERE branch (a count node
    // wrapped in a show with where modifier), not here — that's why
    // there's no `node.where` to check.
    return `(++!! ${nested(node.value)})`
}

/**
 * Return the list-root path for a value node, used to prefix bare
 * identifiers in a WHERE condition. For `pubs.title` → `pubs`; for
 * `user.publications.title` → `user.publications`; for a bare `pubs` or
 * any non-variable value → the value's own path (or null).
 *
 * Aggregate nodes (count/sum/average) unwrap to their inner value so
 * that WHERE on an aggregate — `SUM OF grants.amount WHERE active` —
 * can use `grants` as the list root for prefixing `active`.
 */
function extractListRoot(node) {
    if (node == null) return null
    if (node.type === 'var') {
        const parts = node.path.split('.')
        if (parts.length > 1) return parts.slice(0, -1).join('.')
        return node.path
    }
    if (node.type === 'group') return extractListRoot(node.inner)
    if (
        node.type === 'count' ||
        node.type === 'sum' ||
        node.type === 'average'
    ) {
        return extractListRoot(node.value)
    }
    return null
}

/**
 * Walk a condition AST and prefix bare variable references with the list
 * root so the condition evaluates per-element. A var that already starts
 * with the prefix, already contains a dot, or refers to a literal like
 * `true`/`false`/`null` is left alone.
 *
 * This is a *conservative* rewrite: it assumes bare identifiers in a
 * WHERE clause are properties of the list being filtered. Users who need
 * to reference a top-level scalar in a WHERE should write the full dotted
 * path or fall back to a raw Loom `{…}` expression.
 */
function prefixBareVars(node, prefix) {
    if (node == null || !prefix) return node
    switch (node.type) {
        case 'var': {
            const path = node.path
            if (path.startsWith(prefix + '.') || path === prefix) return node
            if (path.includes('.')) return node
            if (path === 'true' || path === 'false' || path === 'null') return node
            if (path.startsWith('@') || path.startsWith('$')) return node
            return { type: 'var', path: `${prefix}.${path}` }
        }
        case 'binop':
            return {
                ...node,
                left: prefixBareVars(node.left, prefix),
                right: prefixBareVars(node.right, prefix),
            }
        case 'unop':
            return { ...node, arg: prefixBareVars(node.arg, prefix) }
        case 'group':
            return { ...node, inner: prefixBareVars(node.inner, prefix) }
        default:
            return node
    }
}

function translateForEach(node) {
    // FOR EACH is deprioritized — the design notes recommend implicit
    // list-awareness in almost all cases. We translate it as a generic map
    // snippet so it still does something reasonable for users who reach for
    // it: iterate over `list`, evaluating `body` per element with `ident`
    // bound to the current item.
    //
    // Loom's list-awareness already handles the common case, so we compile
    // FOR EACH as a placeholder using Loom's callback-argument syntax
    // ($1 is the current element).
    const list = nested(node.list)
    // Naively substitute the identifier in the body with $1. Since we
    // don't re-tokenize, this is a best effort for simple bodies.
    const body = nested(node.body).replace(
        new RegExp(`\\b${escapeRegex(node.ident)}\\b`, 'g'),
        '$1'
    )
    return `(map ${list} ${quote(body)})`
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractProp(valueNode) {
    if (valueNode.type === 'var') {
        const parts = valueNode.path.split('.')
        return parts[parts.length - 1]
    }
    if (valueNode.type === 'string') return valueNode.value
    return nested(valueNode)
}

function formatFlag(format) {
    if (format.raw != null) {
        const raw = format.raw
        // A user-supplied raw format spec is a Loom flag fragment. If it
        // already starts with `-` treat as verbatim; otherwise assume it's
        // a type name and prefix.
        return raw.startsWith('-') ? raw : `-${raw}`
    }
    if (format.value != null) return `-${format.type}=${format.value}`
    return `-${format.type}`
}

function quote(s) {
    if (typeof s !== 'string') s = String(s)
    if (!s.includes("'")) return `'${s}'`
    if (!s.includes('"')) return `"${s}"`
    return `'${s.replace(/'/g, "\\'")}'`
}

function stripBraces(s) {
    if (s.length >= 2 && s[0] === '{' && s[s.length - 1] === '}') {
        return s.slice(1, -1)
    }
    return s
}

/**
 * Does the string contain whitespace at the top nesting level, outside
 * string literals and balanced (), {}, or [] groups?
 *
 * Used by the loom-passthrough translator to decide whether the inner
 * content is a single atomic token (`name`, `(+ 1 2)`, `"hi there"`)
 * that can be embedded bare, or a multi-token expression (`+ 1 2`,
 * `+? "Dr. " title`) that must be wrapped in parens so a parent
 * function-call wrapper doesn't fragment it.
 */
function hasTopLevelWhitespace(s) {
    let depth = 0
    let inStr = false
    let quote = ''
    for (let i = 0; i < s.length; i++) {
        const c = s[i]
        if (inStr) {
            if (c === '\\' && i + 1 < s.length) {
                i++
                continue
            }
            if (c === quote) inStr = false
            continue
        }
        if (c === '"' || c === "'" || c === '`') {
            inStr = true
            quote = c
            continue
        }
        if (c === '(' || c === '{' || c === '[') {
            depth++
            continue
        }
        if (c === ')' || c === '}' || c === ']') {
            depth--
            continue
        }
        if (depth === 0 && (c === ' ' || c === '\t' || c === '\n' || c === '\r')) {
            return true
        }
    }
    return false
}

/**
 * Strip exactly one outer pair of parens, but only if they enclose the
 * entire string (i.e., the opening paren matches the closing one, not an
 * inner pair that happens to close early).
 */
function stripOuterParens(s) {
    if (s.length < 2 || s[0] !== '(' || s[s.length - 1] !== ')') return s
    let depth = 0
    let inString = false
    let stringChar = ''
    for (let i = 0; i < s.length; i++) {
        const c = s[i]
        if (inString) {
            if (c === '\\' && i + 1 < s.length) {
                i++
                continue
            }
            if (c === stringChar) inString = false
            continue
        }
        if (c === '"' || c === "'" || c === '`') {
            inString = true
            stringChar = c
            continue
        }
        if (c === '(') depth++
        else if (c === ')') {
            depth--
            if (depth === 0 && i < s.length - 1) return s
        }
    }
    return s.slice(1, -1)
}
