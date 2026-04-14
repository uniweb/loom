import { describe, it, expect } from 'vitest'
import { tokenize, matchKeywordAt } from '../../src/plain/tokenizer.js'

function types(tokens) {
    return tokens.map((t) => t.type)
}

function values(tokens) {
    return tokens.map((t) => t.value)
}

// -----------------------------------------------------------------------------
// The tokenizer deliberately does NOT pre-classify words as keywords vs
// identifiers — that's a parse-time, position-aware decision. Every
// identifier-like token comes out as type 'word' with its original casing.
// Keyword recognition is tested via matchKeywordAt, which is what the
// parser calls at each grammar position.
// -----------------------------------------------------------------------------

describe('plain tokenizer — words', () => {
    it('emits raw words for identifier-like tokens', () => {
        const t = tokenize('publications.title')
        expect(t).toEqual([{ type: 'word', value: 'publications.title' }])
    })

    it('preserves original casing of words', () => {
        // Case is preserved so the parser (or matchKeywordAt) can make
        // case-informed decisions. Today the match is case-insensitive.
        for (const form of ['SHOW', 'show', 'Show']) {
            const t = tokenize(form)
            expect(t).toEqual([{ type: 'word', value: form }])
        }
    })

    it('multi-word keyword phrases are not collapsed at tokenize time', () => {
        // `SORTED BY` is a phrase at parse time, but each word is a
        // separate token — the parser decides whether they form a keyword.
        const t = tokenize('SORTED BY date')
        expect(types(t)).toEqual(['word', 'word', 'word'])
        expect(values(t)).toEqual(['SORTED', 'BY', 'date'])
    })
})

describe('plain tokenizer — atoms', () => {
    it('tokenizes numbers', () => {
        const t = tokenize('42 3.14')
        expect(types(t)).toEqual(['number', 'number'])
        expect(values(t)).toEqual([42, 3.14])
    })

    it('tokenizes quoted strings', () => {
        const t = tokenize('"hello" \'world\'')
        expect(types(t)).toEqual(['string', 'string'])
        expect(values(t)).toEqual(['hello', 'world'])
    })

    it('drops commas', () => {
        const t = tokenize('a, b, c')
        expect(values(t)).toEqual(['a', 'b', 'c'])
    })
})

describe('plain tokenizer — operators', () => {
    it('tokenizes comparison operators', () => {
        const t = tokenize('a >= b')
        expect(types(t)).toEqual(['word', 'operator', 'word'])
        expect(t[1].value).toBe('>=')
    })

    it('maps and/or/not to & | !', () => {
        const t = tokenize('a AND b OR NOT c')
        const ops = t.filter((x) => x.type === 'operator').map((x) => x.value)
        expect(ops).toEqual(['&', '|', '!'])
    })

    it('treats - between values as operator', () => {
        const t = tokenize('a - b')
        expect(t[1]).toEqual({ type: 'operator', value: '-' })
    })

    it('treats -5 after a keyword-looking word as negative number', () => {
        // The unary-minus heuristic consults the full keyword phrase set
        // so a `-` right after a word like `SHOW` introduces a negative
        // number literal rather than becoming a binary operator.
        const t = tokenize('SHOW -5')
        expect(t[0]).toEqual({ type: 'word', value: 'SHOW' })
        expect(t[1]).toEqual({ type: 'number', value: -5 })
    })
})

describe('plain tokenizer — Loom passthrough', () => {
    it('captures balanced {…} as a loom token', () => {
        const t = tokenize('{+ 1 2}')
        expect(t).toEqual([{ type: 'loom', value: '{+ 1 2}' }])
    })

    it('handles nested braces inside loom passthrough', () => {
        const t = tokenize('{++ {+ 1 2} 3}')
        expect(t).toHaveLength(1)
        expect(t[0].type).toBe('loom')
        expect(t[0].value).toBe('{++ {+ 1 2} 3}')
    })
})

describe('plain tokenizer — parens', () => {
    it('emits lparen/rparen tokens', () => {
        const t = tokenize('(a OR b)')
        expect(types(t)).toEqual(['lparen', 'word', 'operator', 'word', 'rparen'])
    })
})

describe('matchKeywordAt — position-aware keyword lookup', () => {
    // matchKeywordAt is what the parser uses to recognize keywords at
    // each grammar position. Each call passes a position-specific
    // allowed phrase set; the helper does a case-insensitive comparison
    // against those phrases and returns a canonical uppercase match
    // (or null when nothing applies). A word token not found in the
    // allowed set is left alone — that's the mechanism that lets user
    // variables named `show` or `where` be identifiers in value
    // positions without colliding with the keyword interpretation.

    const SHOW_PHRASE = [['show']]
    const SORTED_BY_PHRASE = [['sorted', 'by']]
    const FLTH_PHRASE = [['from', 'lowest', 'to', 'highest']]

    it('matches single-word phrase case-insensitively', () => {
        for (const form of ['SHOW x', 'show x', 'Show x']) {
            const tokens = tokenize(form)
            const m = matchKeywordAt(tokens, 0, SHOW_PHRASE)
            expect(m).toEqual({ canonical: 'SHOW', length: 1 })
        }
    })

    it('matches multi-word phrase across adjacent word tokens', () => {
        const tokens = tokenize('SORTED BY date')
        const m = matchKeywordAt(tokens, 0, SORTED_BY_PHRASE)
        expect(m).toEqual({ canonical: 'SORTED BY', length: 2 })
    })

    it('matches long phrase (FROM LOWEST TO HIGHEST)', () => {
        const tokens = tokenize('FROM LOWEST TO HIGHEST date')
        const m = matchKeywordAt(tokens, 0, FLTH_PHRASE)
        expect(m).toEqual({ canonical: 'FROM LOWEST TO HIGHEST', length: 4 })
    })

    it('returns null when the allowed set does not contain the word', () => {
        const tokens = tokenize('WHERE x')
        const m = matchKeywordAt(tokens, 0, SHOW_PHRASE)
        expect(m).toBe(null)
    })

    it('returns null when the phrase runs past the end of input', () => {
        const tokens = tokenize('SORTED')
        const m = matchKeywordAt(tokens, 0, SORTED_BY_PHRASE)
        expect(m).toBe(null)
    })

    it('accepts a non-zero starting index', () => {
        const tokens = tokenize('pubs SORTED BY year')
        const m = matchKeywordAt(tokens, 1, SORTED_BY_PHRASE)
        expect(m).toEqual({ canonical: 'SORTED BY', length: 2 })
    })
})
