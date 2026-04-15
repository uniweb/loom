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

    it('trailing IF becomes a filter (condition prefixed with list root)', () => {
        expect(T('SHOW publications.title IF published')).toBe(
            '? publications.published publications.title'
        )
    })

    it('WHERE is a synonym of trailing IF (condition prefixed)', () => {
        expect(T('SHOW publications.title WHERE refereed')).toBe(
            '? publications.refereed publications.title'
        )
    })

    it('WHERE with compound condition (all bare vars prefixed)', () => {
        // Both `refereed` and `year` get prefixed with the list root so
        // the condition evaluates per-element via Loom's list-awareness.
        expect(T('SHOW publications.title WHERE refereed AND year > 2020')).toBe(
            '? (& publications.refereed (> publications.year 2020)) publications.title'
        )
    })

    it('WHERE leaves already-dotted paths alone', () => {
        expect(T('SHOW publications.title WHERE publications.refereed')).toBe(
            '? publications.refereed publications.title'
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

describe('plain translator — multi-value show', () => {
    // Multi-value SHOW — three output shapes. `(+: sep ...)` calls
    // joinWithSeparator, which filters empty items before joining
    // (per-item drop). `(+? ...)` calls joinIfAllTrue, which returns ''
    // if any arg is empty (all-or-nothing). Literal prefixes like
    // 'Dr. ' are always non-empty strings, so only variable references
    // can cause a `+?` clause to collapse.

    it('translates comma-separated multi-value SHOW with JOINED BY', () => {
        expect(T("SHOW city, province, country JOINED BY ', '")).toBe(
            "+: ', ' city province country"
        )
    })

    it('translates space-separated prefix + value with IF PRESENT', () => {
        expect(T("SHOW 'Dr. ' title IF PRESENT")).toBe("+? 'Dr. ' title")
    })

    it('translates the labeled-row shape (@name, separator, name)', () => {
        expect(T("SHOW @email, ': ', email IF PRESENT")).toBe(
            "+? @email ': ' email"
        )
    })

    it('translates bare multi-value SHOW with no modifier to empty-separator join', () => {
        // No JOINED BY, no IF PRESENT → concatenate with empty separator
        // but still per-item drop empties. Useful for "first + last name"
        // style concatenation where an absent middle value should vanish.
        expect(T('SHOW a, b, c')).toBe("+: '' a b c")
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

    it('COUNT OF ... WHERE ... (counts truthy values of the prefixed condition)', () => {
        // Cleaner than filter-then-count: `++!! pubs.refereed` counts
        // truthy values in the refereed list directly.
        expect(T('COUNT OF publications WHERE refereed')).toBe(
            '++!! publications.refereed'
        )
    })

    it('COUNT OF ... WHERE ... with compound condition', () => {
        expect(T('COUNT OF publications WHERE year > 2020')).toBe(
            '++!! (> publications.year 2020)'
        )
    })
})

describe('plain translator — composition', () => {
    it('WHERE + SORTED BY + JOINED BY (WHERE condition prefixed)', () => {
        // Note: combining WHERE with SORTED BY and a *projected* list
        // like publications.title has a semantic limitation — the filtered
        // result is a list of strings with no `date` property to sort by.
        // For correct ordering, sort the full list first, then filter.
        // This test just verifies the translation shape; semantics are
        // documented in plain.md.
        expect(
            T(
                'SHOW publications.title WHERE refereed SORTED BY date DESCENDING JOINED BY ", "'
            )
        ).toBe(
            "+: ', ' (>> -desc -by=date (? publications.refereed publications.title))"
        )
    })
})

describe('plain translator — loom passthrough', () => {
    it('passes through a raw loom expression', () => {
        expect(T('{+ 1 2}')).toBe('+ 1 2')
    })
})

describe('plain translator — function calls', () => {
    it('single-arg call', () => {
        expect(T('greet "Diego"')).toBe("greet 'Diego'")
    })

    it('multi-arg call', () => {
        expect(T('fullname "Diego" "Macrini"')).toBe("fullname 'Diego' 'Macrini'")
    })

    it('nested call with Plain inside grouped arg', () => {
        expect(T('bold (SHOW price AS currency USD)')).toBe(
            'bold (# -currency=usd price)'
        )
    })

    it('call with trailing modifier', () => {
        expect(T('filter items SORTED BY date')).toBe(
            '>> -by=date (filter items)'
        )
    })

    it('call with a variable arg', () => {
        expect(T('bold name')).toBe('bold name')
    })
})
