import { describe, expect, it } from 'vitest'
import { computeNextAction, type NextActionInput } from '../nextAction'

function base(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    authorIsViewer: true,
    isDraft: false,
    meaningfulFailure: false,
    ciState: 'green',
    mergeable: 'MERGEABLE',
    reviewDecision: null,
    unresolvedThreads: 0,
    reviewRequestedFromViewer: false,
    viewerHasPendingReview: false,
    viewerLastReviewAt: null,
    viewerReviewState: null,
    viewerCommented: false,
    lastCommitAt: '2026-07-01T10:00:00Z',
    ...over
  }
}

describe('computeNextAction — first match wins', () => {
  it('FIXCI: my PR with a meaningful failure', () => {
    expect(computeNextAction(base({ meaningfulFailure: true, ciState: 'failed' }))).toBe('FIXCI')
  })

  it('FIXCI beats MERGE-worthy state', () => {
    expect(
      computeNextAction(
        base({ meaningfulFailure: true, ciState: 'failed', reviewDecision: 'APPROVED' })
      )
    ).toBe('FIXCI')
  })

  it('MERGE: approved, green, no conflicts', () => {
    expect(computeNextAction(base({ reviewDecision: 'APPROVED' }))).toBe('MERGE')
  })

  it('MERGE allowed with no checks at all', () => {
    expect(computeNextAction(base({ reviewDecision: 'APPROVED', ciState: 'none' }))).toBe('MERGE')
  })

  it('no MERGE while checks are running', () => {
    expect(computeNextAction(base({ reviewDecision: 'APPROVED', ciState: 'running' }))).toBe(
      'WAITING'
    )
  })

  it('no MERGE on drafts', () => {
    expect(computeNextAction(base({ reviewDecision: 'APPROVED', isDraft: true }))).toBe('WAITING')
  })

  it('ADDRESS: changes requested', () => {
    expect(computeNextAction(base({ reviewDecision: 'CHANGES_REQUESTED' }))).toBe('ADDRESS')
  })

  it('ADDRESS: unresolved review threads', () => {
    expect(computeNextAction(base({ unresolvedThreads: 2 }))).toBe('ADDRESS')
  })

  it('ADDRESS: merge conflicts (even when approved)', () => {
    expect(
      computeNextAction(base({ reviewDecision: 'APPROVED', mergeable: 'CONFLICTING' }))
    ).toBe('ADDRESS')
  })

  it('mergeable UNKNOWN is not treated as a conflict', () => {
    expect(computeNextAction(base({ mergeable: 'UNKNOWN' }))).toBe('WAITING')
  })

  it('REVIEW: requested from me, not started', () => {
    expect(
      computeNextAction(base({ authorIsViewer: false, reviewRequestedFromViewer: true }))
    ).toBe('REVIEW')
  })

  it('RESUME: pending (unsubmitted) review draft', () => {
    expect(
      computeNextAction(
        base({
          authorIsViewer: false,
          reviewRequestedFromViewer: true,
          viewerHasPendingReview: true
        })
      )
    ).toBe('RESUME')
  })

  it('RESUME: commented without submitting a review', () => {
    expect(computeNextAction(base({ authorIsViewer: false, viewerCommented: true }))).toBe(
      'RESUME'
    )
  })

  it('RESUME: my review predates the newest commit', () => {
    expect(
      computeNextAction(
        base({
          authorIsViewer: false,
          viewerReviewState: 'APPROVED',
          viewerLastReviewAt: '2026-07-01T09:00:00Z',
          lastCommitAt: '2026-07-01T10:00:00Z'
        })
      )
    ).toBe('RESUME')
  })

  it('WAITING: I requested changes and nothing new happened', () => {
    expect(
      computeNextAction(
        base({
          authorIsViewer: false,
          viewerReviewState: 'CHANGES_REQUESTED',
          viewerCommented: true,
          viewerLastReviewAt: '2026-07-01T11:00:00Z',
          lastCommitAt: '2026-07-01T10:00:00Z'
        })
      )
    ).toBe('WAITING')
  })

  it('WAITING: my draft with queued checks', () => {
    expect(computeNextAction(base({ isDraft: true, ciState: 'queued' }))).toBe('WAITING')
  })
})
