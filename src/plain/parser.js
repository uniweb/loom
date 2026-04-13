/**
 * Plain parser.
 *
 * Consumes the token stream from the tokenizer and produces a command AST.
 * Recursive descent with permissive modifier ordering: AS / WITH LABEL /
 * SORTED BY / JOINED BY / WHERE / IF can appear in any order after a value,
 * and the parser accumulates them into a flat `modifiers` list for the
 * translator to apply in its canonical order.
 *
 * AST node shapes (all optional fields omitted when absent):
 *
 *   { type: 'show',    value: Node, modifiers: Modifier[] }
 *   { type: 'if',      condition: Node, thenBranch: Node, elseBranch?: Node }
 *   { type: 'count',   value: Node, where?: Node }
 *   { type: 'sum',     value: Node }
 *   { type: 'average', value: Node }
 *   { type: 'forEach', ident: string, list: Node, body: Node }
 *   { type: 'var',     path: string }
 *   { type: 'string',  value: string }
 *   { type: 'number',  value: number }
 *   { type: 'loom',    value: string }              // verbatim {…}
 *   { type: 'group',   inner: Node }
 *   { type: 'binop',   op: string, left: Node, right: Node }
 *   { type: 'unop',    op: string, arg: Node }
 *
 * Modifier shapes:
 *   { type: 'as',         format: FormatSpec }
 *   { type: 'withLabel',  label: string | null }
 *   { type: 'sortedBy',   value: Node, order: 'asc' | 'desc' }
 *   { type: 'joinedBy',   sep: string }
 *   { type: 'where',      condition: Node }
 *
 * FormatSpec is either { raw: string } (from a quoted format literal) or
 * { type: string, value?: string } (from bare words like "long date",
 * "currency USD", "phone").
 */

import { FORMAT_TYPES } from './tokenizer.js'

export { parse }

export class PlainParseError extends Error {}

const MODIFIER_KEYWORDS = new Set([
    'AS',
    'WITH LABEL',
    'SORTED BY',
    'FROM LOWEST TO HIGHEST',
    'FROM HIGHEST TO LOWEST',
    'JOINED BY',
    'WHERE',
    'IF',
])

const DATE_WORDS = new Set(['long', 'full', 'short', 'medium'])

function parse(tokens) {
    const p = { tokens, i: 0 }
    const node = parseExpression(p)
    if (node == null) {
        throw new PlainParseError('Empty Plain expression')
    }
    if (p.i < p.tokens.length) {
        const rest = p.tokens.slice(p.i).map((t) => t.value).join(' ')
        throw new PlainParseError(`Unexpected trailing tokens: ${rest}`)
    }
    return node
}

function peek(p, offset = 0) {
    return p.tokens[p.i + offset]
}

function advance(p) {
    return p.tokens[p.i++]
}

function expect(p, type, value) {
    const t = peek(p)
    if (!t || t.type !== type || (value != null && t.value !== value)) {
        const got = t ? `${t.type}:${t.value}` : 'end of input'
        throw new PlainParseError(`Expected ${type}${value ? ` (${value})` : ''}, got ${got}`)
    }
    return advance(p)
}

function parseExpression(p) {
    const t = peek(p)
    if (!t) return null

    if (t.type === 'keyword') {
        switch (t.value) {
            case 'IF':
                return parseIf(p)
            case 'SHOW':
                advance(p)
                return parseShowBody(p)
            case 'TOTAL OF':
            case 'SUM OF':
                advance(p)
                return { type: 'sum', value: parseValue(p) }
            case 'AVERAGE OF':
                advance(p)
                return { type: 'average', value: parseValue(p) }
            case 'COUNT OF':
                return parseCount(p)
            case 'FOR EACH':
                return parseForEach(p)
        }
    }

    // Implicit SHOW — bare value with optional modifiers.
    return parseShowBody(p)
}

function parseShowBody(p) {
    const value = parseValue(p)
    if (value == null) {
        const t = peek(p)
        const got = t ? `${t.type}:${t.value}` : 'end of input'
        throw new PlainParseError(`Expected a value, got ${got}`)
    }
    const modifiers = parseModifiers(p)
    // If there are modifiers, or the value is plain, wrap as a 'show' node.
    if (modifiers.length === 0 && isAtomValue(value)) {
        // Bare value — still wrap as 'show' so the translator handles it
        // uniformly.
        return { type: 'show', value, modifiers: [] }
    }
    return { type: 'show', value, modifiers }
}

