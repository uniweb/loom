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
 *   { type: 'show',    values: Node[], modifiers: Modifier[] }     // multi-value
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
 *   { type: 'ifPresent' }                               // flag modifier, no args
 *
 * FormatSpec is either { raw: string } (from a quoted format literal) or
 * { type: string, value?: string } (from bare words like "long date",
 * "currency USD", "phone").
 */

import { FORMAT_TYPES, matchKeywordAt } from './tokenizer.js'

export { parse }

export class PlainParseError extends Error {}

const DATE_WORDS = new Set(['long', 'full', 'short', 'medium'])

// -----------------------------------------------------------------------------
// Position-specific keyword phrase sets.
//
// Each parse function consults only the phrases that are valid in its
// grammar position. A `word` token that could match a keyword in one
// position (`SHOW` as a construct verb) is left alone in positions that
// don't expect one (e.g., a bare-value position), so user variables and
// functions that share a name with a Plain keyword don't get silently
// reinterpreted.
//
// Phrases are stored as lowercase word arrays matching the form the
// tokenizer's KEYWORD_PHRASES uses — matchKeywordAt() compares them
// case-insensitively and returns a canonical uppercase value.
// -----------------------------------------------------------------------------

// Construct keywords are the verbs that can start an expression.
// parseExpression consults this set first; on a miss, it treats the
// leading word as an identifier (function call or implicit SHOW body).
const CONSTRUCT_KEYWORDS = [
    ['for', 'each'],
    ['total', 'of'],
    ['sum', 'of'],
    ['average', 'of'],
    ['count', 'of'],
    ['show'],
    ['if'],
]

// Modifier keywords chain onto a value: `{foo AS long date}`,
// `{foo WHERE bar}`, `{foo SORTED BY x DESCENDING}`, etc. parseModifiers
// consults this set; on a miss, it stops the modifier chain and lets
// the caller continue.
const MODIFIER_KEYWORDS = [
    ['from', 'lowest', 'to', 'highest'],
    ['from', 'highest', 'to', 'lowest'],
    ['sorted', 'by'],
    ['joined', 'by'],
    ['with', 'label'],
    ['if', 'present'],
    ['where'],
    ['as'],
    ['if'],
]

// Modifier keywords that also terminate a function-call argument list.
// `{fn arg SORTED BY x}` wraps the call in a show node; the SORTED BY
// must end the arg collection. Same set as MODIFIER_KEYWORDS — shared
// by reference.
const ARG_TERMINATING_KEYWORDS = MODIFIER_KEYWORDS

// Sub-keywords — consumed inside specific construct parsers.
const THEN_OR_SHOW = [['then'], ['show']]
const ELSE_OR_OTHERWISE = [['otherwise'], ['else']]
const ELSE_OR_SHOW = [['else'], ['show']]
const IN_KEYWORD = [['in']]
const DO_KEYWORD = [['do']]
const ASCENDING_KEYWORD = [['ascending']]
const DESCENDING_KEYWORD = [['descending']]
const WHERE_OR_IF = [['where'], ['if']]

/**
 * Try to match a keyword at the current position against one of several
 * allowed phrase sets. Returns `{ canonical, length }` on a match,
 * null otherwise. Does NOT advance the parser cursor — callers advance
 * with consumeKeyword() after they've decided to take the match.
 */
function peekKeyword(p, allowedSet) {
    return matchKeywordAt(p.tokens, p.i, allowedSet)
}

/**
 * Advance past a keyword phrase matched by peekKeyword().
 */
