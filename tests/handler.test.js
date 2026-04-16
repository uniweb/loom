import { describe, it, expect } from 'vitest'
import { createLoomHandlers, Loom } from '../src/index.js'

// ── Helpers ─────────────────────────────────────────────────────────

const text = (str) => ({ type: 'text', text: str })
const para = (str) => ({ type: 'paragraph', content: [text(str)] })
const heading = (str) => ({ type: 'heading', attrs: { level: 2 }, content: [text(str)] })
const divider = { type: 'divider' }

/** Simulate block.rawContent and block.properties for a section. */
function makeBlock(nodes, properties = {}) {
  return {
    rawContent: { type: 'doc', content: nodes },
    properties,
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('createLoomHandlers', () => {
  it('throws if vars function is missing', () => {
    expect(() => createLoomHandlers()).toThrow('requires a vars')
    expect(() => createLoomHandlers({})).toThrow('requires a vars')
  })

  it('returns a handlers object with a content function', () => {
    const handlers = createLoomHandlers({ vars: () => ({}) })
    expect(typeof handlers.content).toBe('function')
  })

  describe('content handler — simple instantiation', () => {
    const handlers = createLoomHandlers({
      vars: (data) => data?.profile?.[0],
    })

    it('resolves simple placeholders', () => {
      const block = makeBlock([heading('{name}'), para('{role}')])
      const data = { profile: [{ name: 'Ada', role: 'Mathematician' }] }

      const result = handlers.content(data, block)
      expect(result.content[0].content[0].text).toBe('Ada')
      expect(result.content[1].content[0].text).toBe('Mathematician')
    })

    it('returns null when vars returns falsy', () => {
      const block = makeBlock([para('{name}')])
      expect(handlers.content({}, block)).toBeNull()
      expect(handlers.content({ profile: [] }, block)).toBeNull()
    })

    it('uses simple instantiation when no source param', () => {
      const block = makeBlock([
        heading('{name}'),
        divider,
        para('{title}'),
      ])
      const data = { profile: [{ name: 'Ada', title: 'FRS' }] }

      // No source in properties — treats divider as regular content,
      // uses simple instantiateContent
      const result = handlers.content(data, block)
      expect(result.content[0].content[0].text).toBe('Ada')
    })
  })

  describe('content handler — repeat pattern with source', () => {
    const handlers = createLoomHandlers({
      vars: (data) => data?.profile?.[0],
    })

    it('iterates body per item when source is set', () => {
      const block = makeBlock(
        [heading('{name}'), divider, para('{degree} at {school}')],
        { source: 'education' }
      )
      const data = {
        profile: [{
          name: 'Ada',
          education: [
            { degree: 'BA', school: 'Cambridge' },
            { degree: 'PhD', school: 'London' },
          ],
        }],
      }

      const result = handlers.content(data, block)
      expect(result.content).toHaveLength(3) // header + 2 items
      expect(result.content[0].content[0].text).toBe('Ada')
      expect(result.content[1].content[0].text).toBe('BA at Cambridge')
      expect(result.content[2].content[0].text).toBe('PhD at London')
    })

    it('handles three-part split with footer', () => {
      const block = makeBlock(
        [
          heading('Grants'),
          divider,
          para('{title} — £{amount}'),
          divider,
          para('Total: £{TOTAL OF grants.amount}'),
        ],
        { source: 'grants' }
      )
      const data = {
        profile: [{
          grants: [
            { title: 'Grant A', amount: 500 },
            { title: 'Grant B', amount: 300 },
          ],
        }],
      }

      const result = handlers.content(data, block)
      const footer = result.content[result.content.length - 1]
      expect(footer.content[0].text).toBe('Total: £800')
    })

    it('falls back to simple when source field is empty array', () => {
      const block = makeBlock(
        [heading('{name}'), divider, para('{degree}')],
        { source: 'education' }
      )
      const data = { profile: [{ name: 'Ada', education: [] }] }

      const result = handlers.content(data, block)
      expect(result.content[0].content[0].text).toBe('Ada')
    })

    it('falls back when source field does not exist', () => {
      const block = makeBlock(
        [heading('{name}'), divider, para('{title}')],
        { source: 'nonexistent' }
      )
      const data = { profile: [{ name: 'Ada' }] }

      const result = handlers.content(data, block)
      expect(result.content[0].content[0].text).toBe('Ada')
    })
  })

  describe('options', () => {
    it('accepts a custom engine', () => {
      const loom = new Loom(`[greet who] { Hello, {who}! }`)
      const handlers = createLoomHandlers({
        vars: (data) => data,
        engine: loom,
      })

      const block = makeBlock([para('{greet "World"}')])
      const result = handlers.content({ name: 'test' }, block)
      expect(result.content[0].content[0].text).toBe('Hello, World!')
    })

    it('accepts a custom sourceParam name', () => {
      const handlers = createLoomHandlers({
        vars: (data) => data?.profile?.[0],
        sourceParam: 'iterate',
      })

      const block = makeBlock(
        [heading('Title'), divider, para('{degree}')],
        { iterate: 'education' }
      )
      const data = {
        profile: [{ education: [{ degree: 'BA' }, { degree: 'MA' }] }],
      }

      const result = handlers.content(data, block)
      // header + 2 items
      expect(result.content).toHaveLength(3)
    })

    it('disables repeat when sourceParam is null', () => {
      const handlers = createLoomHandlers({
        vars: (data) => data,
        sourceParam: null,
      })

      const block = makeBlock(
        [para('{name}')],
        { source: 'education' } // ignored because sourceParam is null
      )
      const result = handlers.content({ name: 'Ada' }, block)
      expect(result.content[0].content[0].text).toBe('Ada')
    })
  })

  describe('cv-loom equivalence', () => {
    it('produces the same result as the manual cv-loom handler', () => {
      // This test verifies that createLoomHandlers can replace
      // cv-loom's 40-line manual content handler.
      const handlers = createLoomHandlers({
        vars: (data) => data?.profile?.[0],
      })

      const profile = {
        first_name: 'Charles',
        family_name: 'Darwin',
        education: [
          { degree: 'BA', institution: 'Cambridge', field: 'Theology', start: '1828', end: '1831' },
          { degree: 'Medical studies', institution: 'Edinburgh', field: 'Medicine', start: '1825', end: '1827' },
        ],
      }

      // Header section (no source)
      const headerBlock = makeBlock([
        heading('{first_name} {family_name}'),
      ])
      const headerResult = handlers.content({ profile: [profile] }, headerBlock)
      expect(headerResult.content[0].content[0].text).toBe('Charles Darwin')

      // Education section (with source)
      const eduBlock = makeBlock(
        [
          heading('Education'),
          para('{COUNT OF education} degrees.'),
          divider,
          heading('{degree}'),
          para('{institution} — {field} ({start}–{end})'),
        ],
        { source: 'education' }
      )
      const eduResult = handlers.content({ profile: [profile] }, eduBlock)

      // header: heading + paragraph = 2 nodes
      // body: (heading + paragraph) × 2 items = 4 nodes
      expect(eduResult.content).toHaveLength(6)
      expect(eduResult.content[0].content[0].text).toBe('Education')
      expect(eduResult.content[1].content[0].text).toBe('2 degrees.')
      expect(eduResult.content[2].content[0].text).toBe('BA')
      expect(eduResult.content[3].content[0].text).toBe('Cambridge — Theology (1828–1831)')
      expect(eduResult.content[4].content[0].text).toBe('Medical studies')
      expect(eduResult.content[5].content[0].text).toBe('Edinburgh — Medicine (1825–1827)')
    })
  })
})
