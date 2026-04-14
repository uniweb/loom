import { describe, it, expect } from 'vitest'
import { instantiateContent, Loom } from '../src/index.js'

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
