/**
 * Plain tokenizer.
 *
 * Produces a flat token stream from a Plain expression string (the contents
 * of a single {…} placeholder, with the outer braces already stripped). The
 * tokenizer is permissive: keywords are case-insensitive, multi-word keywords
 * are matched greedily, commas are absorbed, and unrecognized input drops
 * through as identifier tokens for the parser to decide.
 *
 * Token shapes:
 *   { type: 'keyword',    value: 'SHOW' | 'SORTED BY' | ... }
 *   { type: 'operator',   value: '>' | '>=' | '&' | '|' | '!' | ... }
 *   { type: 'identifier', value: 'publications.title' }
 *   { type: 'number',     value: 42 }
 *   { type: 'string',     value: 'Main Address' }       // quotes stripped
 *   { type: 'loom',       value: '{+ 1 2}' }            // passthrough
 *   { type: 'lparen' | 'rparen', value: '(' | ')' }
 */

export { tokenize, KEYWORDS, FORMAT_TYPES }

/**
 * Multi-word keywords first (greedy longest match). Each entry is the
 * lowercase word sequence; the canonical form is the space-joined upper
 * case of the sequence (computed below).
 */
const KEYWORD_PHRASES = [
    ['from', 'lowest', 'to', 'highest'],
    ['from', 'highest', 'to', 'lowest'],
    ['sorted', 'by'],
    ['joined', 'by'],
    ['with', 'label'],
    ['for', 'each'],
    ['total', 'of'],
    ['sum', 'of'],
    ['average', 'of'],
    ['count', 'of'],
    ['show'],
    ['as'],
    ['if'],
    ['then'],
    ['else'],
    ['otherwise'],
    ['where'],
    ['in'],
    ['do'],
    ['ascending'],
    ['descending'],
]

// Sort longest-first so greedy match picks "sorted by" over "sorted".
KEYWORD_PHRASES.sort((a, b) => b.length - a.length)

const KEYWORDS = new Set(KEYWORD_PHRASES.map((w) => w.join(' ').toUpperCase()))

/**
 * Known format types used by AS. Determines whether a bare word after AS is
 * a format type (emitted as a flag) or just part of a phrase like
 * "year only" / "long date".
 */
const FORMAT_TYPES = new Set([
    'date',
    'currency',
    'number',
    'phone',
    'address',
    'email',
    'json',
    'label',
    'text',
    'string',
    'list',
    'object',
    'tag',
])

const TWO_CHAR_OPERATORS = new Set(['>=', '<=', '!=', '==', '&&', '||'])
const ONE_CHAR_OPERATORS = new Set(['+', '-', '*', '/', '%', '=', '<', '>', '!'])

const IDENT_START = /[a-zA-Z_@$?]/
const IDENT_CONT = /[a-zA-Z0-9_.\/@]/
const DIGIT = /[0-9]/

function tokenize(input) {
    const raw = splitRawTokens(input)
    return collapseKeywords(raw)
}

/**
 * First pass: walk the string character-by-character, producing words,
 * numbers, quoted strings, operators, parens, and Loom passthroughs.
 * Whitespace and commas are skipped.
 */