function isAtomValue(node) {
    return (
        node.type === 'var' ||
        node.type === 'string' ||
        node.type === 'number' ||
        node.type === 'loom' ||
        node.type === 'group'
    )
}

function parseModifiers(p) {
    const mods = []

    while (p.i < p.tokens.length) {
        const t = peek(p)
        if (!t || t.type !== 'keyword' || !MODIFIER_KEYWORDS.has(t.value)) break

        switch (t.value) {
            case 'AS': {
                advance(p)
                mods.push({ type: 'as', format: parseFormatSpec(p) })
                break
            }
            case 'WITH LABEL': {
                advance(p)
                let label = null
                if (peek(p) && peek(p).type === 'string') {
                    label = advance(p).value
                }
                mods.push({ type: 'withLabel', label })
                break
            }
            case 'SORTED BY': {
                advance(p)
                const value = parseValue(p)
                let order = 'asc'
                const next = peek(p)
                if (next && next.type === 'keyword') {
                    if (next.value === 'DESCENDING') {
                        advance(p)
                        order = 'desc'
                    } else if (next.value === 'ASCENDING') {
                        advance(p)
                    }
                }
                mods.push({ type: 'sortedBy', value, order })
                break
            }
            case 'FROM LOWEST TO HIGHEST': {
                advance(p)
                mods.push({ type: 'sortedBy', value: parseValue(p), order: 'asc' })
                break
            }
            case 'FROM HIGHEST TO LOWEST': {
                advance(p)
                mods.push({ type: 'sortedBy', value: parseValue(p), order: 'desc' })
                break
            }
            case 'JOINED BY': {
                advance(p)
                const s = peek(p)
                if (!s || s.type !== 'string') {
                    throw new PlainParseError(`JOINED BY expects a quoted string`)
                }
                advance(p)
                mods.push({ type: 'joinedBy', sep: s.value })
                break
            }
            case 'WHERE':
            case 'IF': {
                advance(p)
                mods.push({ type: 'where', condition: parseCondition(p) })
                break
            }
            default:
                return mods
        }
    }

    return mods
}

function parseFormatSpec(p) {
    // Quoted-string form: "-date=long", "currency"
    const first = peek(p)
    if (first && first.type === 'string') {
        advance(p)
        return { raw: first.value }
    }

    // Bare-words form: collect up to two identifier tokens.
    const words = []
    while (words.length < 2) {
        const t = peek(p)
        if (!t || t.type !== 'identifier') break
        words.push(advance(p).value.toLowerCase())
    }

    if (words.length === 0) {
        throw new PlainParseError('AS requires a format type')
    }

    const a = words[0]
    const b = words[1]

    // Pattern: [modifier] date   e.g., "long date", "full date"
    if (b === 'date' && DATE_WORDS.has(a)) {
        return { type: 'date', value: a }
    }
    // Pattern: "year only" / "month only"
    if (b === 'only' && (a === 'year' || a === 'month')) {
        return { type: 'date', value: a === 'year' ? 'y' : 'm' }
    }

    // Pattern: [type] [value]  e.g., "currency USD"
    if (FORMAT_TYPES.has(a)) {
        return { type: a, value: b ?? null }
    }

    // Unknown first word: best-effort fallthrough — treat as a bare flag.
    // Push the second word back so it becomes part of the next modifier or
    // value.
    if (b != null) {
        p.i--
    }
    return { type: a, value: null }
}

function parseIf(p) {
    expect(p, 'keyword', 'IF')
    const condition = parseCondition(p)

    // Optional THEN / SHOW before the true-branch.
    const t1 = peek(p)
    if (t1 && t1.type === 'keyword' && (t1.value === 'THEN' || t1.value === 'SHOW')) {
        advance(p)
    }

    const thenBranch = parseBranch(p)

    let elseBranch = null
    const t2 = peek(p)
    if (t2 && t2.type === 'keyword' && (t2.value === 'OTHERWISE' || t2.value === 'ELSE')) {
        advance(p)
        const t3 = peek(p)
        if (t3 && t3.type === 'keyword' && (t3.value === 'SHOW' || t3.value === 'ELSE')) {
            advance(p)
        }
        elseBranch = parseBranch(p)
    }

    return { type: 'if', condition, thenBranch, elseBranch }
}

