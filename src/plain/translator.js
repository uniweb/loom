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
        case 'forEach':
            return translateForEach(node)
        default:
            throw new PlainTranslateError(`Unknown node type: ${node.type}`)
    }
}

function translateShow(node) {
    let expr = nested(node.value)

    for (const mod of node.modifiers) {
        switch (mod.type) {
            case 'where':
                expr = `(? ${nested(mod.condition)} ${expr})`
                break
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
    const value = nested(node.value)
    if (node.where != null) {
        return `(++!! (? ${nested(node.where)} ${value}))`
    }
    return `(++!! ${value})`
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
