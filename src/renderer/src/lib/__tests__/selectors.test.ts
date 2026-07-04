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
