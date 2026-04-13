/**
 * End-to-end tests: Plain template string → rendered output.
 *
 * Validates the full pipeline (tokenize → parse → translate → Loom evaluate)
 * for every row of the translation table in kb/plans/plain.md plus the
 * composition examples, plus the two legacy fixtures ported from
 * /Users/dmac/Proximify/unirepo/js/tools/unitTests/tests/plain/.
 */

import { describe, it, expect } from 'vitest'
import { Plain } from '../../src/plain/index.js'

function render(template, vars = {}) {
    const plain = new Plain()
    return plain.render(template, (key) => getPath(key, vars))
}

function evaluate(expr, vars = {}) {
    const plain = new Plain()
    return plain.evaluateText(expr, (key) => getPath(key, vars))
}

/**
 * Minimal dotted-path lookup so the test variable shape matches Loom's
 * expectation (a function from key → value). Loom also supports list
 * distribution through dot notation, but here we just handle simple dotted
 * access plus list-awareness for `list.prop`.
 */
function getPath(key, vars) {
    const parts = key.split('.')
    let cur = vars
    for (let i = 0; i < parts.length; i++) {
        if (cur == null) return undefined
        if (Array.isArray(cur)) {
            const rest = parts.slice(i).join('.')
            return cur.map((item) => getPath(rest, item))
        }
        cur = cur[parts[i]]
    }
    return cur
}

// -----------------------------------------------------------------------------
// Ported legacy fixtures
// -----------------------------------------------------------------------------

describe('plain engine — ported legacy fixtures', () => {
    const publication = { title: 'Gattaca', release_date: '1997/08/24' }

    it('basics: bare and explicit SHOW render the same', () => {
        const r1 = render('The title is: {SHOW publication.title}', { publication })
        const r2 = render('The title is: {publication.title}', { publication })
        expect(r1).toBe('The title is: Gattaca')
        expect(r2).toBe('The title is: Gattaca')
    })

    const movies = [
        { title: 'Gattaca', release_date: '1997/08/24' },
        { title: 'The Thirteenth Floor', release_date: '1999/11/25' },
        { title: 'The Matrix', release_date: '1999/03/24' },
    ]

    it('lists: SHOW movies.title yields all titles', () => {
        const r = render('{SHOW movies.title}', { movies })
        // Loom joins list results with ", " by default when rendered in a
        // placeholder context.
        expect(r).toContain('Gattaca')
        expect(r).toContain('The Matrix')
        expect(r).toContain('The Thirteenth Floor')
    })

    it('lists: SORTED BY publications.release_date ASCENDING', () => {
        const r = render(
            '{SHOW movies.title SORTED BY movies.release_date ASCENDING}',
            { movies }
        )
        // Gattaca (1997) should precede the two 1999 films.
        const gattacaIdx = r.indexOf('Gattaca')
        const matrixIdx = r.indexOf('The Matrix')
        const thirteenthIdx = r.indexOf('The Thirteenth Floor')
        expect(gattacaIdx).toBeGreaterThanOrEqual(0)
        expect(gattacaIdx).toBeLessThan(matrixIdx)
        expect(gattacaIdx).toBeLessThan(thirteenthIdx)
    })
})

// -----------------------------------------------------------------------------
// Translation-table coverage (end-to-end render)
// -----------------------------------------------------------------------------

describe('plain engine — basic SHOW', () => {
    it('bare variable', () => {
        expect(render('{x}', { x: 'hello' })).toBe('hello')
    })

    it('explicit SHOW', () => {
        expect(render('{SHOW x}', { x: 'hello' })).toBe('hello')
    })

    it('template mixes plain text and placeholders', () => {
        expect(render('Hello {name}!', { name: 'Diego' })).toBe('Hello Diego!')
    })
})

describe('plain engine — conditionals', () => {
    it('IF ... SHOW ... OTHERWISE SHOW ...', () => {
        expect(render('{IF adult SHOW "A" OTHERWISE SHOW "M"}', { adult: true })).toBe('A')
        expect(render('{IF adult SHOW "A" OTHERWISE SHOW "M"}', { adult: false })).toBe('M')
    })

    it('IF with comparison', () => {
        const tmpl = '{IF age >= 18 SHOW "Adult" OTHERWISE SHOW "Minor"}'
        expect(render(tmpl, { age: 20 })).toBe('Adult')
        expect(render(tmpl, { age: 10 })).toBe('Minor')
    })

    it('IF / THEN / ELSE', () => {
        const tmpl = '{IF age >= 18 THEN "Adult" ELSE "Minor"}'
        expect(render(tmpl, { age: 20 })).toBe('Adult')
    })
})

describe('plain engine — aggregation', () => {
    const grants = [{ amount: 100 }, { amount: 200 }, { amount: 300 }]

    it('TOTAL OF', () => {
        expect(evaluate('TOTAL OF grants.amount', { grants })).toBe(600)
    })

    it('SUM OF', () => {
        expect(evaluate('SUM OF grants.amount', { grants })).toBe(600)
    })

    it('AVERAGE OF', () => {
        expect(evaluate('AVERAGE OF grants.amount', { grants })).toBe(200)
    })

    it('COUNT OF', () => {
        expect(evaluate('COUNT OF grants', { grants })).toBe(3)
    })
})

describe('plain engine — loom passthrough', () => {
    it('raw Loom placeholder still works', () => {
        expect(render('{+ a b}', { a: 2, b: 3 })).toBe('5')
    })

    it('mixed plain and raw loom in the same template', () => {
        const tmpl = 'Sum: {+ a b}, Shown: {SHOW name}'
        expect(render(tmpl, { a: 1, b: 2, name: 'Diego' })).toBe('Sum: 3, Shown: Diego')
    })
})

describe('plain engine — fallback on parse failure', () => {
    it('unknown verb falls through to Loom', () => {
        // "zz" isn't a Plain keyword or a Loom function; result is falsy.
        // The important thing is we don't crash.
        expect(() => render('{zz}', {})).not.toThrow()
    })
})
