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
        // `grants` here is a list of non-empty objects. ++!! treats them
        // as truthy, so COUNT OF returns 3. An empty-object list would
        // return 0 under Loom's isFalsy semantics — that's a design
        // tradeoff around truthiness, not an aggregation bug.
        expect(evaluate('COUNT OF grants', { grants })).toBe(3)
    })

    // Regression: WHERE on COUNT OF filters the source list by per-
    // element condition. These locked in the pre-session behavior so
    // the aggregate-modifier unification can't silently regress them.

    it('COUNT OF ... WHERE bare condition counts truthy values', () => {
        const pubs = [
            { refereed: true },
            { refereed: false },
            { refereed: true },
        ]
        expect(evaluate('COUNT OF pubs WHERE refereed', { pubs })).toBe(2)
    })

    it('COUNT OF ... WHERE comparison condition', () => {
        const pubs = [{ year: 2019 }, { year: 2023 }, { year: 2024 }]
        expect(evaluate('COUNT OF pubs WHERE year > 2020', { pubs })).toBe(2)
    })

    // New capability: modifiers on aggregates. Before position-aware
    // matching work, the parser's aggregate branches returned raw
    // count/sum/average nodes without calling parseModifiers, so AS /
    // WITH LABEL / and friends after an aggregate were left as
    // unconsumed trailing tokens, throwing and falling back to a
    // broken LoomCore path.

    it('COUNT OF ... AS number format', () => {
        const pubs = [{ year: 2019 }, { year: 2023 }, { year: 2024 }]
        const r = render('{COUNT OF pubs WHERE year > 2020 AS number}', { pubs })
        expect(r).toContain('2')
    })

    it('TOTAL OF ... WITH LABEL renders the labeled total', () => {
        const grants = [{ amount: 100 }, { amount: 200 }, { amount: 300 }]
        const r = render('{TOTAL OF grants.amount WITH LABEL "Total"}', { grants })
        expect(r).toContain('Total')
        expect(r).toContain('600')
    })

    it('SUM OF ... WHERE filters the source list before summing', () => {
        // New behavior: WHERE on SUM/TOTAL/AVERAGE is rewritten as a
        // filter-then-aggregate rather than wrap-sum-in-ternary. The
        // sum of { amount WHERE active } is the sum of active amounts.
        const grants = [
            { amount: 100, active: true },
            { amount: 200, active: false },
            { amount: 300, active: true },
        ]
        expect(evaluate('SUM OF grants.amount WHERE active', { grants })).toBe(400)
    })

    it('SUM OF ... WHERE combined with AS currency', () => {
        const grants = [
            { amount: 100, active: true },
            { amount: 200, active: false },
            { amount: 300, active: true },
        ]
        const r = render(
            '{SUM OF grants.amount WHERE active AS currency USD}',
            { grants },
        )
        expect(r).toContain('400')
    })

    it('AVERAGE OF ... WHERE filters the source list before averaging', () => {
        const pubs = [
            { year: 2018, refereed: true },
            { year: 2020, refereed: false },
            { year: 2024, refereed: true },
        ]
        // Average of the years where refereed is true: (2018 + 2024) / 2 = 2021
        expect(evaluate('AVERAGE OF pubs.year WHERE refereed', { pubs })).toBe(2021)
    })

    it('WHERE order on aggregates does not affect the result', () => {
        // Modifier ordering is irrelevant: WHERE is always applied first
        // via translator pre-pass, so AS / WITH LABEL always wraps the
        // filter-then-aggregate result regardless of source-text order.
        const pubs = [
            { year: 2018, refereed: true },
            { year: 2020, refereed: false },
            { year: 2024, refereed: true },
        ]
        const whereFirst = render(
            '{COUNT OF pubs WHERE refereed AS number}', { pubs }
        )
        const asFirst = render(
            '{COUNT OF pubs AS number WHERE refereed}', { pubs }
        )
        expect(whereFirst).toBe(asFirst)
        expect(whereFirst).toContain('2')
    })
})

// -----------------------------------------------------------------------------
// WHERE NOT — list-aware negation filter
// -----------------------------------------------------------------------------
//
// `WHERE NOT x` compiles to `(? (! list.x) list.field)` via the Plain
// translator's existing `NOT` → `(!)` mapping. `!` is a list-aware
// unary operator (see the `unary` category in core/functions.js and
// tests/engine.test.js for its scalar + list-aware behavior). The
// end-to-end tests below lock in `WHERE NOT …` against the kinds of
// mixed database-shape values that motivated the fix:
//
//   true, false, 0, 1, "Y", "N", null, "", undefined
//
// Real report templates see all of these depending on the DB driver.
// Per-element isFalsy is the only semantics that correctly classifies
// all of them for a "WHERE NOT draft"-style filter.