function parseBranch(p) {
    // A branch is a single value with no trailing modifiers — modifiers
    // inside an IF would be ambiguous with the outer expression. If users
    // need modifiers, they can use a parenthesized sub-expression.
    return parseValue(p)
}

function parseCount(p) {
    expect(p, 'keyword', 'COUNT OF')
    const value = parseValue(p)
    let where = null
    const t = peek(p)
    if (t && t.type === 'keyword' && (t.value === 'WHERE' || t.value === 'IF')) {
        advance(p)
        where = parseCondition(p)
    }
    return { type: 'count', value, where }
}

function parseForEach(p) {
    expect(p, 'keyword', 'FOR EACH')
    const identTok = peek(p)
    if (!identTok || identTok.type !== 'identifier') {
        throw new PlainParseError('FOR EACH expects an identifier')
    }
    advance(p)
    const inTok = peek(p)
    if (inTok && inTok.type === 'keyword' && inTok.value === 'IN') {
        advance(p)
    }
    const list = parseValue(p)
    const doTok = peek(p)
    if (doTok && doTok.type === 'keyword' && doTok.value === 'DO') {
        advance(p)
    }
    const body = parseExpression(p)
    return { type: 'forEach', ident: identTok.value, list, body }
}

// Condition parsing — precedence: OR < AND < NOT < comparison < value.

function parseCondition(p) {
    return parseOr(p)
}

function parseOr(p) {
    let left = parseAnd(p)
    while (true) {
        const t = peek(p)
        if (!t || t.type !== 'operator') break
        if (t.value !== '|' && t.value !== '||') break
        advance(p)
        const right = parseAnd(p)
        left = { type: 'binop', op: '|', left, right }
    }
    return left
}

function parseAnd(p) {
    let left = parseNot(p)
    while (true) {
        const t = peek(p)
        if (!t || t.type !== 'operator') break
        if (t.value !== '&' && t.value !== '&&') break
        advance(p)
        const right = parseNot(p)
        left = { type: 'binop', op: '&', left, right }
    }
    return left
}

function parseNot(p) {
    const t = peek(p)
    if (t && t.type === 'operator' && t.value === '!') {
        advance(p)
        return { type: 'unop', op: '!', arg: parseNot(p) }
    }
    return parseComparison(p)
}

const COMPARISON_OPS = new Set(['=', '==', '!=', '>', '<', '>=', '<='])

function parseComparison(p) {
    const left = parseAdditive(p)
    const t = peek(p)
    if (t && t.type === 'operator' && COMPARISON_OPS.has(t.value)) {
        advance(p)
        const right = parseAdditive(p)
        return { type: 'binop', op: t.value === '==' ? '=' : t.value, left, right }
    }
    return left
}

function parseAdditive(p) {
    let left = parseMultiplicative(p)
    while (true) {
        const t = peek(p)
        if (!t || t.type !== 'operator') break
        if (t.value !== '+' && t.value !== '-') break
        advance(p)
        const right = parseMultiplicative(p)
        left = { type: 'binop', op: t.value, left, right }
    }
    return left
}

function parseMultiplicative(p) {
    let left = parseValue(p)
    while (true) {
        const t = peek(p)
        if (!t || t.type !== 'operator') break
        if (t.value !== '*' && t.value !== '/' && t.value !== '%') break
        advance(p)
        const right = parseValue(p)
        left = { type: 'binop', op: t.value, left, right }
    }
    return left
}

function parseValue(p) {
    const t = peek(p)
    if (!t) return null

    if (t.type === 'lparen') {
        advance(p)
        const inner = parseExpression(p)
        expect(p, 'rparen')
        return { type: 'group', inner }
    }

    if (t.type === 'loom') {
        advance(p)
        return { type: 'loom', value: t.value }
    }

    if (t.type === 'string') {
        advance(p)
        return { type: 'string', value: t.value }
    }

    if (t.type === 'number') {
        advance(p)
        return { type: 'number', value: t.value }
    }

    if (t.type === 'identifier') {
        advance(p)
        return { type: 'var', path: t.value }
    }

    return null
}
