import { describe, it, expect } from 'vitest'
import { splitAtDividers } from '../src/split.js'

describe('splitAtDividers', () => {
  it('returns a single segment when no dividers exist', () => {
    const nodes = [
      { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toEqual([nodes])
  })

  it('splits into two segments at one divider', () => {
    const nodes = [
      { type: 'heading', content: [{ type: 'text', text: 'Header' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([nodes[0]])
    expect(result[1]).toEqual([nodes[2]])
  })

  it('splits into three segments at two dividers', () => {
    const nodes = [
      { type: 'heading', content: [{ type: 'text', text: 'Header' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Footer' }] },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toHaveLength(3)
    expect(result[0][0].content[0].text).toBe('Header')
    expect(result[1][0].content[0].text).toBe('Body')
    expect(result[2][0].content[0].text).toBe('Footer')
  })

  it('produces empty middle segment for consecutive dividers', () => {
    const nodes = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'divider' },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveLength(1)
    expect(result[1]).toEqual([])
    expect(result[2]).toHaveLength(1)
  })

  it('returns [[]] for empty array', () => {
    expect(splitAtDividers([])).toEqual([[]])
  })

  it('returns [[]] for non-array input', () => {
    expect(splitAtDividers(null)).toEqual([[]])
    expect(splitAtDividers(undefined)).toEqual([[]])
    expect(splitAtDividers('string')).toEqual([[]])
  })

  it('handles divider at the start', () => {
    const nodes = [
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([])
    expect(result[1]).toHaveLength(1)
  })

  it('handles divider at the end', () => {
    const nodes = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      { type: 'divider' },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(1)
    expect(result[1]).toEqual([])
  })

  it('handles many segments', () => {
    const nodes = [
      { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'C' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'D' }] },
    ]
    const result = splitAtDividers(nodes)
    expect(result).toHaveLength(4)
    expect(result[0][0].content[0].text).toBe('A')
    expect(result[1][0].content[0].text).toBe('B')
    expect(result[2][0].content[0].text).toBe('C')
    expect(result[3][0].content[0].text).toBe('D')
  })
})
