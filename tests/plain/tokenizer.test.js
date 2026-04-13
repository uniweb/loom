import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/plain/tokenizer.js'

function types(tokens) {
    return tokens.map((t) => t.type)
}

function values(tokens) {
    return tokens.map((t) => t.value)
}

describe('plain tokenizer — keywords', () => {
    it('recognizes single-word keywords case-insensitively', () => {
        for (const form of ['SHOW x', 'show x', 'Show x']) {
            const t = tokenize(form)
            expect(t[0]).toEqual({ type: 'keyword', value: 'SHOW' })
            expect(t[1]).toEqual({ type: 'identifier', value: 'x' })
        }
    })

    it('collapses multi-word keywords greedily', () => {
        const t = tokenize('SORTED BY date')
        expect(t[0]).toEqual({ type: 'keyword', value: 'SORTED BY' })
        expect(t[1]).toEqual({ type: 'identifier', value: 'date' })
    })

    it('matches longest phrase (FROM LOWEST TO HIGHEST)', () => {
        const t = tokenize('FROM LOWEST TO HIGHEST date')
        expect(t[0]).toEqual({ type: 'keyword', value: 'FROM LOWEST TO HIGHEST' })
    })

    it('handles mixed case in multi-word keywords', () => {
        const t = tokenize('Sorted By date')
        expect(t[0].type).toBe('keyword')
        expect(t[0].value).toBe('SORTED BY')
    })
})

describe('plain tokenizer — atoms', () => {
    it('tokenizes dotted identifiers', () => {
        const t = tokenize('publications.title')
        expect(t).toEqual([{ type: 'identifier', value: 'publications.title' }])
    })

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
        expect(t.map((x) => x.type)).toEqual(['identifier', 'operator', 'identifier'])
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

    it('treats -5 after keyword as negative number', () => {
        const t = tokenize('SHOW -5')
        expect(t[0].type).toBe('keyword')
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
        expect(types(t)).toEqual(['lparen', 'identifier', 'operator', 'identifier', 'rparen'])
    })
})
