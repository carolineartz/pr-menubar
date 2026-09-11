import { describe, expect, it } from 'vitest'
import { makeMockPRs } from '../mockData'
import { matchesQuery } from '../search'

const NOW = Date.parse('2026-07-04T12:00:00Z')

describe('matchesQuery (footer fuzzy search)', () => {
  const prs = makeMockPRs(NOW)
  const webhook = prs.find((p) => p.number === 482)!
  const hits = (q: string): number[] => prs.filter((p) => matchesQuery(p, q)).map((p) => p.number)

  it('empty query matches everything', () => {
    expect(hits('')).toHaveLength(prs.length)
    expect(hits('   ')).toHaveLength(prs.length)
  })

  it('substring of the title, any case', () => {
    expect(hits('WEBHOOK')).toEqual(expect.arrayContaining([482, 91]))
    expect(hits('webhook')).not.toContain(479)
  })

  it('repo, author, branch, and number are searchable', () => {
    expect(hits('billing').sort()).toEqual([91, 96])
    expect(hits('dvest').sort()).toEqual([221, 486])
    expect(hits('ssr-cache')).toEqual([360])
    expect(hits('#455')).toEqual([455])
    expect(hits('455')).toEqual([455])
  })

  it('every token must match somewhere', () => {
    expect(hits('webhook retry')).toEqual([482])
    expect(hits('webhook nonexistentword')).toEqual([])
  })

  it('3+ char tokens match as an in-order subsequence of the title or branch', () => {
    expect(matchesQuery(webhook, 'wbhk')).toBe(true)
    expect(matchesQuery(webhook, 'fxflky')).toBe(true)
    // short tokens stay strict — "zq" would otherwise hit half the list
    expect(matchesQuery(webhook, 'zq')).toBe(false)
    // out of order is not a match
    expect(matchesQuery(webhook, 'khbw')).toBe(false)
  })

  it('a subsequence has to start a word — scattered letters do not count', () => {
    const onboarding = prs.find((p) => p.number === 341)! // "Rework onboarding checklist state machine"
    expect(matchesQuery(onboarding, 'wbhk')).toBe(false)
    expect(matchesQuery(onboarding, 'onbchk')).toBe(true)
  })
})
