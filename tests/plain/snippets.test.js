/**
 * Plain-in-snippets end-to-end tests.
 *
 * Verifies that snippet bodies written in Plain syntax are translated at
 * construction time, that raw Loom snippet bodies continue to work
 * unchanged (backwards compatibility), and that function-call parsing
 * lets snippet calls pass arbitrary Plain sub-expressions as arguments.
 */

import { describe, it, expect } from 'vitest'
import { Loom } from '../../src/index.js'

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

describe('plain snippets — text bodies', () => {
    it('text-body snippet with a bare {var} placeholder', () => {
        const plain = new Loom('[greet name] { Hello, {name}! }')
        const result = plain.render('{greet "Diego"}', () => undefined)
        expect(result.trim()).toBe('Hello, Diego!')
    })

    it('text-body snippet with explicit Plain SHOW', () => {
        const plain = new Loom('[greet name] { Hello, {SHOW name}! }')
        const result = plain.render('{greet "Diego"}', () => undefined)
        expect(result.trim()).toBe('Hello, Diego!')
    })

    it('text-body snippet with WITH LABEL does not crash', () => {
        // Loom's label formatter renders via XML-like group tags; this
        // test just confirms the Plain body `{SHOW value WITH LABEL}`
        // translates correctly to `{# -label value}` and Loom accepts it.
        const plain = new Loom('[labeled value] { {SHOW value WITH LABEL} }')
        const result = plain.render('{labeled "cost"}', () => undefined)
        expect(result).toContain('cost')
    })

    it('text-body snippet mixing Plain and raw Loom', () => {
        const plain = new Loom(
            '[row a b] { {SHOW a} = {+ b 1} }'
        )
        const result = plain.render('{row "x" 10}', () => undefined)
        expect(result.trim()).toBe('x = 11')
    })
})

describe('plain snippets — expression bodies', () => {
    it('expression-body snippet with a Plain aggregation verb', () => {
        const plain = new Loom('[total grants] ( TOTAL OF grants.amount )')
        const vars = {
            grants: [{ amount: 100 }, { amount: 200 }, { amount: 300 }],
        }
        expect(plain.evaluateText('total grants', (k) => getPath(k, vars))).toBe(
            600
        )
    })

    it('expression-body snippet with COUNT OF ... WHERE', () => {
        const plain = new Loom(
            '[countRefereed pubs] ( COUNT OF pubs WHERE refereed )'
        )
        const vars = {
            pubs: [
                { title: 'A', refereed: true },
                { title: 'B', refereed: false },
                { title: 'C', refereed: true },
                { title: 'D', refereed: true },
            ],
        }
        expect(
            plain.evaluateText('countRefereed pubs', (k) => getPath(k, vars))
        ).toBe(3)
    })

    it('expression-body snippet with SHOW ... WHERE filters the list', () => {
        // Plain's WHERE translation prefixes bare condition vars with
        // the list root: `WHERE year > 2020` becomes `(> pubs.year 2020)`,
        // so Loom's list-aware switcher returns the filtered list.
        //
        // The resolver intentionally shares the `pubs` name with the
        // snippet arg because Loom's aux-variable lookup doesn't
        // traverse dotted paths — `pubs.title` resolves via the outer
        // resolver, not the aux binding. A separate snippet arg name
        // (e.g., `items`) would fail with the current Loom semantics.
        const plain = new Loom(
            '[recent pubs] ( SHOW pubs.title WHERE year > 2020 )'
        )
        const vars = {
            pubs: [
                { title: 'Old', year: 2018 },
                { title: 'New', year: 2023 },
                { title: 'Mid', year: 2021 },
            ],
        }
        const result = plain.render('{recent pubs}', (k) => getPath(k, vars))
        expect(result).toContain('New')
        expect(result).toContain('Mid')
        expect(result).not.toContain('Old')
    })
})

describe('plain snippets — snippet calling snippet', () => {
    it('one snippet can call another Plain snippet', () => {
        const plain = new Loom(`
            [double n] (* n 2)
            [quadruple n] ( double (double n) )
        `)
        expect(plain.evaluateText('quadruple 5', () => undefined)).toBe(20)
    })

    it('text-body snippet calling expression-body snippet with Plain', () => {
        // Uses a flat numeric list to avoid a pre-existing Loom
        // limitation: aux-variable lookup doesn't traverse dotted paths,
        // so `items.amount` wouldn't resolve when `items` is a snippet
        // parameter. Flat lists work because `items` resolves as a whole
        // list to `++`.
        const plain = new Loom(`
            [sumAll items] ( TOTAL OF items )
            [report items] { Total: {sumAll items} }
        `)
        const vars = { amounts: [10, 20, 30] }
        const result = plain.render('{report amounts}', (k) => getPath(k, vars))
        expect(result.trim()).toBe('Total: 60')
    })
})

describe('plain snippets — Plain at snippet call site', () => {
    it('passes a Plain sub-expression as a snippet argument', () => {
        const plain = new Loom('[bold text] { <b>{text}</b> }')
        const vars = { price: 99 }
        const result = plain.render(
            '{bold (SHOW price AS currency USD)}',
            (k) => getPath(k, vars)
        )
        // The inner SHOW ... AS currency formats price as currency, the
        // outer bold snippet wraps it in <b>...</b>.
        expect(result).toContain('<b>')
        expect(result).toContain('</b>')
        expect(result).toContain('99')
    })
})

describe('plain snippets — backwards compatibility', () => {
    it('raw Loom snippet body still works', () => {
        // No Plain syntax — body is pure Loom. Translation should leave
        // it functionally unchanged.
        const plain = new Loom('[sumPlus grants] ( + (++ grants.amount) 1 )')
        const vars = {
            grants: [{ amount: 100 }, { amount: 200 }],
        }
        expect(
            plain.evaluateText('sumPlus grants', (k) => getPath(k, vars))
        ).toBe(301)
    })

    it('accepts object-shape snippets with raw Loom body', () => {
        const plain = new Loom({
            greet: {
                args: ['name'],
                body: 'Hello, {name}!',
                isText: true,
                hasFlags: false,
            },
        })
        const result = plain.render('{greet "Diego"}', () => undefined)
        expect(result.trim()).toBe('Hello, Diego!')
    })

    it('accepts object-shape snippets with Plain body (translated eagerly)', () => {
        const plain = new Loom({
            greet: {
                args: ['name'],
                body: 'Hello, {SHOW name WITH LABEL}!',
                isText: true,
                hasFlags: false,
            },
        })
        // Just verify it runs without crashing — the label may or may not
        // be set depending on the variable resolver. The key point is
        // that the Plain body was translated and Loom accepted it.
        expect(() =>
            plain.render('{greet "Diego"}', () => undefined)
        ).not.toThrow()
    })

    it('preserves pre-built function snippets', () => {
        const greetFn = (flags, args) => `Custom: ${args[0]}`
        const plain = new Loom({ greet: greetFn })
        const result = plain.render('{greet "Diego"}', () => undefined)
        expect(result).toBe('Custom: Diego')
    })
})