function consumeKeyword(p, match) {
    p.i += match.length
}

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

    // Position-aware construct keyword lookup. The parser asks "does the
    // current position contain a construct verb?" and only treats a word
    // as a keyword if it matches one. A single-word construct (SHOW / IF)
    // additionally requires at least one more token after it — a bare
    // `{show}` placeholder falls through to identifier lookup instead of
    // a broken empty SHOW, so user variables that shadow single-word
    // keywords work via principled grammar rather than parse-throw-and-
    // fallback.
    const kw = peekKeyword(p, CONSTRUCT_KEYWORDS)
    if (kw && !isStranded(p, kw)) {
        consumeKeyword(p, kw)
        switch (kw.canonical) {
            case 'IF':
                return parseIfBody(p)
            case 'SHOW':
                return parseShowBody(p)
            case 'TOTAL OF':
            case 'SUM OF':
                return wrapWithModifiers(p, { type: 'sum', value: parseValue(p) })
            case 'AVERAGE OF':
                return wrapWithModifiers(p, { type: 'average', value: parseValue(p) })
            case 'COUNT OF':
                return wrapWithModifiers(p, parseCountBody(p))
            case 'FOR EACH':
                return parseForEachBody(p)
        }
    }

    // Function-call form: a word followed immediately by at least one
    // value-ish token (string, number, paren group, loom passthrough, or
    // another identifier-word that isn't a modifier keyword). Distinct
    // from a bare variable lookup (`greet`) and from a variable with a
    // modifier (`greet WITH LABEL`, where the next token IS a modifier
    // keyword and must not be consumed as an argument). Function calls
    // can themselves take modifiers: `{fn arg SORTED BY x}` sorts the
    // call result.
    if (t.type === 'word' && isFunctionCallStart(p)) {
        const call = parseFunctionCall(p)
        const modifiers = parseModifiers(p)
        if (modifiers.length > 0) {
            return { type: 'show', value: call, modifiers }
        }
        return call
    }

    // Implicit SHOW — bare value with optional modifiers.
    return parseShowBody(p)
}

/**
 * A keyword match is "stranded" if it consumes all remaining tokens
 * without leaving room for the construct's operand(s). This lets
 * `{show}` alone fall through to identifier lookup instead of entering
 * parseShowBody with no value. Multi-word keywords are never stranded
 * because matching them means the phrase words were all present, which
 * is usually enough for the construct to proceed (edge cases like
 * `{COUNT OF}` alone still fall through to parseCountBody and fail
 * there — they're nonsense inputs either way).
 */
function isStranded(p, kw) {
    const remaining = p.tokens.length - p.i - kw.length
    return remaining <= 0 && kw.length === 1
}

function isFunctionCallStart(p) {
    const next = peek(p, 1)
    if (!next) return false
    // Unambiguous value tokens — always an argument.
    if (
        next.type === 'string' ||
        next.type === 'number' ||
        next.type === 'lparen' ||
        next.type === 'loom'
    ) {
        return true
    }
    // Word tokens are value-ish only if they DON'T match a modifier
    // keyword at this position. A modifier keyword here belongs to the
    // current word (which is then a bare variable with a modifier
    // attached), not to a function-call argument list. Peek-ahead uses
    // a temporary cursor bump so we don't advance the parser.
    if (next.type === 'word') {
        const savedI = p.i
        p.i += 1
        const mod = peekKeyword(p, MODIFIER_KEYWORDS)
        p.i = savedI
        return mod == null
    }
    return false
}

function parseFunctionCall(p) {
    const name = advance(p).value
    const args = []
    while (p.i < p.tokens.length) {
        const t = peek(p)
        if (!t) break
        // Commas between arguments are optional — treat them as
        // whitespace-equivalent so `{fn a, b, c}` and `{fn a b c}` parse
        // the same. A comma that appears where an argument is expected
        // is silently skipped.
        if (t.type === 'comma') {
            advance(p)
            continue
        }
        // Stop at anything that can't be an argument: closing paren,
        // infix operators, or a word that matches a modifier keyword
        // (which belongs to the outer show-node, not to the arg list).
        if (t.type === 'rparen') break
        if (t.type === 'operator') break
        if (t.type === 'word' && peekKeyword(p, MODIFIER_KEYWORDS)) break
        const val = parseValue(p)
        if (val == null) break
        args.push(val)
    }
    return { type: 'call', name, args }
}