function splitRawTokens(input) {
    const out = []
    const n = input.length
    let i = 0

    while (i < n) {
        const c = input[i]

        if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',') {
            i++
            continue
        }

        // Quoted string
        if (c === '"' || c === "'" || c === '`') {
            const end = findQuoteEnd(input, i, c)
            if (end < 0) throw new Error(`Unterminated string starting at ${i}`)
            out.push({ type: 'string', value: input.slice(i + 1, end) })
            i = end + 1
            continue
        }

        // Loom passthrough: a full `{...}` block is kept verbatim.
        if (c === '{') {
            const end = findMatching(input, i, '{', '}')
            if (end < 0) throw new Error(`Unmatched '{' at ${i}`)
            out.push({ type: 'loom', value: input.slice(i, end + 1) })
            i = end + 1
            continue
        }

        if (c === '(') {
            out.push({ type: 'lparen', value: '(' })
            i++
            continue
        }
        if (c === ')') {
            out.push({ type: 'rparen', value: ')' })
            i++
            continue
        }

        // Number (possibly negative).
        if (DIGIT.test(c) || (c === '-' && DIGIT.test(input[i + 1] || '') && wantsValue(out))) {
            let j = i + (c === '-' ? 1 : 0)
            while (j < n && (DIGIT.test(input[j]) || input[j] === '.')) j++
            out.push({ type: 'number', value: parseFloat(input.slice(i, j)) })
            i = j
            continue
        }

        // Two-char operator
        const two = input.slice(i, i + 2)
        if (TWO_CHAR_OPERATORS.has(two)) {
            out.push({ type: 'operator', value: two })
            i += 2
            continue
        }

        // One-char operator
        if (ONE_CHAR_OPERATORS.has(c)) {
            out.push({ type: 'operator', value: c })
            i++
            continue
        }

        // Identifier (letters, digits, _, ., /, @)
        if (IDENT_START.test(c)) {
            let j = i + 1
            while (j < n && IDENT_CONT.test(input[j])) j++
            out.push({ type: 'word', value: input.slice(i, j) })
            i = j
            continue
        }

        // Unknown character — skip to avoid infinite loops. Callers can
        // fall back to raw Loom if the parser later rejects the result.
        i++
    }

    return out
}

/**
 * A `-` is a unary-minus (part of a negative literal) only if the previous
 * token expects an operator — i.e. it would be the start of a new value.
 */
function wantsValue(out) {
    if (out.length === 0) return true
    const prev = out[out.length - 1]
    if (prev.type === 'operator' || prev.type === 'lparen') return true
    if (prev.type === 'word' && KEYWORDS.has(prev.value.toUpperCase())) return true
    return false
}

function findQuoteEnd(input, start, quote) {
    for (let j = start + 1; j < input.length; j++) {
        if (input[j] === '\\' && j + 1 < input.length) {
            j++
            continue
        }
        if (input[j] === quote) return j
    }
    return -1
}

function findMatching(input, start, open, close) {
    let depth = 0
    for (let j = start; j < input.length; j++) {
        const ch = input[j]
        if (ch === '"' || ch === "'" || ch === '`') {
            const end = findQuoteEnd(input, j, ch)
            if (end < 0) return -1
            j = end
            continue
        }
        if (ch === open) depth++
        else if (ch === close) {
            depth--
            if (depth === 0) return j
        }
    }
    return -1
}

/**
 * Second pass: collapse word sequences into keyword tokens (greedy longest
 * match), resolve single-word keywords (and/or/not -> operators; show/if/...
 * -> keywords), and promote the rest to identifier tokens.
 */
function collapseKeywords(tokens) {
    const out = []
    let i = 0
    const n = tokens.length

    while (i < n) {
        const t = tokens[i]

        if (t.type !== 'word') {
            out.push(t)
            i++
            continue
        }

        const matched = matchPhrase(tokens, i)
        if (matched) {
            out.push({ type: 'keyword', value: matched.canonical })
            i += matched.length
            continue
        }

        const lower = t.value.toLowerCase()
        if (lower === 'and') {
            out.push({ type: 'operator', value: '&' })
            i++
            continue
        }
        if (lower === 'or') {
            out.push({ type: 'operator', value: '|' })
            i++
            continue
        }
        if (lower === 'not') {
            out.push({ type: 'operator', value: '!' })
            i++
            continue
        }

        out.push({ type: 'identifier', value: t.value })
        i++
    }

    return out
}

function matchPhrase(tokens, start) {
    for (const phrase of KEYWORD_PHRASES) {
        if (start + phrase.length > tokens.length) continue
        let ok = true
        for (let k = 0; k < phrase.length; k++) {
            const tk = tokens[start + k]
            if (tk.type !== 'word' || tk.value.toLowerCase() !== phrase[k]) {
                ok = false
                break
            }
        }
        if (ok) {
            return {
                canonical: phrase.join(' ').toUpperCase(),
                length: phrase.length,
            }
        }
    }
    return null
}
