/**
 * Plain tokenizer.
 *
 * Produces a flat token stream from a Plain expression string (the contents
 * of a single {…} placeholder, with the outer braces already stripped).
 *
 * The tokenizer deliberately does NOT pre-classify identifier-like tokens
 * as keywords vs identifiers. Every word comes out as a generic `word`
 * token, and the parser decides — based on its current grammar position —
 * whether a given word is a keyword (a construct verb, a modifier, a
 * sub-keyword) or an identifier (variable or function name). This is
 * position-aware keyword recognition: keywords only "win" in positions
 * where the grammar actually expects one, so user variables and functions
 * that happen to share a name with a Plain keyword don't get silently
 * reinterpreted in positions that can't accept a keyword anyway.
 *
 * The `and`/`or`/`not` → `&`/`|`/`!` mapping is kept at tokenizer level
 * because those produce operators (not keywords) and operators have the
 * same meaning at every position they're allowed. That's scoped separately
 * from the keyword work.
 *
 * Token shapes:
 *   { type: 'word',       value: 'SHOW' | 'publications.title' | ... }
 *     // Raw verbatim word — original case preserved. The parser's
 *     // keyword lookup compares case-insensitively.
 *   { type: 'operator',   value: '>' | '>=' | '&' | '|' | '!' | ... }
 *   { type: 'number',     value: 42 }
 *   { type: 'string',     value: 'Main Address' }       // quotes stripped
 *   { type: 'loom',       value: '{+ 1 2}' }            // passthrough
 *   { type: 'lparen' | 'rparen', value: '(' | ')' }
 */

export { tokenize, KEYWORD_PHRASES, KEYWORDS, FORMAT_TYPES }

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
    return splitRawTokens(input)
}

/**
 * Walk the string character-by-character, producing words, numbers,
 * quoted strings, operators, parens, and Loom passthroughs. Whitespace
 * and commas are skipped. No keyword classification — every raw word
 * is emitted as a `word` token for the parser to interpret based on
 * grammar position.
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

        // Word (letters, digits, _, ., /, @). A word might be a Plain
        // keyword, a logical operator spelled as English (and/or/not),
        // an identifier, or a variable path. The parser decides based
        // on grammar position; the only per-word rewrite we do here is
        // and/or/not → `&`/`|`/`!`, because those produce operators
        // (not keywords) and operators have position-independent meaning.
        if (IDENT_START.test(c)) {
            let j = i + 1
            while (j < n && IDENT_CONT.test(input[j])) j++
            const raw = input.slice(i, j)
            const lower = raw.toLowerCase()
            if (lower === 'and') {
                out.push({ type: 'operator', value: '&' })
            } else if (lower === 'or') {
                out.push({ type: 'operator', value: '|' })
            } else if (lower === 'not') {
                out.push({ type: 'operator', value: '!' })
            } else {
                out.push({ type: 'word', value: raw })
            }
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
 * token expects a value next. That includes: start of input, just after an
 * operator, just after `(`, and just after a word that matches any known
 * keyword phrase (e.g., `SHOW -5` — the `SHOW` word is a construct keyword
 * in the grammar, and the `-5` is its value argument).
 *
 * This uses the full KEYWORDS set rather than a position-specific subset
 * because wantsValue is a heuristic, not part of the grammar. A false
 * positive here just means the parser gets a negative number where it
 * might have been able to reject a minus; it won't cause silent
 * mistranslation.
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
 * Position-aware keyword lookup — used by the parser, not the tokenizer.
 *
 * Attempts to match a keyword phrase at the given token index against an
 * allowed subset of phrases. Returns `{ canonical, length }` on a greedy
 * longest match, or null if nothing in the allowed set matches.
 *
 * The parser calls this with a position-specific allowed set (e.g.,
 * construct keywords at expression start, modifier keywords after a
 * value, sub-keywords like THEN/ELSE inside an IF). A word that would
 * match a keyword phrase in a different position is left alone — it
 * gets consumed as an identifier when the parser asks for a value.
 *
 * Comparison is case-insensitive. The canonical return value is the
 * uppercase space-joined phrase (e.g., `SORTED BY`).
 */
function matchKeywordAt(tokens, start, allowedPhrases) {
    for (const phrase of allowedPhrases) {
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

export { matchKeywordAt }
