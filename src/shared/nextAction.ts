import type { DotColor, NextAction, PRSnapshot } from './types'

export const PRIO: Record<NextAction, number> = {
  FIXCI: 0,
  MERGE: 1,
  RESPOND: 2,
  FIX: 3,
  REVIEW: 4,
  RESUME: 5,
  WAITING: 6
}

export const ACTIONABLE: ReadonlySet<NextAction> = new Set([
  'FIXCI',
  'MERGE',
  'RESPOND',
  'FIX',
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
  | 'threadsAwaitingViewer'
  | 'reviewRequestedFromViewer'
  | 'viewerHasPendingReview'
  | 'viewerLastReviewAt'
  | 'viewerReviewState'
  | 'viewerCommented'
  | 'lastMeaningfulCommitAt'
>

/**
 * A MERGE-ready PR shows a green dot even when a noisy check is still failing
 * (quarantined specs etc. would otherwise leave it amber — a false warning on
 * a row whose whole point is "good to go"). The failing check stays visible
 * as "ignored · noisy" in the expanded breakdown.
 */
export function resolveDot(dot: DotColor, nextAction: NextAction): DotColor {
  return nextAction === 'MERGE' && dot === 'amber' ? 'green' : dot
}

/** First match wins. Own PRs answer "what's my move": fix CI, respond to
 *  comments (which outranks merging — an approved PR with an unanswered
 *  comment isn't done), fix requested changes/conflicts, or merge. MERGE
 *  therefore means truly clean: approvals in, green, nothing awaiting you. */
export function computeNextAction(pr: NextActionInput): NextAction {
  const mine = pr.authorIsViewer

  if (mine && pr.meaningfulFailure) return 'FIXCI'

  if (mine && pr.threadsAwaitingViewer > 0) return 'RESPOND'

  if (mine && (pr.reviewDecision === 'CHANGES_REQUESTED' || pr.mergeable === 'CONFLICTING')) {
    return 'FIX'
  }

  if (
    mine &&
    !pr.isDraft &&
    pr.reviewDecision === 'APPROVED' &&
    (pr.ciState === 'green' || pr.ciState === 'none')
  ) {
    return 'MERGE'
  }

  if (!mine) {
    const started =
      pr.viewerHasPendingReview || pr.viewerCommented || pr.viewerReviewState !== null
    if (pr.reviewRequestedFromViewer && !started) return 'REVIEW'

    // merges from main are routine branch upkeep, not something to re-review —
    // only real commits after my review pull the PR back into my queue
    const staleReview =
      pr.viewerLastReviewAt !== null &&
      pr.lastMeaningfulCommitAt !== null &&
      pr.viewerLastReviewAt < pr.lastMeaningfulCommitAt
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
