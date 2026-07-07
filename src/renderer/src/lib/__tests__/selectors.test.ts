import { describe, expect, it } from 'vitest'
import { makeMockPRs } from '../../../../shared/mockData'
import { rowsFor, type ListContext } from '../selectors'

const NOW = Date.parse('2026-07-04T12:00:00Z')

const ctx: ListContext = { starred: new Set(), snoozed: {}, teamToggles: {}, now: NOW }

describe('Reviewing tab hides PRs I already approved', () => {
  const base = makeMockPRs(NOW).find((p) => p.key === 'acme/web#322')! // rev bucket, WAITING

  it('approved + nothing to do → hidden from Reviewing', () => {
    const approved = { ...base, viewerReviewState: 'APPROVED' as const }
    expect(rowsFor('rev', [approved], ctx)).toHaveLength(0)
  })

  it('still visible everywhere else', () => {
    const approved = { ...base, viewerReviewState: 'APPROVED' as const }
    expect(rowsFor('all', [approved], ctx)).toHaveLength(1)
    expect(rowsFor('team', [approved], ctx)).toHaveLength(1)
  })

  it('new commits after my approval bring it back as RESUME', () => {
    const reReview = {
      ...base,
      viewerReviewState: 'APPROVED' as const,
      nextAction: 'RESUME' as const
    }
    expect(rowsFor('rev', [reReview], ctx)).toHaveLength(1)
  })

  it('changes-requested reviews still show under waiting-for-author', () => {
    expect(base.viewerReviewState).toBe('CHANGES_REQUESTED')
    expect(rowsFor('rev', [base], ctx)).toHaveLength(1)
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
