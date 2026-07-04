import type { NextAction, PRSnapshot } from './types'

export const PRIO: Record<NextAction, number> = {
  FIXCI: 0,
  MERGE: 1,
  ADDRESS: 2,
  REVIEW: 3,
  RESUME: 4,
  WAITING: 5
}

export const ACTIONABLE: ReadonlySet<NextAction> = new Set([
  'FIXCI',
  'MERGE',
  'ADDRESS',
  'REVIEW',
  'RESUME'
])

/** Everything computeNextAction needs — mapper calls it before the snapshot is complete. */
export type NextActionInput = Pick<
  PRSnapshot,
  | 'authorIsViewer'
  | 'isDraft'
  | 'meaningfulFailure'
  | 'ciState'
  | 'mergeable'
  | 'reviewDecision'
  | 'unresolvedThreads'
  | 'reviewRequestedFromViewer'
  | 'viewerHasPendingReview'
  | 'viewerLastReviewAt'
  | 'viewerReviewState'
  | 'viewerCommented'
  | 'lastCommitAt'
>

/** First match wins (HANDOFF.md "Next-action computation"). */
export function computeNextAction(pr: NextActionInput): NextAction {
  const mine = pr.authorIsViewer

  if (mine && pr.meaningfulFailure) return 'FIXCI'

  if (
    mine &&
    !pr.isDraft &&
    pr.reviewDecision === 'APPROVED' &&
    (pr.ciState === 'green' || pr.ciState === 'none') &&
    pr.mergeable !== 'CONFLICTING'
  ) {
    return 'MERGE'
  }

  if (
    mine &&
    (pr.reviewDecision === 'CHANGES_REQUESTED' ||
      pr.unresolvedThreads > 0 ||
      pr.mergeable === 'CONFLICTING')
  ) {
    return 'ADDRESS'
  }

  if (!mine) {
    const started =
      pr.viewerHasPendingReview || pr.viewerCommented || pr.viewerReviewState !== null
    if (pr.reviewRequestedFromViewer && !started) return 'REVIEW'

    const staleReview =
      pr.viewerLastReviewAt !== null &&
      pr.lastCommitAt !== null &&
      pr.viewerLastReviewAt < pr.lastCommitAt
    if (
      pr.viewerHasPendingReview ||
      (pr.viewerCommented && pr.viewerReviewState === null) ||
      staleReview
    ) {
      return 'RESUME'
    }
  }

  return 'WAITING'
}
