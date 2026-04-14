/**
 * End-to-end tests: Plain template string → rendered output.
 *
 * Validates the full pipeline (tokenize → parse → translate → Loom evaluate)
 * for every row of the translation table in kb/plans/plain.md plus the
 * composition examples, plus the two legacy fixtures ported from
 * /Users/dmac/Proximify/unirepo/js/tools/unitTests/tests/plain/.
 */

import { describe, it, expect } from 'vitest'
import { Loom } from '../../src/index.js'

function render(template, vars = {}) {
    const plain = new Loom()
    return plain.render(template, (key) => getPath(key, vars))
}

function evaluate(expr, vars = {}) {
    const plain = new Loom()
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

// -----------------------------------------------------------------------------
// Keyword shadowing — regression coverage for position-aware matching
// -----------------------------------------------------------------------------
//
// Before position-aware matching landed, the tokenizer classified every word
// that matched a keyword phrase as a keyword eagerly, and user variables that
// shadowed single-word keywords (`show`, `where`, `if`, etc.) worked only by
// accident — the parser threw, the engine caught, and the raw input fell
// through to LoomCore's Compact-form evaluator.
//
// These tests lock in the behavior so the position-aware refactor can't
// silently regress it. They should pass both before and after the refactor,
// but the mechanism changes: the refactor makes them work through the
// principled "a word in a value position is an identifier" rule rather than
// through the throw-and-fallback path.

describe('plain engine — keyword shadowing', () => {
    const shadowVars = {
        show: 'SHOWVAL',
        where: 'WHEREVAL',
        count: 42,
        total: 100,
        sum: 'SUMVAL',
        if: 'IFVAL',
        then: 'THENVAL',
        else: 'ELSEVAL',
        otherwise: 'OTHVAL',
        in: 'INVAL',
        as: 'ASVAL',
        ascending: 'ASCVAL',
        descending: 'DESCVAL',
    }

    it('bare single-word keyword variables resolve to their value', () => {
        expect(render('{show}', shadowVars)).toBe('SHOWVAL')
        expect(render('{where}', shadowVars)).toBe('WHEREVAL')
        expect(render('{count}', shadowVars)).toBe('42')
        expect(render('{total}', shadowVars)).toBe('100')
        expect(render('{sum}', shadowVars)).toBe('SUMVAL')
        expect(render('{if}', shadowVars)).toBe('IFVAL')
        expect(render('{then}', shadowVars)).toBe('THENVAL')
        expect(render('{else}', shadowVars)).toBe('ELSEVAL')
        expect(render('{otherwise}', shadowVars)).toBe('OTHVAL')
        expect(render('{in}', shadowVars)).toBe('INVAL')
        expect(render('{as}', shadowVars)).toBe('ASVAL')
        expect(render('{ascending}', shadowVars)).toBe('ASCVAL')
        expect(render('{descending}', shadowVars)).toBe('DESCVAL')
    })

    it('multi-word keyword prefixes require their continuation', () => {
        // `count` alone is a variable; `count of <list>` is the aggregation
        // keyword. The distinction is syntactic, not contractual — `count`
        // can't match `count of` without a following `of` token.
        expect(render('{count}', { count: 7 })).toBe('7')
        expect(
            render('{COUNT OF pubs}', {
                pubs: [{ refereed: true }, { refereed: false }],
            }),
        ).toBe('2')
        expect(render('{total}', { total: 50 })).toBe('50')
        expect(
            render('{TOTAL OF xs}', { xs: [1, 2, 3] }),
        ).toBe('6')
    })

    it('SHOW with a shadowed identifier renders the variable', () => {
        expect(render('{SHOW count}', { count: 42 })).toBe('42')
        expect(render('{SHOW title}', { title: 'Hello' })).toBe('Hello')
    })

    it('dotted paths with keyword tails work as variable access', () => {
        // The whole dotted path is one identifier token; the fact that the
        // tail segment matches a keyword phrase is irrelevant.
        expect(render('{person.count}', { person: { count: 7 } })).toBe('7')
        expect(render('{person.show}', { person: { show: 'x' } })).toBe('x')
        expect(render('{person.where}', { person: { where: 'home' } })).toBe('home')
    })

    it('function calls with non-keyword names work', () => {
        // Plain's function-call syntax is `{name arg1 arg2}`. Names that
        // don't collide with single-word keywords (most user-chosen names,
        // including `count` since it's only a keyword as `count of`) parse
        // as function calls cleanly.
        const loom = new Loom({}, {
            greet: (flags, val) => `Hi, ${val}!`,
            count: (flags, val) => `[count:${val}]`,
        })
        expect(loom.render('{greet "Diego"}', () => undefined)).toBe('Hi, Diego!')
        expect(loom.render('{count "x"}', () => undefined)).toBe('[count:x]')
    })

    it('modifier keywords in modifier position still parse as keywords', () => {
        const vars = {
            pubs: [
                { title: 'A', year: 2018 },
                { title: 'B', year: 2022 },
                { title: 'C', year: 2024 },
            ],
        }
        expect(render('{pubs.title SORTED BY year}', vars)).toBe('A, B, C')
    })
})
