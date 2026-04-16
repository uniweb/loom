import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/plain/tokenizer.js'
import { parse } from '../../src/plain/parser.js'

const P = (src) => parse(tokenize(src))

describe('plain parser — show', () => {
    it('parses bare value as implicit show', () => {
        const ast = P('publication.title')
        expect(ast).toEqual({
            type: 'show',
            value: { type: 'var', path: 'publication.title' },
            modifiers: [],
        })
    })

    it('parses explicit SHOW', () => {
        const ast = P('SHOW publication.title')
        expect(ast.type).toBe('show')
        expect(ast.value.path).toBe('publication.title')
        expect(ast.modifiers).toEqual([])
    })

    it('parses SHOW with AS modifier (bare word)', () => {
        const ast = P('SHOW publication.date AS long date')
        expect(ast.modifiers).toEqual([
            { type: 'as', format: { type: 'date', value: 'long' } },
        ])
    })

    it('parses AS currency USD', () => {
        const ast = P('SHOW price AS currency USD')
        expect(ast.modifiers[0].format).toEqual({ type: 'currency', value: 'usd' })
    })

    it('parses AS with just a type', () => {
        const ast = P('SHOW x AS phone')
        expect(ast.modifiers[0].format).toEqual({ type: 'phone', value: null })
    })

    it('parses WITH LABEL alone', () => {
        const ast = P('SHOW price WITH LABEL')
        expect(ast.modifiers).toEqual([{ type: 'withLabel', label: null }])
    })

    it('parses WITH LABEL "custom"', () => {
        const ast = P('SHOW price WITH LABEL "Cost"')
        expect(ast.modifiers[0]).toEqual({ type: 'withLabel', label: 'Cost' })
    })

    it('parses SORTED BY ... DESCENDING', () => {
        const ast = P('SHOW publications.title SORTED BY publications.date DESCENDING')
        expect(ast.modifiers[0]).toMatchObject({
            type: 'sortedBy',
            order: 'desc',
        })
        expect(ast.modifiers[0].value.path).toBe('publications.date')
    })

    it('parses FROM LOWEST TO HIGHEST as ascending sort', () => {
        const ast = P('SHOW publications.title FROM LOWEST TO HIGHEST date')
        expect(ast.modifiers[0]).toMatchObject({ type: 'sortedBy', order: 'asc' })
    })

    it('parses FROM HIGHEST TO LOWEST as descending sort', () => {
        const ast = P('SHOW publications.title FROM HIGHEST TO LOWEST date')
        expect(ast.modifiers[0]).toMatchObject({ type: 'sortedBy', order: 'desc' })
    })

    it('parses JOINED BY', () => {
        const ast = P('SHOW publications.title JOINED BY ", "')
        expect(ast.modifiers[0]).toEqual({ type: 'joinedBy', sep: ', ' })
    })

    it('parses WHERE with compound condition', () => {
        const ast = P('SHOW publications.title WHERE refereed AND year > 2020')
        expect(ast.modifiers[0].type).toBe('where')
        expect(ast.modifiers[0].condition.op).toBe('&')
    })

    it('parses trailing IF as a where modifier', () => {
        const ast = P('SHOW publications.title IF published')
        expect(ast.modifiers[0].type).toBe('where')
    })

    it('parses WHERE NOT (a OR b) with parenthesized boolean group', () => {
        const ast = P('SHOW x WHERE NOT (draft OR archived)')
        expect(ast.modifiers[0].type).toBe('where')
        const cond = ast.modifiers[0].condition
        expect(cond.type).toBe('unop')
        expect(cond.op).toBe('!')
        expect(cond.arg.type).toBe('group')
        expect(cond.arg.inner.type).toBe('binop')
        expect(cond.arg.inner.op).toBe('|')
    })

    it('parses WHERE (a AND b) OR c with parenthesized boolean group', () => {
        const ast = P('SHOW x WHERE (a AND b) OR c')
        const cond = ast.modifiers[0].condition
        expect(cond.type).toBe('binop')
        expect(cond.op).toBe('|')
        expect(cond.left.type).toBe('group')
        expect(cond.left.inner.op).toBe('&')
        expect(cond.right.path).toBe('c')
    })

    it('parses WHERE NOT (NOT active) — double negation with parens', () => {
        const ast = P('SHOW x WHERE NOT (NOT active)')
        const cond = ast.modifiers[0].condition
        expect(cond.type).toBe('unop')
        expect(cond.op).toBe('!')
        expect(cond.arg.type).toBe('group')
        expect(cond.arg.inner.type).toBe('unop')
        expect(cond.arg.inner.arg.path).toBe('active')
    })

    it('accepts modifiers in any order', () => {
        const ast = P(
            'SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ", "'
        )
        expect(ast.modifiers.map((m) => m.type)).toEqual(['where', 'sortedBy', 'joinedBy'])
    })
})

