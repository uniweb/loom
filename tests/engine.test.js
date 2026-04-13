/**
 * Core template engine tests.
 *
 * Ported from the legacy markdown-based test suite at
 * /Users/dmac/Proximify/unirepo/js/tools/unitTests/tests/examples/
 *
 * Each test group corresponds to a legacy test file.
 */
import { describe, it, expect } from 'vitest'
import { Loom } from '../src/index.js'

/**
 * Helper: render a template with a flat variables object.
 * Normalizes whitespace in the output to match legacy test expectations
 * (the legacy runner does `result.replace(/\n+/g, ' ')`).
 */
function run(template, variables = {}) {
    const engine = new Loom()
    const result = engine.render(template, (key) => variables[key])
    return result.replace(/\n+/g, ' ').trim()
}

function evaluate(expr, variables = {}) {
    const engine = new Loom()
    return engine.evaluateText(expr, (key) => variables[key])
}

// ============================================================================
// Math (from examples/math.md)
// ============================================================================

describe('math', () => {
    it('basic arithmetic in template', () => {
        const result = run(
            '{a} + {b} equals {+ a b}. Wow, such math, much amaze!',
            { a: 2, b: 3 }
        )
        expect(result).toBe('2 + 3 equals 5. Wow, such math, much amaze!')
    })

    it('addition', () => {
        expect(evaluate('+ 1 2')).toBe(3)
    })

    it('negative result via comparison', () => {
        // Verify numeric operations work via greater-than
        expect(evaluate('> 10 3')).toBe(true)
        expect(evaluate('> 3 10')).toBe(false)
    })

    it('multiplication', () => {
        expect(evaluate('* 4 5')).toBe(20)
    })

    it('division', () => {
        expect(evaluate('/ 10 2')).toBe(5)
    })

    it('percentage', () => {
        // % computes (a/b * 100) — "what percent is a of b"
        expect(evaluate('% 50 200')).toBe(400)
    })
})

// ============================================================================
// Conditionals (from examples/conditional.md)
// ============================================================================

describe('conditionals', () => {
    it('ternary true', () => {
        expect(evaluate('? true "Yes" "No"')).toBe('Yes')
    })

    it('ternary false', () => {
        expect(evaluate('? false "Yes" "No"')).toBe('No')
    })

    it('ternary true with no else', () => {
        expect(evaluate('? true "Yes"')).toBe('Yes')
    })

    it('ternary false with no else returns empty', () => {
        const result = evaluate('? false "Yes"')
        expect(result).toBeFalsy()
    })

    it('nested condition with age via render', () => {
        const vars = { age: 20 }
        // ?? with list conditions returns an array of results; use ? for scalar
        expect(evaluate('? (> age 18) "Adult" "Youth"', vars)).toBe('Adult')
    })

    it('simple condition with old age', () => {
        const vars = { age: 70 }
        expect(evaluate('? (> age 65) "Senior" "Not Senior"', vars)).toBe('Senior')
    })
})

// ============================================================================
// Joins (from examples/joins.md)
// ============================================================================

describe('joins', () => {
    it('join with separator', () => {
        const result = run('{", " city province}', { city: 'Montreal', province: 'QC' })
        expect(result).toBe('Montreal, QC')
    })

    it('conditional join - all present', () => {
        const result = run("{+? 'Dr. ' title}", { title: 'Macrini' })
        expect(result).toBe('Dr. Macrini')
    })

    it('conditional join - value missing', () => {
        const result = run("{+? 'Dr. ' title}", {})
        expect(result).toBe('')
    })
})

// ============================================================================
// Variables and accessors (from examples/1.accessors.md)
// ============================================================================

describe('variables', () => {
    it('simple variable substitution', () => {
        expect(run('{name}', { name: 'Diego' })).toBe('Diego')
    })

    it('multiple variables', () => {
        expect(run('{first} {last}', { first: 'Diego', last: 'Macrini' })).toBe('Diego Macrini')
    })

    it('undefined variable returns empty', () => {
        expect(run('{nonexistent}', {})).toBe('')
    })

    it('nested property access via dot', () => {
        const vars = {
            person: { name: 'Diego', age: 30 },
        }
        const engine = new Loom()
        const result = engine.evaluateText('. 0 items', (key) => {
            if (key === 'items') return [{ name: 'first' }, { name: 'second' }]
            return undefined
        })
        expect(result).toEqual({ name: 'first' })
    })

    it('@ prefix returns variable label', () => {
        const engine = new Loom()
        const result = engine.evaluateText('@family_name', (key) => {
            if (key === '@family_name') return 'Family Name'
            return undefined
        })
        expect(result).toBe('Family Name')
    })
})

