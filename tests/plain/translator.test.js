import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/plain/tokenizer.js'
import { parse } from '../../src/plain/parser.js'
import { translate } from '../../src/plain/translator.js'

/** Compile a Plain expression to a Loom expression string (no braces). */
const T = (src) => translate(parse(tokenize(src)))

describe('plain translator — basics', () => {
    it('bare variable', () => {
        expect(T('publication.title')).toBe('publication.title')
    })

    it('explicit SHOW', () => {
        expect(T('SHOW publication.title')).toBe('publication.title')
    })

    it('number literal', () => {
        expect(T('42')).toBe('42')
    })
})

describe('plain translator — formatting', () => {
    it('AS long date', () => {
        expect(T('SHOW x AS long date')).toBe('# -date=long x')
    })

    it('AS date', () => {
        expect(T('SHOW x AS date')).toBe('# -date x')
    })

    it('AS currency USD', () => {
        expect(T('SHOW price AS currency USD')).toBe('# -currency=usd price')
    })

    it('AS currency (no value)', () => {
        expect(T('SHOW price AS currency')).toBe('# -currency price')
    })

    it('AS phone', () => {
        expect(T('SHOW member.phone AS phone')).toBe('# -phone member.phone')
    })

    it('AS year only', () => {
        expect(T('SHOW d AS year only')).toBe('# -date=y d')
    })

    it('AS JSON', () => {
        expect(T('SHOW x AS JSON')).toBe('# -json x')
    })
})

describe('plain translator — labels', () => {
    it('WITH LABEL alone', () => {
        expect(T('SHOW price WITH LABEL')).toBe('# -label price')
    })

    it('WITH LABEL "Cost"', () => {
        expect(T('SHOW price WITH LABEL "Cost"')).toBe("# -label='Cost' price")
    })
})

describe('plain translator — conditionals', () => {
    it('IF ... SHOW ... OTHERWISE SHOW ...', () => {
        expect(T('IF age >= 18 SHOW "Adult" OTHERWISE SHOW "Minor"')).toBe(
            "? (>= age 18) 'Adult' 'Minor'"
        )
    })

    it('IF ... THEN ... ELSE ...', () => {
        expect(T('IF age >= 18 THEN "Adult" ELSE "Minor"')).toBe(
            "? (>= age 18) 'Adult' 'Minor'"
        )
    })

    it('IF with no else', () => {
        expect(T('IF x SHOW "a"')).toBe("? x 'a'")
    })

    it('trailing IF becomes a filter', () => {
        expect(T('SHOW publications.title IF published')).toBe('? published publications.title')
    })

    it('WHERE is a synonym of trailing IF', () => {
        expect(T('SHOW publications.title WHERE refereed')).toBe(
            '? refereed publications.title'
        )
    })

    it('WHERE with compound condition', () => {
        expect(T('SHOW publications.title WHERE refereed AND year > 2020')).toBe(
            '? (& refereed (> year 2020)) publications.title'
        )
    })
})

describe('plain translator — sorting', () => {
    it('SORTED BY (default ascending)', () => {
        expect(T('SHOW publications.title SORTED BY publications.date')).toBe(
            '>> -by=date publications.title'
        )
    })

    it('SORTED BY ... DESCENDING', () => {
        expect(T('SHOW publications.title SORTED BY publications.date DESCENDING')).toBe(
            '>> -desc -by=date publications.title'
        )
    })

    it('FROM LOWEST TO HIGHEST', () => {
        expect(T('SHOW publications.title FROM LOWEST TO HIGHEST publications.date')).toBe(
            '>> -by=date publications.title'
        )
    })

    it('FROM HIGHEST TO LOWEST', () => {
        expect(T('SHOW publications.title FROM HIGHEST TO LOWEST publications.date')).toBe(
            '>> -desc -by=date publications.title'
        )
    })
})

describe('plain translator — joining', () => {
    it('JOINED BY ", "', () => {
        expect(T('SHOW publications.title JOINED BY ", "')).toBe(
            "+: ', ' publications.title"
        )
    })
})

describe('plain translator — aggregation', () => {
    it('TOTAL OF', () => {
        expect(T('TOTAL OF grants.amount')).toBe('++ grants.amount')
    })

    it('SUM OF', () => {
        expect(T('SUM OF grants.amount')).toBe('++ grants.amount')
    })

    it('AVERAGE OF', () => {
        expect(T('AVERAGE OF grants.amount')).toBe(
            '/ (++ grants.amount) (++!! grants.amount)'
        )
    })

    it('COUNT OF', () => {
        expect(T('COUNT OF publications')).toBe('++!! publications')
    })

    it('COUNT OF ... WHERE ...', () => {
        expect(T('COUNT OF publications WHERE refereed')).toBe(
            '++!! (? refereed publications)'
        )
    })
})

describe('plain translator — composition', () => {
    it('WHERE + SORTED BY + JOINED BY', () => {
        expect(
            T(
                'SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ", "'
            )
        ).toBe("+: ', ' (>> -desc -by=date (? refereed publications.title))")
    })
})

describe('plain translator — loom passthrough', () => {
    it('passes through a raw loom expression', () => {
        expect(T('{+ 1 2}')).toBe('+ 1 2')
    })
})