describe('plain parser — multi-value show', () => {
    // Multi-value SHOW collects a sequence of values (comma-separated,
    // space-separated, or mixed) and produces a `show` node with a
    // `values` array instead of the usual single `value`. The translator
    // branches on the presence of `values` and emits a join expression —
    // per-item drop by default, with `+:` when JOINED BY is present, or
    // `+?` when IF PRESENT is present.

    it('parses comma-separated multi-value SHOW', () => {
        const ast = P('SHOW city, province, country JOINED BY ", "')
        expect(ast.type).toBe('show')
        expect(ast.values).toHaveLength(3)
        expect(ast.values.map((v) => v.path)).toEqual(['city', 'province', 'country'])
        expect(ast.modifiers).toEqual([{ type: 'joinedBy', sep: ', ' }])
    })

    it('parses space-separated multi-value SHOW (commas optional)', () => {
        // Space juxtaposition works for the literal-prefix pattern
        // `'Dr. ' title` where commas would read awkwardly.
        const ast = P("SHOW 'Dr. ' title IF PRESENT")
        expect(ast.values).toHaveLength(2)
        expect(ast.values[0]).toEqual({ type: 'string', value: 'Dr. ' })
        expect(ast.values[1]).toEqual({ type: 'var', path: 'title' })
        expect(ast.modifiers).toEqual([{ type: 'ifPresent' }])
    })

    it('parses labeled-row shape (@name, literal separator, name)', () => {
        const ast = P("SHOW @email, ': ', email IF PRESENT")
        expect(ast.values).toHaveLength(3)
        expect(ast.values[0]).toEqual({ type: 'var', path: '@email' })
        expect(ast.values[1]).toEqual({ type: 'string', value: ': ' })
        expect(ast.values[2]).toEqual({ type: 'var', path: 'email' })
        expect(ast.modifiers).toEqual([{ type: 'ifPresent' }])
    })

    it('parses bare multi-value SHOW with no modifier (default empty-separator join)', () => {
        const ast = P('SHOW a, b, c')
        expect(ast.values).toHaveLength(3)
        expect(ast.modifiers).toEqual([])
    })

    it('keeps single-value SHOW as a single-value node (not values)', () => {
        // A SHOW with exactly one value should NOT grow a values array —
        // single- and multi-value forms are distinct AST shapes so the
        // translator can branch cleanly and existing tests that read
        // `ast.value` keep working.
        const ast = P('SHOW title')
        expect(ast.value).toBeDefined()
        expect(ast.values).toBeUndefined()
    })

    it('rejects WHERE on multi-value SHOW', () => {
        expect(() => P('SHOW a, b WHERE c')).toThrow(
            /Multi-value SHOW supports only JOINED BY and IF PRESENT/
        )
    })

    it('rejects SORTED BY on multi-value SHOW', () => {
        expect(() => P('SHOW a, b SORTED BY c')).toThrow(
            /Multi-value SHOW supports only JOINED BY and IF PRESENT/
        )
    })

    it('rejects AS on multi-value SHOW', () => {
        expect(() => P('SHOW a, b AS text')).toThrow(
            /Multi-value SHOW supports only JOINED BY and IF PRESENT/
        )
    })

    it('rejects combining JOINED BY and IF PRESENT on the same SHOW', () => {
        expect(() => P("SHOW a, b JOINED BY ', ' IF PRESENT")).toThrow(
            /cannot be combined/
        )
    })
})

describe('plain parser — if', () => {
    it('parses IF ... SHOW ... OTHERWISE SHOW ...', () => {
        const ast = P('IF age >= 18 SHOW "Adult" OTHERWISE SHOW "Minor"')
        expect(ast.type).toBe('if')
        expect(ast.condition.op).toBe('>=')
        expect(ast.thenBranch).toEqual({ type: 'string', value: 'Adult' })
        expect(ast.elseBranch).toEqual({ type: 'string', value: 'Minor' })
    })

    it('parses IF ... THEN ... ELSE ...', () => {
        const ast = P('IF age >= 18 THEN "Adult" ELSE "Minor"')
        expect(ast.type).toBe('if')
        expect(ast.thenBranch.value).toBe('Adult')
        expect(ast.elseBranch.value).toBe('Minor')
    })

    it('makes SHOW after OTHERWISE optional', () => {
        const ast = P('IF x SHOW "a" OTHERWISE "b"')
        expect(ast.elseBranch.value).toBe('b')
    })
})