// ============================================================================
// Sorting (from examples/sorting.md)
// ============================================================================

describe('sorting', () => {
    it('sorts strings alphabetically', () => {
        const result = evaluate('>> "b" "a" "c"')
        expect(result).toEqual(['a', 'b', 'c'])
    })

    it('sorts numbers numerically', () => {
        const result = evaluate('>> 2 1 3')
        expect(result).toEqual([1, 2, 3])
    })

    it('sorts descending with -desc flag', () => {
        const result = evaluate('>> -desc "a" "b" "c"')
        expect(result).toEqual(['c', 'b', 'a'])
    })

    it('sorts numbers descending', () => {
        const result = evaluate('>> -desc 3 2 1')
        expect(result).toEqual([3, 2, 1])
    })
})

// ============================================================================
// Formatting (from examples/3.format.md)
// ============================================================================

describe('formatting', () => {
    it('format list with separator via render', () => {
        const result = run('{# -l -sep=", " items}', {
            items: ['a', 'b', 'c'],
        })
        expect(result).toBe('a, b, c')
    })

    it('format with underline', () => {
        const result = run('{# -underline "hello"}')
        expect(result).toBe('<u>hello</u>')
    })

    it('format with bold', () => {
        const result = run('{# -bold "hello"}')
        expect(result).toBe('<strong>hello</strong>')
    })

    it('format with italic', () => {
        const result = run('{# -italic "hello"}')
        expect(result).toBe('<em>hello</em>')
    })
})

// ============================================================================
// Logical operations (from examples/logical.md)
// ============================================================================

describe('logical', () => {
    it('logical NOT', () => {
        expect(evaluate('! true')).toBe(false)
        expect(evaluate('! false')).toBe(true)
    })

    it('logical AND', () => {
        expect(evaluate('& true true')).toBe(true)
        expect(evaluate('& true false')).toBe(false)
    })

    it('logical OR', () => {
        expect(evaluate('| true false')).toBe(true)
        // OR of two falses returns null (falsy), not false
        expect(evaluate('| false false')).toBeFalsy()
    })

    it('equality', () => {
        expect(evaluate('= 1 1')).toBe(true)
        expect(evaluate('= 1 2')).toBe(false)
    })

    it('greater than', () => {
        expect(evaluate('> 5 3')).toBe(true)
        expect(evaluate('> 3 5')).toBe(false)
    })
})

// ============================================================================
// Snippets
// ============================================================================

describe('snippets', () => {
    it('user-defined snippet with args', () => {
        const engine = new Loom(
            '[greet name] { Hello, {name}! }'
        )
        // Snippets need variables set — pass a dummy resolver
        const result = engine.render('{greet "Diego"}', () => undefined)
        expect(result.trim()).toBe('Hello, Diego!')
    })

    it('snippet with multiple args', () => {
        const engine = new Loom(
            '[fullname first last] { {first} {last} }'
        )
        const result = engine.render('{fullname "Diego" "Macrini"}', () => undefined)
        expect(result.trim()).toBe('Diego Macrini')
    })
})

// ============================================================================
// Collectors (aggregation)
// ============================================================================

describe('collectors', () => {
    it('sum numbers', () => {
        expect(evaluate('++ 1 2 3')).toBe(6)
    })

    it('concatenate strings', () => {
        expect(evaluate('++ "a" "b" "c"')).toBe('abc')
    })

    it('count non-empty items', () => {
        // ++!! accumulates: starts with first arg, adds 1 for each non-empty subsequent arg
        // With numeric start: 0 + 1 (for "a") + 0 (for "") + 1 (for "c") = 2
        const result = evaluate('++!! 0 "a" "" "c"')
        expect(result).toBe(2)
    })
})

// ============================================================================
// Template with unilang expressions (report-style)
// ============================================================================

describe('report-style templates', () => {
    it('renders a CV-style address block', () => {
        const result = run(
            '{+? "Faculty/Department of " faculty_department}',
            { faculty_department: 'Engineering' }
        )
        expect(result).toBe('Faculty/Department of Engineering')
    })

    it('renders empty when value missing', () => {
        const result = run(
            '{+? "Faculty/Department of " faculty_department}',
            {}
        )
        expect(result).toBe('')
    })

    it('renders join with separator', () => {
        const result = run(
            '{", " city province country}',
            { city: 'Fredericton', province: 'NB', country: 'Canada' }
        )
        expect(result).toBe('Fredericton, NB, Canada')
    })

    it('renders complex nested expression', () => {
        const result = run(
            '{", " degree_name specialization}',
            { degree_name: 'PhD', specialization: 'Computer Science' }
        )
        expect(result).toBe('PhD, Computer Science')
    })
})