function parseShowBody(p) {
    // Greedy value collection: parse values until we hit something that
    // isn't a value (a modifier keyword, a closing paren, an operator,
    // or the end of input). Commas between values are optional — both
    // `SHOW 'Dr. ' title IF PRESENT` and `SHOW city, province, country
    // JOINED BY ', '` are accepted. This lets authors pick whichever
    // reads better: commas when the values are a list, juxtaposition
    // when they're a label + value or prefix + value pair.
    const values = parseValueList(p)
    if (values.length === 0) {
        const t = peek(p)
        const got = t ? `${t.type}:${t.value}` : 'end of input'
        throw new PlainParseError(`Expected a value, got ${got}`)
    }

    const modifiers = parseModifiers(p)

    if (values.length > 1) {
        // Multi-value SHOW supports only JOINED BY and IF PRESENT as
        // modifiers — the join semantics are well-defined for those two.
        // Other modifiers (WHERE, SORTED BY, AS, WITH LABEL) would have
        // ambiguous meaning across N parallel values and are rejected
        // here so users get a clear error instead of silent surprise.
        for (const m of modifiers) {
            if (m.type !== 'joinedBy' && m.type !== 'ifPresent') {
                throw new PlainParseError(
                    `Multi-value SHOW supports only JOINED BY and IF PRESENT (got ${m.type})`
                )
            }
        }
        const hasJoin = modifiers.some((m) => m.type === 'joinedBy')
        const hasIfPresent = modifiers.some((m) => m.type === 'ifPresent')
        if (hasJoin && hasIfPresent) {
            throw new PlainParseError(
                `JOINED BY and IF PRESENT cannot be combined on the same SHOW`
            )
        }
        return { type: 'show', values, modifiers }
    }

    // Single-value form — unchanged from the original parseShowBody shape.
    const first = values[0]
    if (modifiers.length === 0 && isAtomValue(first)) {
        return { type: 'show', value: first, modifiers: [] }
    }
    return { type: 'show', value: first, modifiers }
}

/**
 * Greedy value-list parser shared by multi-value SHOW and function-call
 * argument collection. Parses values one at a time, stopping at any
 * non-value token (modifier keyword at this position, closing paren,
 * operator, or end of input). Commas between values are optional and
 * consumed as whitespace-equivalent separators.
 */