describe('plain parser — aggregation', () => {
    it('parses TOTAL OF', () => {
        const ast = P('TOTAL OF grants.amount')
        expect(ast.type).toBe('sum')
        expect(ast.value.path).toBe('grants.amount')
    })

    it('parses SUM OF as sum', () => {
        const ast = P('SUM OF grants.amount')
        expect(ast.type).toBe('sum')
    })

    it('parses AVERAGE OF', () => {
        const ast = P('AVERAGE OF grants.amount')
        expect(ast.type).toBe('average')
    })

    it('parses COUNT OF', () => {
        // Bare aggregate with no modifiers — returns the count node
        // directly, not wrapped in a show.
        const ast = P('COUNT OF publications')
        expect(ast.type).toBe('count')
        expect(ast.value).toEqual({ type: 'var', path: 'publications' })
    })

    it('parses COUNT OF ... WHERE ... as show wrapping count', () => {
        // WHERE is no longer consumed inside parseCountBody. It's a
        // uniform modifier on a wrapping show node, same as AS or
        // WITH LABEL. translateShow's WHERE branch detects the
        // aggregate value and emits the filter-then-count Compact
        // form, so the semantic output is unchanged.
        const ast = P('COUNT OF publications WHERE refereed')
        expect(ast.type).toBe('show')
        expect(ast.value).toEqual({
            type: 'count',
            value: { type: 'var', path: 'publications' },
        })
        expect(ast.modifiers).toEqual([
            { type: 'where', condition: { type: 'var', path: 'refereed' } },
        ])
    })

    it('parses SUM OF with AS modifier as show wrapping sum', () => {
        const ast = P('SUM OF grants.amount AS currency USD')
        expect(ast.type).toBe('show')
        expect(ast.value).toEqual({
            type: 'sum',
            value: { type: 'var', path: 'grants.amount' },
        })
        expect(ast.modifiers).toEqual([
            { type: 'as', format: { type: 'currency', value: 'usd' } },
        ])
    })

    it('parses SUM OF with WHERE modifier as show wrapping sum', () => {
        const ast = P('SUM OF grants.amount WHERE active')
        expect(ast.type).toBe('show')
        expect(ast.value.type).toBe('sum')
        expect(ast.modifiers).toEqual([
            { type: 'where', condition: { type: 'var', path: 'active' } },
        ])
    })

    it('parses AVERAGE OF with AS modifier as show wrapping average', () => {
        const ast = P('AVERAGE OF pubs.year AS number')
        expect(ast.type).toBe('show')
        expect(ast.value.type).toBe('average')
        expect(ast.modifiers).toEqual([
            { type: 'as', format: { type: 'number', value: null } },
        ])
    })
})

describe('plain parser — loom passthrough', () => {
    it('preserves raw loom expressions', () => {
        const ast = P('{+ 1 2}')
        expect(ast.type).toBe('show')
        expect(ast.value).toEqual({ type: 'loom', value: '{+ 1 2}' })
    })
})

describe('plain parser — function calls', () => {
    it('parses identifier followed by string as a function call', () => {
        const ast = P('greet "Diego"')
        expect(ast).toEqual({
            type: 'call',
            name: 'greet',
            args: [{ type: 'string', value: 'Diego' }],
        })
    })

    it('parses multi-arg function call', () => {
        const ast = P('fullname "Diego" "Macrini"')
        expect(ast.type).toBe('call')
        expect(ast.args).toHaveLength(2)
    })

    it('parses bare identifier as a variable, not a call', () => {
        // No trailing value → not a call, just a bare value.
        const ast = P('greet')
        expect(ast.type).toBe('show')
        expect(ast.value).toEqual({ type: 'var', path: 'greet' })
    })

    it('parses identifier + WITH LABEL as implicit SHOW, not a call', () => {
        // Trailing token is a keyword, not a value → not a call.
        const ast = P('greet WITH LABEL')
        expect(ast.type).toBe('show')
        expect(ast.value).toEqual({ type: 'var', path: 'greet' })
        expect(ast.modifiers).toEqual([{ type: 'withLabel', label: null }])
    })

    it('parses nested Plain inside function args via grouping', () => {
        const ast = P('bold (SHOW price AS currency USD)')
        expect(ast.type).toBe('call')
        expect(ast.name).toBe('bold')
        expect(ast.args).toHaveLength(1)
        // The arg is a group wrapping a show node with an AS modifier.
        const arg = ast.args[0]
        expect(arg.type).toBe('group')
        expect(arg.inner.type).toBe('show')
        expect(arg.inner.modifiers[0]).toEqual({
            type: 'as',
            format: { type: 'currency', value: 'usd' },
        })
    })

    it('function call can take trailing modifiers', () => {
        const ast = P('recentList SORTED BY date DESCENDING')
        // `recentList` has no arg values following, so it's a bare var,
        // not a call. Trailing modifier applies to the var.
        expect(ast.type).toBe('show')
        expect(ast.value).toEqual({ type: 'var', path: 'recentList' })
        expect(ast.modifiers).toHaveLength(1)
    })

    it('function call with arg + modifier', () => {
        const ast = P('filter items SORTED BY date')
        // call(filter, [items]) then trailing SORTED BY → wrapped in show.
        expect(ast.type).toBe('show')
        expect(ast.value.type).toBe('call')
        expect(ast.value.name).toBe('filter')
        expect(ast.modifiers).toHaveLength(1)
        expect(ast.modifiers[0].type).toBe('sortedBy')
    })
})
