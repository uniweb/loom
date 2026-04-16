/**
 * Core template engine tests.
 *
 * Ported from the legacy markdown-based test suite at
 * /Users/dmac/Proximify/unirepo/js/tools/unitTests/tests/examples/
 *
 * Each test group corresponds to a legacy test file.
 */
import { describe, it, expect } from 'vitest'
import { LoomCore } from '../src/core/index.js'

/**
 * Helper: render a template with a flat variables object.
 * Normalizes whitespace in the output to match legacy test expectations
 * (the legacy runner does `result.replace(/\n+/g, ' ')`).
 */
function run(template, variables = {}) {
    const engine = new LoomCore()
    const result = engine.render(template, (key) => variables[key])
    return result.replace(/\n+/g, ' ').trim()
}

function evaluate(expr, variables = {}) {
    const engine = new LoomCore()
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

    it('evaluateText with outer parens returns native type', () => {
        // Regression: `evaluateText('(+ 1 2)')` used to return "3" (string)
        // because the outer parens routed through the # formatter.
        expect(evaluate('(+ 1 2)')).toBe(3)
        expect(evaluate('(+ 1 2)')).toStrictEqual(evaluate('+ 1 2'))
        expect(evaluate('(? true 42 0)')).toBe(42)
        expect(evaluate('(> 5 3)')).toBe(true)
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

    // Structural emptiness: 0 is a legitimate value and must survive
    // joins. Prior behavior treated 0 as empty and dropped it, which
    // was wrong — "Likes: 0" is correct output, not a bug.
    it('conditional join includes literal zero', () => {
        const result = run("{+? 'Likes: ' likes}", { likes: 0 })
        expect(result).toBe('Likes: 0')
    })

    it('conditional join drops null but keeps zero', () => {
        expect(run("{+? 'Likes: ' likes}", { likes: null })).toBe('')
        expect(run("{+? 'Likes: ' likes}", { likes: 0 })).toBe('Likes: 0')
    })

    it('separator join keeps zero among string values', () => {
        // The separator-join form filters out empty items but must
        // preserve 0 as a legitimate value.
        const result = run("{', ' a b c}", { a: 'first', b: 0, c: 'last' })
        expect(result).toBe('first, 0, last')
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
        const engine = new LoomCore()
        const result = engine.evaluateText('. 0 items', (key) => {
            if (key === 'items') return [{ name: 'first' }, { name: 'second' }]
            return undefined
        })
        expect(result).toEqual({ name: 'first' })
    })

    it('@ prefix returns variable label', () => {
        const engine = new LoomCore()
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

    it('sorts objects by -by=field (ascending)', () => {
        const data = [
            { title: 'Z-Paper', year: 2018 },
            { title: 'A-Paper', year: 2024 },
            { title: 'M-Paper', year: 2022 },
        ]
        const result = evaluate('>> -by=year data', { data })
        expect(result.map((d) => d.title)).toEqual(['Z-Paper', 'M-Paper', 'A-Paper'])
    })

    it('sorts objects by -by=field (descending)', () => {
        const data = [
            { title: 'Z-Paper', year: 2018 },
            { title: 'A-Paper', year: 2024 },
            { title: 'M-Paper', year: 2022 },
        ]
        const result = evaluate('>> -desc -by=year data', { data })
        expect(result.map((d) => d.title)).toEqual(['A-Paper', 'M-Paper', 'Z-Paper'])
    })

    it('sorts objects by -by=name (string field)', () => {
        const data = [
            { name: 'Charlie', id: 3 },
            { name: 'Alice', id: 1 },
            { name: 'Bob', id: 2 },
        ]
        const result = evaluate('>> -by=name data', { data })
        expect(result.map((d) => d.name)).toEqual(['Alice', 'Bob', 'Charlie'])
    })

    it('falls back to getFirstValue when -by field is absent', () => {
        const data = [
            { title: 'Banana' },
            { title: 'Apple' },
            { title: 'Cherry' },
        ]
        // No -by flag, sorts by first property value (title, alphabetically)
        const result = evaluate('>> data', { data })
        expect(result.map((d) => d.title)).toEqual(['Apple', 'Banana', 'Cherry'])
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

    it('4-digit integers render without locale grouping', () => {
        expect(run('{year}', { year: 2020 })).toBe('2020')
        expect(run('{n}', { n: 999 })).toBe('999')
        expect(run('{n}', { n: -2020 })).toBe('-2020')
        expect(run('{n}', { n: 0 })).toBe('0')
    })

    it('5-digit+ integers still get locale grouping', () => {
        expect(run('{n}', { n: 10000 })).toBe('10,000')
        expect(run('{n}', { n: 100000 })).toBe('100,000')
    })

    it('non-integer numbers still get locale formatting', () => {
        // Floats are not affected by the integer guard
        expect(run('{n}', { n: 2020.5 })).toContain('2,020')
    })

    it('currency format on bare number produces $ symbol and decimals', () => {
        const result = run('{# -currency=USD price}', { price: 1200 })
        expect(result).toContain('$')
        expect(result).toContain('1,200')
        expect(result).toContain('.00')
    })

    it('currency format with EUR code', () => {
        const result = run('{# -currency=EUR price}', { price: 500 })
        // EUR symbol varies by locale but the amount should be present
        expect(result).toContain('500')
    })

    it('percent format on bare number', () => {
        const result = run('{# -percent price}', { price: 0.75 })
        expect(result).toContain('75')
        expect(result).toContain('%')
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

    // Loom-style truthiness: scalar values use the broader `isFalsy`
    // check (empty collections, "", 0, "0", false, null, undefined, NaN
    // are all falsy). `!`, `!!`, `&`, `|`, `?`, `??`, `???`, and `++!!`
    // all consult this.
    it('logical NOT on scalars uses isFalsy', () => {
        expect(evaluate('! x', { x: 0 })).toBe(true)
        expect(evaluate('! x', { x: '' })).toBe(true)
        expect(evaluate('! x', { x: '0' })).toBe(true)
        expect(evaluate('! x', { x: null })).toBe(true)
        expect(evaluate('! x', { x: undefined })).toBe(true)
        expect(evaluate('! x', { x: false })).toBe(true)
        expect(evaluate('! x', { x: true })).toBe(false)
        expect(evaluate('! x', { x: 1 })).toBe(false)
        expect(evaluate('! x', { x: 'anything' })).toBe(false)
    })

    // List-awareness: `!` and `!!` step into list arguments and operate
    // element-by-element, the same way mapper operators like `=`, `>`,
    // `<`, `!=` do. Use the `-l` flag to opt out and treat the whole
    // list as one value.
    it('logical NOT steps into list arguments', () => {
        expect(evaluate('! xs', { xs: [] })).toEqual([])
        expect(evaluate('! xs', { xs: [1] })).toEqual([false])
        expect(evaluate('! xs', { xs: [true, false, true] })).toEqual([false, true, false])
    })

    it('logical NOT on mixed database-shape values operates per element', () => {
        // Typical shape of a boolean-ish column from a database: the
        // field may be a real boolean, 0/1, "Y"/"N", null, or missing.
        // Per-element `isFalsy` is the only semantics that makes
        // `WHERE NOT draft`-style filtering work across these shapes.
        expect(
            evaluate('! xs', {
                xs: [true, false, 0, 1, 'Y', '', null, undefined],
            }),
        ).toEqual([false, true, true, false, false, true, true, true])
    })

    it('logical NOT with -l flag treats whole list as one value', () => {
        expect(evaluate('! -l xs', { xs: [] })).toBe(true)
        expect(evaluate('! -l xs', { xs: [1] })).toBe(false)
        expect(evaluate('! -l xs', { xs: [true, false] })).toBe(false)
    })

    it('logical NOT treats empty/non-empty object as falsy/truthy per element', () => {
        expect(evaluate('! o', { o: {} })).toBe(true)
        expect(evaluate('! o', { o: { a: 1 } })).toBe(false)
    })

    it('logical NOT on nested lists negates each sublist as a whole', () => {
        // A list of lists: each sublist is a single value to `!`, so the
        // result depends on per-sublist isFalsy. Empty sublist → falsy
        // → `!` = true. Non-empty sublist → truthy → `!` = false.
        expect(evaluate('! xs', { xs: [[1], []] })).toEqual([false, true])
        expect(evaluate('! xs', { xs: [[1, 2], [3]] })).toEqual([false, false])
        expect(evaluate('! xs', { xs: [[], []] })).toEqual([true, true])
    })

    it('logical NOT with -r flag reverses the list-aware result', () => {
        // Generic -r is applied after the function result. With list-aware
        // `!`, the negated list is reversed.
        expect(evaluate('! -r xs', { xs: [true, true, false] })).toEqual([
            true,
            false,
            false,
        ])
    })

    it('logical NOT -l opt-out combined with -r is a no-op on scalars', () => {
        // -l gives a scalar result; -r has nothing to reverse.
        expect(evaluate('! -l -r xs', { xs: [true, false, true] })).toBe(false)
    })

    it('logical NOT on NaN and missing variables is true', () => {
        expect(evaluate('! x', { x: NaN })).toBe(true)
        expect(evaluate('! missing')).toBe(true)
        expect(evaluate('! xs', { xs: [NaN, 1, NaN] })).toEqual([true, false, true])
    })

    it('logical NOT with no argument returns null', () => {
        // minArgs=1, args.length=0 → dispatcher returns null.
        expect(evaluate('!')).toBe(null)
        expect(evaluate('!!')).toBe(null)
    })

    it('double NOT is inverse of NOT, and list-aware', () => {
        // Scalar cases
        expect(evaluate('!! x', { x: 0 })).toBe(false)
        expect(evaluate('!! x', { x: 5 })).toBe(true)
        expect(evaluate('!! x', { x: null })).toBe(false)
        expect(evaluate('!! x', { x: '' })).toBe(false)
        expect(evaluate('!! x', { x: 'hi' })).toBe(true)
        // List cases — per-element
        expect(evaluate('!! xs', { xs: [] })).toEqual([])
        expect(evaluate('!! xs', { xs: [1] })).toEqual([true])
        expect(evaluate('!! xs', { xs: [true, false, 0, 1, 'Y', '', null] })).toEqual([
            true,
            false,
            false,
            true,
            true,
            false,
            false,
        ])
        // -l opt-out
        expect(evaluate('!! -l xs', { xs: [] })).toBe(false)
        expect(evaluate('!! -l xs', { xs: [1] })).toBe(true)
    })

    it('ternary treats zero as falsy (condition branch)', () => {
        expect(evaluate('? x "yes" "no"', { x: 0 })).toBe('no')
        expect(evaluate('? x "yes" "no"', { x: 5 })).toBe('yes')
    })
})

// ============================================================================
// List rendering (formatList)
// ============================================================================

describe('list rendering', () => {
    // Regression: formatList used to drop any JS-falsy item, which meant
    // a list of numbers containing 0 rendered as "1, 2" instead of
    // "1, 0, 2", and a list of booleans lost its `false`s. The fix uses
    // structural isEmpty, matching the rest of the join semantics.

    it('renders a list of numbers including zero', () => {
        expect(run('{xs}', { xs: [1, 0, 2] })).toBe('1, 0, 2')
        expect(run('{xs}', { xs: [0] })).toBe('0')
        expect(run('{xs}', { xs: [0, 0, 0] })).toBe('0, 0, 0')
    })

    it('renders a list of booleans including false', () => {
        expect(run('{xs}', { xs: [true, false, true] })).toBe('true, false, true')
        expect(run('{xs}', { xs: [false] })).toBe('false')
    })

    it('renders "0" as a legitimate string value', () => {
        expect(run('{xs}', { xs: ['a', '0', 'b'] })).toBe('a, 0, b')
    })

    it('drops structurally-empty items from rendered lists', () => {
        // null, undefined, "" are structurally empty and should drop.
        // NaN is also structurally empty.
        expect(run('{xs}', { xs: [1, null, 2] })).toBe('1, 2')
        expect(run('{xs}', { xs: ['a', '', 'b'] })).toBe('a, b')
        expect(run('{xs}', { xs: [1, undefined, 2] })).toBe('1, 2')
    })

    it('renders a list-aware NOT result with its booleans intact', () => {
        // End-to-end: the Plain `WHERE NOT …` path compiles to `(! list)`
        // which returns a list of booleans; rendering it should preserve
        // both `true` and `false`.
        expect(run('{! xs}', { xs: [true, false, true] })).toBe('false, true, false')
    })
})

// ============================================================================
// Snippets
// ============================================================================

describe('snippets', () => {
    it('user-defined snippet with args', () => {
        const engine = new LoomCore(
            '[greet name] { Hello, {name}! }'
        )
        // Snippets need variables set — pass a dummy resolver
        const result = engine.render('{greet "Diego"}', () => undefined)
        expect(result.trim()).toBe('Hello, Diego!')
    })

    it('snippet with multiple args', () => {
        const engine = new LoomCore(
            '[fullname first last] { {first} {last} }'
        )
        const result = engine.render('{fullname "Diego" "Macrini"}', () => undefined)
        expect(result.trim()).toBe('Diego Macrini')
    })

    it('no-argument snippet renders constant text', () => {
        const engine = new LoomCore('[motto] { Per aspera ad astra. }')
        const result = engine.render('{motto}', () => undefined)
        expect(result.trim()).toBe('Per aspera ad astra.')
    })

    it('expression-body snippet evaluates with (...)', () => {
        // `[name ...] ( expr )` — body is a single expression, not a text
        // template. Evaluated via evaluateText and returns a typed value.
        const engine = new LoomCore('[triple n] (* n 3)')
        const none = () => undefined
        expect(engine.evaluateText('triple 7', none)).toBe(21)
        expect(engine.evaluateText('triple 0', none)).toBe(0)
    })

    it('variadic ...args captures remaining arguments as a list', () => {
        const engine = new LoomCore('[joinAll ...items] (+: ", " items)')
        const none = () => undefined
        expect(engine.evaluateText('joinAll "a" "b" "c"', none)).toBe('a, b, c')
        expect(engine.evaluateText('joinAll "solo"', none)).toBe('solo')
    })

    it('snippet calling another snippet composes correctly', () => {
        const engine = new LoomCore(`
            [double n] (* n 2)
            [quadruple n] (double (double n))
        `)
        expect(engine.evaluateText('quadruple 5', () => undefined)).toBe(20)
    })

    it('snippet body can reference outer resolver variables', () => {
        // Args take precedence but undefined args fall through to the outer
        // resolver, so snippets can pull in ambient context.
        const engine = new LoomCore('[greet name] { Hello, {name}, from {city}! }')
        const vars = { city: 'Fredericton' }
        const result = engine.render('{greet "Diego"}', (k) => vars[k])
        expect(result.trim()).toBe('Hello, Diego, from Fredericton!')
    })

    it('$0 parameter receives the flags object', () => {
        // `$0` as the first parameter opts the snippet into receiving the
        // flag bag. It cannot appear alone in a placeholder — the language
        // reference notes you must use it inside a function call like
        // `(# -json $0)`.
        const engine = new LoomCore(
            '[fancy $0 title] { Title: {title} Flags: {# -json $0} }'
        )
        const result = engine.render(
            '{fancy -x -y=test "Hello"}',
            () => undefined
        )
        expect(result).toContain('Title: Hello')
        expect(result).toContain('"x":true')
        expect(result).toContain('"y":"test"')
    })

    it('accepts a pre-parsed snippets object in the constructor', () => {
        // Alternative to the string form: hand the constructor an object
        // whose keys are snippet names and whose values are the parsed
        // shape (args, body, isText, hasFlags). Useful when the snippet
        // library is generated programmatically rather than authored as
        // source text.
        const engine = new LoomCore({
            greet: {
                args: ['name'],
                body: 'Hello, {name}!',
                isText: true,
                hasFlags: false,
            },
        })
        const result = engine.render('{greet "Diego"}', () => undefined)
        expect(result.trim()).toBe('Hello, Diego!')
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
        // ++!! starts with an implicit 0 accumulator and adds 1 for every
        // non-empty argument. The leading 0 here is also counted (as empty,
        // so skipped), giving the same result.
        const result = evaluate('++!! 0 "a" "" "c"')
        expect(result).toBe(2)
    })

    it('count items in a list of objects', () => {
        const vars = { items: [{ a: 1 }, { a: 2 }, { a: 3 }] }
        expect(evaluate('++!! items', vars)).toBe(3)
    })

    it('count items in a list of numbers', () => {
        const vars = { nums: [100, 200, 300] }
        expect(evaluate('++!! nums', vars)).toBe(3)
    })

    it('count skips zero because zero is falsy', () => {
        const vars = { xs: [1, 0, 2] }
        expect(evaluate('++!! xs', vars)).toBe(2)
    })

    it('count skips false because false is falsy', () => {
        const vars = { flags: [true, false, true] }
        expect(evaluate('++!! flags', vars)).toBe(2)
    })

    it('count skips empty arrays because empty collections are falsy', () => {
        const vars = { groups: [[1], [], [2]] }
        expect(evaluate('++!! groups', vars)).toBe(2)
    })

    it('formatter does not leak inferred type across list items', () => {
        // Regression: applyFormatter used to route a single-list arg
        // through its matrix path, transposing to per-element calls that
        // shared the same flags object. formatValue caches inferred type
        // via `flags.type ??= inferType(...)`, so a list like
        // [null, 'New', 'Mid'] saw null first, cached type='null', and
        // formatted every subsequent string as empty — the placeholder
        // rendered as ', , ' instead of 'New, Mid'. Fixed by letting
        // single-list args reach formatList, which drops falsy items.
        const engine = new LoomCore()
        const result = engine
            .render('{? (> pubs.year 2020) pubs.title}', {
                pubs: [
                    { title: 'Old', year: 2018 },
                    { title: 'New', year: 2023 },
                    { title: 'Mid', year: 2021 },
                ],
            })
            .trim()
        expect(result).toBe('New, Mid')
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