function parseValueList(p) {
    const values = []
    while (p.i < p.tokens.length) {
        const t = peek(p)
        if (!t) break
        if (t.type === 'comma') {
            advance(p)
            continue
        }
        if (t.type === 'rparen') break
        if (t.type === 'operator') break
        if (t.type === 'word' && peekKeyword(p, MODIFIER_KEYWORDS)) break
        const val = parseValue(p)
        if (val == null) break
        values.push(val)
    }
    return values
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
        const kw = peekKeyword(p, MODIFIER_KEYWORDS)
        if (!kw) break

        switch (kw.canonical) {
            case 'AS': {
                consumeKeyword(p, kw)
                mods.push({ type: 'as', format: parseFormatSpec(p) })
                break
            }
            case 'WITH LABEL': {
                consumeKeyword(p, kw)
                let label = null
                if (peek(p) && peek(p).type === 'string') {
                    label = advance(p).value
                }
                mods.push({ type: 'withLabel', label })
                break
            }
            case 'SORTED BY': {
                consumeKeyword(p, kw)
                const value = parseValue(p)
                let order = 'asc'
                const descKw = peekKeyword(p, DESCENDING_KEYWORD)
                if (descKw) {
                    consumeKeyword(p, descKw)
                    order = 'desc'
                } else {
                    const ascKw = peekKeyword(p, ASCENDING_KEYWORD)
                    if (ascKw) consumeKeyword(p, ascKw)
                }
                mods.push({ type: 'sortedBy', value, order })
                break
            }
            case 'FROM LOWEST TO HIGHEST': {
                consumeKeyword(p, kw)
                mods.push({ type: 'sortedBy', value: parseValue(p), order: 'asc' })
                break
            }
            case 'FROM HIGHEST TO LOWEST': {
                consumeKeyword(p, kw)
                mods.push({ type: 'sortedBy', value: parseValue(p), order: 'desc' })
                break
            }
            case 'JOINED BY': {
                consumeKeyword(p, kw)
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
                consumeKeyword(p, kw)
                mods.push({ type: 'where', condition: parseCondition(p) })
                break
            }
            case 'IF PRESENT': {
                consumeKeyword(p, kw)
                mods.push({ type: 'ifPresent' })
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

    // Bare-words form: collect up to two word tokens. A word that would
    // match a modifier keyword in this position terminates collection so
    // it can be consumed as the next modifier instead.
    const words = []
    while (words.length < 2) {
        const t = peek(p)
        if (!t || t.type !== 'word') break
        if (peekKeyword(p, MODIFIER_KEYWORDS)) break
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

// The construct sub-parsers assume parseExpression has already consumed
// the leading construct keyword. They pick up from the position after
// the keyword's word(s).

function parseIfBody(p) {
    const condition = parseCondition(p)

    // Optional THEN / SHOW before the true-branch.
    const thenKw = peekKeyword(p, THEN_OR_SHOW)
    if (thenKw) consumeKeyword(p, thenKw)

    const thenBranch = parseBranch(p)

    let elseBranch = null
    const elseKw = peekKeyword(p, ELSE_OR_OTHERWISE)
    if (elseKw) {
        consumeKeyword(p, elseKw)
        const followup = peekKeyword(p, ELSE_OR_SHOW)
        if (followup) consumeKeyword(p, followup)
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

function parseCountBody(p) {
    // Just the value. WHERE / AS / WITH LABEL / etc. are all consumed
    // uniformly by the outer parseModifiers pass in wrapWithModifiers,
    // which means aggregate + modifier handling is unified with show
    // and WHERE order doesn't matter (`COUNT OF x WHERE y AS number`
    // and `COUNT OF x AS number WHERE y` produce the same AST).
    //
    // The translator's WHERE branch in translateShow detects aggregate
    // values (count/sum/average) and emits the filter-then-aggregate
    // Compact form directly, so there's no semantic loss from hoisting
    // WHERE out of the parser's aggregate sub-parsers.
    return { type: 'count', value: parseValue(p) }
}

/**
 * Wrap a value node with a show node when any modifiers follow at the
 * current parse position; otherwise return the value node unchanged.
 *
 * Used by the aggregate cases of parseExpression so that AS / WITH LABEL
 * / JOINED BY / WHERE / etc. can chain onto a TOTAL/SUM/AVERAGE/COUNT
 * without each sub-parser having to replicate the modifier loop.
 */
function wrapWithModifiers(p, valueNode) {
    const modifiers = parseModifiers(p)
    if (modifiers.length === 0) return valueNode
    return { type: 'show', value: valueNode, modifiers }
}

function parseForEachBody(p) {
    const identTok = peek(p)
    if (!identTok || identTok.type !== 'word') {
        throw new PlainParseError('FOR EACH expects an identifier')
    }
    advance(p)
    const inKw = peekKeyword(p, IN_KEYWORD)
    if (inKw) consumeKeyword(p, inKw)
    const list = parseValue(p)
    const doKw = peekKeyword(p, DO_KEYWORD)
    if (doKw) consumeKeyword(p, doKw)
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
    // Parenthesized boolean sub-expression: recurse into the full
    // condition grammar so `WHERE NOT (draft OR archived)` parses.
    if (t && t.type === 'lparen') {
        advance(p)
        const inner = parseOr(p)
        expect(p, 'rparen')
        return { type: 'group', inner }
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

    if (t.type === 'word') {
        // A word in value position is always an identifier, regardless of
        // whether it would match a keyword phrase elsewhere. The parser
        // only checks for keywords at positions where the grammar expects
        // one (construct start, modifier position, construct sub-keyword
        // positions); here it doesn't, so the word is a variable name.
        advance(p)
        return { type: 'var', path: t.value }
    }

    return null
}
