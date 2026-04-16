import { describe, it, expect } from 'vitest'
import { instantiateContent, instantiateRepeated, Loom } from '../src/index.js'

// Mock a minimal engine with just render() — covers the duck-typed contract.
const mockEngine = {
    render(template, vars) {
        return template.replace(/\{(\w+)\}/g, (_, key) => {
            const val = vars(key)
            return val !== undefined ? val : `{${key}}`
        })
    },
}

describe('instantiateContent', () => {
    it('instantiates text nodes in a ProseMirror doc', () => {
        const content = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'Hello {name}' },
                    ],
                },
            ],
        }

        const result = instantiateContent(content, mockEngine, (key) =>
            key === 'name' ? 'World' : undefined,
        )

        expect(result.content[0].content[0].text).toBe('Hello World')
    })

    it('preserves non-text nodes unchanged', () => {
        const content = {
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 1 }, content: [] },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: '{title}' }],
                },
            ],
        }

        const result = instantiateContent(content, mockEngine, (key) =>
            key === 'title' ? 'My Report' : undefined,
        )

        expect(result.content[0].type).toBe('heading')
        expect(result.content[1].content[0].text).toBe('My Report')
    })

    it('handles nested content', () => {
        const content = {
            type: 'doc',
            content: [
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        { type: 'text', text: 'Item: {item}' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const result = instantiateContent(content, mockEngine, (key) =>
            key === 'item' ? 'First' : undefined,
        )

        expect(
            result.content[0].content[0].content[0].content[0].text,
        ).toBe('Item: First')
    })

    it('handles array input', () => {
        const content = [
            { type: 'text', text: '{a}' },
            { type: 'text', text: '{b}' },
        ]

        const result = instantiateContent(content, mockEngine, (key) =>
            ({ a: 'X', b: 'Y' })[key],
        )

        expect(result[0].text).toBe('X')
        expect(result[1].text).toBe('Y')
    })

    it('returns primitive input unchanged', () => {
        expect(instantiateContent(null, mockEngine, () => undefined)).toBe(null)
        expect(instantiateContent('hello', mockEngine, () => undefined)).toBe(
            'hello',
        )
    })

    it('resolves a real Loom expression end-to-end', () => {
        const loom = new Loom()
        const profile = {
            first_name: 'Diego',
            publications: [
                { title: 'Cellular Bio', refereed: true },
                { title: 'Forestry', refereed: false },
                { title: 'Hydrology', refereed: true },
            ],
        }

        const content = {
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Hello {first_name}!' }],
                },
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text:
                                'You have {COUNT OF publications WHERE refereed} ' +
                                'refereed publications.',
                        },
                    ],
                },
            ],
        }

        // Loom accepts both a (key) => value resolver and a plain object;
        // the object form is required here because `WHERE refereed` filters
        // publication items by their own fields, which needs Loom's full
        // scoping — a top-level key resolver can't expose per-item fields.
        const result = instantiateContent(content, loom, profile)

        expect(result.content[0].content[0].text).toBe('Hello Diego!')
        expect(result.content[1].content[0].text).toBe(
            'You have 2 refereed publications.',
        )
    })
})

// ============================================================================
// instantiateRepeated
// ============================================================================

