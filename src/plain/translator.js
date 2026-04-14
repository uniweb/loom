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
        case 'loom':
            return stripBraces(node.value)
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
    let expr = nested(node.value)
    // The "list root" is the prefix path used to scope bare identifiers
    // in WHERE conditions. For `SHOW pubs.title WHERE refereed`, the root
    // is `pubs`, and `refereed` gets rewritten to `pubs.refereed` so the
    // condition evaluates per-element via Loom's list-awareness.
    const listRoot = extractListRoot(node.value)

    for (const mod of node.modifiers) {
        switch (mod.type) {
            case 'where': {
                const cond = nested(prefixBareVars(mod.condition, listRoot))
                expr = `(? ${cond} ${expr})`
                break
            }
            case 'sortedBy': {
                const prop = extractProp(mod.value)
                const descFlag = mod.order === 'desc' ? '-desc ' : ''
                expr = `(>> ${descFlag}-by=${prop} ${expr})`
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

function translateIf(node) {
    const cond = nested(node.condition)
    const thenB = nested(node.thenBranch)
    if (node.elseBranch != null) {
        return `(? ${cond} ${thenB} ${nested(node.elseBranch)})`
    }
    return `(? ${cond} ${thenB})`
}

function translateCount(node) {
    if (node.where != null) {
        // Count truthy values of the per-element condition list. For
        // `COUNT OF pubs WHERE refereed`, this produces `++!! pubs.refereed`
        // which is cheaper and more idiomatic than filtering first.
        const listRoot = extractListRoot(node.value)
        const cond = nested(prefixBareVars(node.where, listRoot))
        return `(++!! ${cond})`
    }
    return `(++!! ${nested(node.value)})`
}

/**
 * Return the list-root path for a value node, used to prefix bare
 * identifiers in a WHERE condition. For `pubs.title` → `pubs`; for
 * `user.publications.title` → `user.publications`; for a bare `pubs` or
 * any non-variable value → the value's own path (or null).
 */
function extractListRoot(node) {
    if (node == null) return null
    if (node.type === 'var') {
        const parts = node.path.split('.')
        if (parts.length > 1) return parts.slice(0, -1).join('.')
        return node.path
    }
    if (node.type === 'group') return extractListRoot(node.inner)
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