describe('plain engine — WHERE NOT', () => {
    const mixed = [
        { title: 'A', draft: true },
        { title: 'B', draft: false },
        { title: 'C', draft: 0 },
        { title: 'D', draft: 1 },
        { title: 'E', draft: 'Y' },
        { title: 'F', draft: '' },
        { title: 'G', draft: null },
        { title: 'H' }, // missing
    ]

    it('SHOW … WHERE NOT x filters out every isFalsy shape', () => {
        // Non-drafts (per isFalsy): B(false), C(0), F(""), G(null), H(missing)
        // Drafts: A(true), D(1), E("Y" — non-empty string is truthy)
        const r = render('{SHOW pubs.title WHERE NOT draft}', { pubs: mixed })
        expect(r).toBe('B, C, F, G, H')
    })

    it('COUNT OF … WHERE NOT x counts the isFalsy items', () => {
        expect(evaluate('COUNT OF pubs WHERE NOT draft', { pubs: mixed })).toBe(5)
    })

    it('WHERE NOT x AND y combines element-wise', () => {
        const pubs = [
            { t: 'A', draft: true, refereed: true },
            { t: 'B', draft: false, refereed: true },
            { t: 'C', draft: false, refereed: false },
            { t: 'D', draft: true, refereed: false },
        ]
        // Not drafts and refereed → only B.
        expect(render('{SHOW pubs.t WHERE NOT draft AND refereed}', { pubs })).toBe('B')
    })

    it('de Morgan: NOT a AND NOT b  ===  NOT (a OR b)', () => {
        const pubs = [
            { t: 'A', draft: true, refereed: true },
            { t: 'B', draft: false, refereed: true },
            { t: 'C', draft: false, refereed: false },
            { t: 'D', draft: true, refereed: false },
        ]
        // Not a draft AND not refereed — only C.
        expect(
            render('{SHOW pubs.t WHERE NOT draft AND NOT refereed}', { pubs }),
        ).toBe('C')
        // Not a draft OR not refereed — B, C, D.
        expect(
            render('{SHOW pubs.t WHERE NOT draft OR NOT refereed}', { pubs }),
        ).toBe('B, C, D')
    })

    it('WHERE NOT works with a comparison on the left', () => {
        const pubs = [{ year: 2018 }, { year: 2023 }, { year: 2024 }]
        // "Not recent" = not (year > 2020) = 2018 only.
        expect(evaluate('COUNT OF pubs WHERE NOT year > 2020', { pubs })).toBe(1)
    })
})

describe('plain engine — loom passthrough', () => {
    it('raw Loom placeholder still works', () => {
        expect(render('{+ a b}', { a: 2, b: 3 })).toBe('5')
    })

    // Regression: Compact expressions using operators outside Plain's
    // operator set (`#`, `~`, `^`, `\`, `<>`, `@` in special positions)
    // must fall through to LoomCore unchanged. The tokenizer emits
    // `unknown` tokens for these characters, the Plain parser rejects,
    // and `Loom.translateExpression` catches and returns the original
    // input verbatim. Before the fix, the tokenizer silently dropped
    // unknown chars and the parser happily mis-parsed the remaining
    // tokens, producing wrong output.

    it('Compact range (~ …) at top level renders correctly', () => {
        const r = render('{# (~ start_date end_date)}', {
            start_date: '2000/01/02',
            end_date: '2010/12/31',
        })
        expect(r).toContain('2000')
        expect(r).toContain('2010')
    })

    it('Compact # at the start of a placeholder renders correctly', () => {
        // `# -date=long` is a Compact-form format call. Plain's
        // tokenizer doesn't recognize `#`, so the whole expression
        // falls through to LoomCore.
        const r = render('{# -date=long start_date}', { start_date: '2000/01/15' })
        expect(r).toBe('January 15, 2000')
    })

    it('Compact matrix (^ -sz=2 …) falls through without corruption', () => {
        const r = render('{# -json (^ -sz=2 "a" "b")}', {})
        // Before the fix, `^` was silently dropped and the resulting
        // token stream parsed as a bogus function call. After the fix,
        // LoomCore evaluates the Compact expression correctly.
        expect(r).toContain('[')
        expect(r).toContain('"a"')
        expect(r).toContain('"b"')
    })

    it('mixed plain and raw loom in the same template', () => {
        const tmpl = 'Sum: {+ a b}, Shown: {SHOW name}'
        expect(render(tmpl, { a: 1, b: 2, name: 'Diego' })).toBe('Sum: 3, Shown: Diego')
    })

    // A Compact sub-expression nested inside a Plain construct must be
    // safely embedded as a single atomic argument when a modifier wraps
    // it. Multi-token inners (like `+ 1 2`) get parenthesized; single-
    // token inners (like `{name}`) stay bare because LoomCore parses
    // `(name)` as a function call to `name`, not as a grouped identifier.

    it('multi-token loom passthrough inside SHOW + WITH LABEL', () => {
        // `{+ 1 2}` is a Compact sum embedded in a Plain SHOW, then
        // wrapped with a label. The translator must wrap the `+ 1 2`
        // in parens or the label function sees three separate args.
        const result = render('{SHOW {+ 1 2} WITH LABEL "Sum"}')
        expect(result).toContain('Sum')
        expect(result).toContain('3')
    })

    it('multi-token loom passthrough with quoted-string token', () => {
        // `+? "Dr. " title` has quoted-string content with internal
        // whitespace — the wrap detector must NOT count string-internal
        // whitespace as a reason to wrap, but the top-level whitespace
        // between `+?`, the string, and `title` IS a reason to wrap.
        const result = render(
            '{SHOW {+? "Dr. " title} WITH LABEL "Name"}',
            { title: 'Smith' },
        )
        expect(result).toContain('Name')
        expect(result).toContain('Dr. Smith')
    })

    it('single-token loom passthrough stays bare inside SHOW + WITH LABEL', () => {
        // Regression: `{name}` with a label must still work. A refactor
        // that unconditionally wraps loom inners in parens would break
        // this because `(name)` parses as a function call in LoomCore.
        const result = render(
            '{SHOW {name} WITH LABEL "Name"}',
            { name: 'Diego' },
        )
        expect(result).toContain('Name')
        expect(result).toContain('Diego')
    })

    it('already-parenthesized loom inner stays as-is', () => {
        // `{(+ 1 2)}` — the inner is already `(+ 1 2)` after stripping
        // the loom braces. Top-level whitespace is inside the parens
        // (depth > 0), so the detector says "don't wrap". Parent
        // embedding still works.
        const result = render('{SHOW {(+ 1 2)} WITH LABEL "Sum"}')
        expect(result).toContain('Sum')
        expect(result).toContain('3')
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
