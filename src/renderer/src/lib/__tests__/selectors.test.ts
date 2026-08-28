import { describe, expect, it } from 'vitest'
import { makeMockPRs } from '../../../../shared/mockData'
import {
  isBotAuthor,
  myGroups,
  reviewingGroups,
  rowsFor,
  teamAuthorGroups,
  type ListContext
} from '../selectors'

const NOW = Date.parse('2026-07-04T12:00:00Z')

const ctx: ListContext = { starred: new Set(), snoozed: {}, teamToggles: {}, now: NOW }

const BOTS = ['dependabot']

describe('Reviewing tab groups', () => {
  const prs = makeMockPRs(NOW)
  const groups = reviewingGroups(rowsFor('rev', prs, ctx), BOTS)
  const keys = (key: string): string[] =>
    groups.find((g) => g.key === key)?.rows.map((p) => p.key) ?? []

  it('fresh direct requests → start review', () => {
    expect(keys('start').sort()).toEqual(['acme/api#486', 'acme/auth#217'])
  })

  it('a reply in an unresolved thread puts the PR in waiting-on-you', () => {
    expect(keys('you')).toContain('acme/web#341')
  })

  it('a re-requested review puts the PR in waiting-on-you', () => {
    expect(keys('you')).toContain('acme/auth#221')
  })

  it('reviewed with no response yet → waiting on them', () => {
    expect(keys('them')).toContain('acme/web#322')
    expect(keys('you')).not.toContain('acme/web#322')
  })

  it('a 👍-answered thread does not pull the PR back to waiting-on-you', () => {
    // same PR as the waiting-on-you case, but the mapper counted 0 threads
    // awaiting the viewer (reaction counts as a response)
    const acked = prs.map((p) =>
      p.key === 'acme/web#341' ? { ...p, threadsAwaitingViewer: 0 } : p
    )
    const g = reviewingGroups(rowsFor('rev', acked, ctx), BOTS)
    expect(g.find((x) => x.key === 'them')?.rows.map((p) => p.key)).toContain('acme/web#341')
  })

  it('approved stays approved, even with commits after the approval', () => {
    const pr = prs.find((p) => p.key === 'acme/billing#96')!
    expect(pr.nextAction).toBe('RESUME')
    expect(keys('approved').sort()).toEqual(['acme/auth#210', 'acme/billing#96'])
  })

  it('code owner requests exclude direct tags and bot authors', () => {
    expect(keys('team')).toContain('acme/web#350')
    expect(keys('team')).not.toContain('acme/auth#217')
    expect(keys('bots')).toEqual(['acme/api#495'])
  })

  it('empty groups are dropped', () => {
    expect(reviewingGroups([], BOTS)).toHaveLength(0)
  })
})

describe('Team tab author sections', () => {
  const prs = makeMockPRs(NOW)
  const groups = teamAuthorGroups(rowsFor('team', prs, ctx))

  it('one section per handle, alphabetical', () => {
    expect(groups.map((g) => g.label)).toEqual([...groups.map((g) => g.label)].sort())
    expect(groups.every((g) => g.rows.every((p) => p.author === g.label))).toBe(true)
    expect(groups.map((g) => g.key)).toEqual(groups.map((g) => `author:${g.label}`))
  })
})

describe('My PRs groups', () => {
  const prs = makeMockPRs(NOW)
  const groups = myGroups(rowsFor('my', prs, ctx), 2)
  const keys = (key: string): string[] =>
    groups.find((g) => g.key === key)?.rows.map((p) => p.key) ?? []

  it('review-decision-approved PRs group under APPROVED, even with failing CI', () => {
    // #482 is FIXCI but fully approved — approval state and CI state are orthogonal
    expect(keys('ready').sort()).toEqual(['acme/api#479', 'acme/api#482'])
  })

  it('one approval but not enough engaged reviewers → awaiting reviewers', () => {
    expect(keys('nudge')).toEqual(['acme/web#360'])
  })

  it('the nudge group empties when the engagement bar is met', () => {
    const g = myGroups(rowsFor('my', prs, ctx), 1)
    expect(g.find((x) => x.key === 'nudge')).toBeUndefined()
  })

  it('drafts get their own group', () => {
    expect(keys('drafts')).toEqual(['acme/billing#91'])
    expect(keys('active')).not.toContain('acme/billing#91')
  })

  it('PRs with something on your plate are in progress', () => {
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