describe('instantiateRepeated', () => {
    const text = (str) => ({ type: 'text', text: str })
    const para = (str) => ({ type: 'paragraph', content: [text(str)] })
    const heading = (str) => ({ type: 'heading', attrs: { level: 2 }, content: [text(str)] })
    const divider = { type: 'divider' }
    const doc = (...nodes) => ({ type: 'doc', content: nodes })

    const loom = new Loom()

    it('falls back to simple instantiation when no dividers', () => {
        const input = doc(heading('{name}'), para('Hello'))
        const result = instantiateRepeated(input, loom, { name: 'Ada' }, 'items')
        expect(result.content[0].content[0].text).toBe('Ada')
        expect(result.content[1].content[0].text).toBe('Hello')
    })

    it('falls back when field is not an array', () => {
        const input = doc(heading('{name}'), divider, para('{title}'))
        const result = instantiateRepeated(input, loom, { name: 'Ada', title: 'Dr' }, 'name')
        // name is a string, not an array — falls back to simple
        expect(result.content[0].content[0].text).toBe('Ada')
    })

    it('falls back when field is an empty array', () => {
        const input = doc(heading('{name}'), divider, para('{title}'))
        const result = instantiateRepeated(input, loom, { name: 'Ada', items: [] }, 'items')
        expect(result.content[0].content[0].text).toBe('Ada')
    })

    it('splits two parts: header + body repeated per item', () => {
        const input = doc(
            heading('{name}'),
            divider,
            para('{degree} at {school}')
        )
        const vars = {
            name: 'Ada',
            education: [
                { degree: 'BA', school: 'Cambridge' },
                { degree: 'MA', school: 'Oxford' },
            ],
        }
        const result = instantiateRepeated(input, loom, vars, 'education')
        expect(result.content).toHaveLength(3) // header + 2 body entries
        expect(result.content[0].content[0].text).toBe('Ada')
        expect(result.content[1].content[0].text).toBe('BA at Cambridge')
        expect(result.content[2].content[0].text).toBe('MA at Oxford')
    })

    it('splits three parts: header + body + footer', () => {
        const input = doc(
            heading('{name}'),
            divider,
            para('{title}'),
            divider,
            para('Total: {COUNT OF items}')
        )
        const vars = {
            name: 'Ada',
            items: [
                { title: 'Paper A' },
                { title: 'Paper B' },
                { title: 'Paper C' },
            ],
        }
        const result = instantiateRepeated(input, loom, vars, 'items')
        // header(1) + body(3) + divider(1) + footer(1) = 6
        expect(result.content).toHaveLength(6)
        expect(result.content[0].content[0].text).toBe('Ada')
        expect(result.content[1].content[0].text).toBe('Paper A')
        expect(result.content[2].content[0].text).toBe('Paper B')
        expect(result.content[3].content[0].text).toBe('Paper C')
        expect(result.content[4].type).toBe('divider')
        expect(result.content[5].content[0].text).toBe('Total: 3')
    })

    it('merges item fields into vars (item overrides top-level)', () => {
        const input = doc(
            heading('{name}'),
            divider,
            para('{name} — {role}')
        )
        const vars = {
            name: 'Top Level',
            team: [
                { name: 'Alice', role: 'Engineer' },
                { name: 'Bob', role: 'Designer' },
            ],
        }
        const result = instantiateRepeated(input, loom, vars, 'team')
        // header uses top-level name
        expect(result.content[0].content[0].text).toBe('Top Level')
        // body items override name with their own
        expect(result.content[1].content[0].text).toBe('Alice — Engineer')
        expect(result.content[2].content[0].text).toBe('Bob — Designer')
    })

    it('resolves dot-path field names', () => {
        const input = doc(
            heading('Awards'),
            divider,
            para('{title} ({year})')
        )
        const vars = {
            academic: {
                awards: [
                    { title: 'Medal', year: '2020' },
                    { title: 'Prize', year: '2021' },
                ],
            },
        }
        const result = instantiateRepeated(input, loom, vars, 'academic.awards')
        expect(result.content).toHaveLength(3)
        expect(result.content[1].content[0].text).toBe('Medal (2020)')
        expect(result.content[2].content[0].text).toBe('Prize (2021)')
    })

    it('auto-unwraps content-API envelope', () => {
        const inner = doc(heading('{name}'), divider, para('{title}'))
        const wrapped = { doc: inner }
        const vars = {
            name: 'Ada',
            items: [{ title: 'Paper' }],
        }
        const result = instantiateRepeated(wrapped, loom, vars, 'items')
        expect(result.content[0].content[0].text).toBe('Ada')
        expect(result.content[1].content[0].text).toBe('Paper')
    })

    it('returns simple instantiation for null content', () => {
        const result = instantiateRepeated(null, loom, { x: 1 }, 'items')
        expect(result).toBe(null)
    })

    it('uses Loom aggregation in the footer', () => {
        const input = doc(
            heading('Funding'),
            divider,
            para('{title} — £{amount}'),
            divider,
            para('Total: £{TOTAL OF grants.amount}')
        )
        const vars = {
            grants: [
                { title: 'Grant A', amount: 500 },
                { title: 'Grant B', amount: 300 },
            ],
        }
        const result = instantiateRepeated(input, loom, vars, 'grants')
        const footer = result.content[result.content.length - 1]
        expect(footer.content[0].text).toBe('Total: £800')
    })
})
