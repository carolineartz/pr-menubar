import { describe, expect, it } from 'vitest'
import { makeMockPRs } from '../../../../shared/mockData'
import { isBotAuthor, myGroups, reviewingGroups, rowsFor, type ListContext } from '../selectors'

const NOW = Date.parse('2026-07-04T12:00:00Z')

const ctx: ListContext = { starred: new Set(), snoozed: {}, teamToggles: {}, now: NOW }

const BOTS = ['dependabot']

describe('Reviewing tab groups', () => {
  const prs = makeMockPRs(NOW)
  const groups = reviewingGroups(rowsFor('rev', prs, ctx), BOTS)
  const group = (key: string): (typeof groups)[number] | undefined =>
    groups.find((g) => g.key === key)

  it('approved PRs stay on the tab, in their own group', () => {
    expect(group('approved')?.rows.map((p) => p.key)).toContain('acme/auth#210')
  })

  it('approval wins even when new commits landed after it', () => {
    // #96 has commits newer than the viewer's approval (would otherwise be RESUME)
    const pr = prs.find((p) => p.key === 'acme/billing#96')!
    expect(pr.nextAction).toBe('RESUME')
    expect(group('approved')?.rows.map((p) => p.key)).toContain('acme/billing#96')
    expect(group('continue')?.rows.map((p) => p.key) ?? []).not.toContain('acme/billing#96')
  })

  it('team-owed requests split from individually-requested reviews', () => {
    expect(group('team')?.rows.map((p) => p.key)).toContain('acme/web#350')
    expect(group('start')?.rows.map((p) => p.key)).toEqual(
      expect.arrayContaining(['acme/auth#217', 'acme/api#486'])
    )
    expect(group('start')?.rows.map((p) => p.key)).not.toContain('acme/web#350')
  })

  it('bot authors collect in the bots group, ahead of anything else', () => {
    expect(group('bots')?.rows.map((p) => p.key)).toEqual(['acme/api#495'])
    expect(group('team')?.rows.map((p) => p.key)).not.toContain('acme/api#495')
  })

  it('empty groups are dropped', () => {
    const none = reviewingGroups([], BOTS)
    expect(none).toHaveLength(0)
  })
})

describe('My PRs groups', () => {
  const prs = makeMockPRs(NOW)
  const groups = myGroups(rowsFor('my', prs, ctx))
  const keys = (key: string): string[] =>
    groups.find((g) => g.key === key)?.rows.map((p) => p.key) ?? []

  it('review-decision-approved PRs group under APPROVED, even with failing CI', () => {
    // #482 is FIXCI but fully approved — approval state and CI state are orthogonal
    expect(keys('ready').sort()).toEqual(['acme/api#479', 'acme/api#482'])
  })

  it('drafts get their own group', () => {
    expect(keys('drafts')).toEqual(['acme/billing#91'])
    expect(keys('active')).not.toContain('acme/billing#91')
  })

  it('everything else is in progress', () => {
    expect(keys('active').sort()).toEqual(['acme/api#455', 'acme/api#468'])
  })
})

describe('isBotAuthor', () => {
  it('normalizes [bot] suffixes and app/ prefixes', () => {
    expect(isBotAuthor('dependabot[bot]', ['dependabot'])).toBe(true)
    expect(isBotAuthor('dependabot', ['app/dependabot'])).toBe(true)
    expect(isBotAuthor('Renovate[bot]', ['renovate'])).toBe(true)
    expect(isBotAuthor('mkatz', ['dependabot'])).toBe(false)
  })
})

describe('All tab author filter', () => {
  const prs = makeMockPRs(NOW)

  it('narrows to a single author', () => {
    const filtered = rowsFor('all', prs, { ...ctx, allAuthor: 'mkatz' })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((p) => p.author === 'mkatz')).toBe(true)
  })

  it('does not leak into other tabs', () => {
    const team = rowsFor('team', prs, { ...ctx, allAuthor: 'mkatz' })
    expect(new Set(team.map((p) => p.author)).size).toBeGreaterThan(1)
  })

  it('no filter shows everything', () => {
    expect(rowsFor('all', prs, ctx)).toHaveLength(prs.length)
  })

  it('bucket-less rows from the on-demand author fetch appear only while filtered', () => {
    const extra = { ...prs[0], key: 'acme/api#9001', author: 'mkatz', buckets: [] as never[] }
    const all = [...prs, extra]
    // invisible without the filter (not part of the newest-50 feed)
    expect(rowsFor('all', all, ctx).find((p) => p.key === extra.key)).toBeUndefined()
    // visible when their author is focused
    const filtered = rowsFor('all', all, { ...ctx, allAuthor: 'mkatz' })
    expect(filtered.find((p) => p.key === extra.key)).toBeDefined()
    // and never leaks into other tabs
    expect(rowsFor('my', all, ctx).find((p) => p.key === extra.key)).toBeUndefined()
  })
})

describe('repo focus', () => {
  const prs = makeMockPRs(NOW)

  it('narrows every tab to the focused repo', () => {
    const focused = { ...ctx, repoFocus: 'acme/api' }
    for (const tab of ['my', 'rev', 'team', 'all'] as const) {
      const rows = rowsFor(tab, prs, focused)
      expect(rows.every((p) => p.repo === 'acme/api')).toBe(true)
    }
    // and it actually excludes other repos on the All tab
    expect(rowsFor('all', prs, focused).length).toBeLessThan(prs.length)
    expect(rowsFor('all', prs, focused).length).toBeGreaterThan(0)
  })

  it('composes with the author filter', () => {
    const both = { ...ctx, repoFocus: 'acme/api', allAuthor: 'mkatz' }
    const rows = rowsFor('all', prs, both)
    expect(rows.every((p) => p.repo === 'acme/api' && p.author === 'mkatz')).toBe(true)
  })
})
