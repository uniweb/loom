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

  describe('where filtering', () => {
    const handlers = createLoomHandlers({
      vars: (data) => data?.profile?.[0],
    })

    const profile = {
      publications: [
        { title: 'Origin of Species', type: 'book', year: '1859' },
        { title: 'Coral Reefs', type: 'book', year: '1842' },
        { title: 'Tendency of Species', type: 'article-journal', year: '1858' },
        { title: 'Climbing Plants', type: 'article-journal', year: '1875' },
      ],
    }

    it('filters source array with equality expression', () => {
      const block = makeBlock(
        [heading('Books'), divider, para('{title}')],
        { source: 'publications', where: "type = 'book'" }
      )
      const result = handlers.content({ profile: [profile] }, block)
      // header + 2 books (not 4 total)
      expect(result.content).toHaveLength(3)
      expect(result.content[1].content[0].text).toBe('Origin of Species')
      expect(result.content[2].content[0].text).toBe('Coral Reefs')
    })

    it('filters with comparison expression', () => {
      const block = makeBlock(
        [heading('Late works'), divider, para('{title} ({year})')],
        { source: 'publications', where: "year > 1860" }
      )
      const result = handlers.content({ profile: [profile] }, block)
      // header + 1 item (Climbing Plants 1875)
      expect(result.content).toHaveLength(2)
      expect(result.content[1].content[0].text).toBe('Climbing Plants (1875)')
    })

    it('filters with truthy check', () => {
      const data = {
        profile: [{
          pubs: [
            { title: 'A', refereed: true },
            { title: 'B', refereed: false },
            { title: 'C', refereed: true },
          ],
        }],
      }
      const block = makeBlock(
        [heading('Refereed'), divider, para('{title}')],
        { source: 'pubs', where: 'refereed' }
      )
      const result = handlers.content(data, block)
      expect(result.content).toHaveLength(3) // header + 2 refereed
      expect(result.content[1].content[0].text).toBe('A')
      expect(result.content[2].content[0].text).toBe('C')
    })

    it('aggregate expressions in header reflect filtered count', () => {
      const block = makeBlock(
        [
          heading('Books ({COUNT OF publications})'),
          divider,
          para('{title}'),
        ],
        { source: 'publications', where: "type = 'book'" }
      )
      const result = handlers.content({ profile: [profile] }, block)
      // The header should show count of the FILTERED publications (2 books)
      expect(result.content[0].content[0].text).toBe('Books (2)')
    })

    it('ignores where when no source is set', () => {
      const block = makeBlock(
        [para('{title}')],
        { where: "type = 'book'" } // no source — where is ignored
      )
      const data = { profile: [{ title: 'Hello' }] }
      const result = handlers.content(data, block)
      expect(result.content[0].content[0].text).toBe('Hello')
    })

    it('disables where when whereParam is null', () => {
      const h = createLoomHandlers({
        vars: (data) => data?.profile?.[0],
        whereParam: null,
      })
      const block = makeBlock(
        [heading('All'), divider, para('{title}')],
        { source: 'publications', where: "type = 'book'" }
      )
      const result = h.content({ profile: [profile] }, block)
      // All 4 items, where is ignored
      expect(result.content).toHaveLength(5) // header + 4
    })
  })

  describe('sort_by + order', () => {
    const handlers = createLoomHandlers({
      vars: (data) => data?.profile?.[0],
    })

    const profile = {
      publications: [
        { title: 'Origin of Species', year: 1859 },
        { title: 'Coral Reefs', year: 1842 },
        { title: 'Tendency of Species', year: 1858 },
        { title: 'Climbing Plants', year: 1875 },
      ],
      // Calendar-shaped strings (YYYY/M) — chronological compare must
      // beat plain string compare so '2012/9' precedes '2012/12'.
      events: [
        { name: 'Aug', when: '2012/8' },
        { name: 'Dec', when: '2012/12' },
        { name: 'Sep', when: '2012/9' },
      ],
    }

    it('sorts ascending by default when sort_by is set', () => {
      const block = makeBlock(
        [heading('Pubs'), divider, para('{title} ({year})')],
        { source: 'publications', sort_by: 'year' }
      )
      const result = handlers.content({ profile: [profile] }, block)
      // header + 4 items in ascending year
      expect(result.content).toHaveLength(5)
      expect(result.content[1].content[0].text).toBe('Coral Reefs (1842)')
      expect(result.content[2].content[0].text).toBe('Tendency of Species (1858)')
      expect(result.content[3].content[0].text).toBe('Origin of Species (1859)')
      expect(result.content[4].content[0].text).toBe('Climbing Plants (1875)')
    })

    it('sorts descending when order: desc', () => {
      const block = makeBlock(
        [heading('Pubs'), divider, para('{title} ({year})')],
        { source: 'publications', sort_by: 'year', order: 'desc' }
      )
      const result = handlers.content({ profile: [profile] }, block)
      expect(result.content[1].content[0].text).toBe('Climbing Plants (1875)')
      expect(result.content[2].content[0].text).toBe('Origin of Species (1859)')
      expect(result.content[3].content[0].text).toBe('Tendency of Species (1858)')
      expect(result.content[4].content[0].text).toBe('Coral Reefs (1842)')
    })

    it('treats date-shaped strings chronologically (2012/9 before 2012/12)', () => {
      const block = makeBlock(
        [heading('Events'), divider, para('{name}')],
        { source: 'events', sort_by: 'when' }
      )
      const result = handlers.content({ profile: [profile] }, block)
      // Ascending by date: Aug, Sep, Dec
      expect(result.content[1].content[0].text).toBe('Aug')
      expect(result.content[2].content[0].text).toBe('Sep')
      expect(result.content[3].content[0].text).toBe('Dec')
    })

    it('order is case-insensitive', () => {
      const block = makeBlock(
        [heading('Pubs'), divider, para('{year}')],
        { source: 'publications', sort_by: 'year', order: 'DESC' }
      )
      const result = handlers.content({ profile: [profile] }, block)
      expect(result.content[1].content[0].text).toBe('1875')
    })

    it('composes with where: filter first, then sort the filtered set', () => {
      const data = {
        profile: [{
          pubs: [
            { title: 'Old book', type: 'book', year: 1842 },
            { title: 'New book', type: 'book', year: 1859 },
            { title: 'Article', type: 'article-journal', year: 1900 },
          ],
        }],
      }
      const block = makeBlock(
        [heading('Books'), divider, para('{title}')],
        {
          source: 'pubs',
          where: "type = 'book'",
          sort_by: 'year',
          order: 'desc',
        }
      )
      const result = handlers.content(data, block)
      // header + 2 books (article filtered out), DESC by year
      expect(result.content).toHaveLength(3)
      expect(result.content[1].content[0].text).toBe('New book')
      expect(result.content[2].content[0].text).toBe('Old book')
    })

    it('records with missing field sort after records with one', () => {
      const data = {
        profile: [{
          items: [
            { name: 'B', when: '2010' },
            { name: 'A', when: '2008' },
            { name: 'C' }, // no when
          ],
        }],
      }
      const block = makeBlock(
        [heading('All'), divider, para('{name}')],
        { source: 'items', sort_by: 'when' }
      )
      const result = handlers.content(data, block)
      // ascending: A (2008), B (2010), then C (missing) at the end
      expect(result.content[1].content[0].text).toBe('A')
      expect(result.content[2].content[0].text).toBe('B')
      expect(result.content[3].content[0].text).toBe('C')
    })

    it('preserves source order when sort_by is absent', () => {
      const block = makeBlock(
        [heading('Pubs'), divider, para('{title}')],
        { source: 'publications' }
      )
      const result = handlers.content({ profile: [profile] }, block)
      // unchanged from source
      expect(result.content[1].content[0].text).toBe('Origin of Species')
      expect(result.content[2].content[0].text).toBe('Coral Reefs')
      expect(result.content[3].content[0].text).toBe('Tendency of Species')
      expect(result.content[4].content[0].text).toBe('Climbing Plants')
    })

    it('disables sort when sortByParam is null', () => {
      const h = createLoomHandlers({
        vars: (data) => data?.profile?.[0],
        sortByParam: null,
      })
      const block = makeBlock(
        [heading('Pubs'), divider, para('{title}')],
        { source: 'publications', sort_by: 'year' } // ignored
      )
      const result = h.content({ profile: [profile] }, block)
      // back to source order
      expect(result.content[1].content[0].text).toBe('Origin of Species')
    })

    it('ignores order when orderParam is null (always asc)', () => {
      const h = createLoomHandlers({
        vars: (data) => data?.profile?.[0],
        orderParam: null,
      })
      const block = makeBlock(
        [heading('Pubs'), divider, para('{year}')],
        { source: 'publications', sort_by: 'year', order: 'desc' }
      )
      const result = h.content({ profile: [profile] }, block)
      // asc despite order: desc in frontmatter
      expect(result.content[1].content[0].text).toBe('1842')
    })

    it('accepts custom sortByParam / orderParam names', () => {
      const h = createLoomHandlers({
        vars: (data) => data?.profile?.[0],
        sortByParam: 'orderBy',
        orderParam: 'direction',
      })
      const block = makeBlock(
        [heading('Pubs'), divider, para('{year}')],
        { source: 'publications', orderBy: 'year', direction: 'desc' }
      )
      const result = h.content({ profile: [profile] }, block)
      expect(result.content[1].content[0].text).toBe('1875')
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
