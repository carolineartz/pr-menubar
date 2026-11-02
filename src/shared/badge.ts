import { isSnoozeActive } from './fingerprint'
import { reviewStateKey, type ReviewingGroupKey } from './groups'
import type { NextAction, PRSnapshot, SnoozeEntry } from './types'

/** Reviewing sections whose rows sit on your plate. Waiting on them and
 *  Approved by you are theirs to move (even when nextAction says RESUME);
 *  Code owner requests are a pool the whole group draws from. */
const REVIEWING_NEEDS_YOU: ReadonlySet<ReviewingGroupKey> = new Set(['start', 'you'])

/** A bot PR has no author to wait on, so a code-owner request on one is
 *  yours to clear as well. */
const BOT_NEEDS_YOU: ReadonlySet<ReviewingGroupKey> = new Set(['start', 'you', 'team'])

/** What a bot PR you approved still needs from you (see computeNextAction). */
const BOT_OWNER_MOVES: ReadonlySet<NextAction> = new Set(['FIXCI', 'FIX', 'MERGE'])

/** Own PR with a review awaiting your answer: an unresolved thread whose last
 *  word isn't yours, or a changes-requested verdict. Merging, red CI and
 *  conflicts are your move too, but nobody is waiting on a reply for them. */
function owesReviewResponse(pr: PRSnapshot): boolean {
  return pr.threadsAwaitingViewer > 0 || pr.reviewDecision === 'CHANGES_REQUESTED'
}

/**
 * Does this PR need something from you? My PRs: a reviewer is waiting on
 * your reply. Reviewing: it's filed under Start review or Waiting on you —
 * the same classification as the sections, so the count matches the list.
 * Bot PRs also count for Code owner requests, and once you approve one, while
 * it needs fixing or merging. Team/All-only rows never qualify.
 */
export function needsYou(pr: PRSnapshot): boolean {
  if (pr.buckets.includes('my')) return owesReviewResponse(pr)
  if (pr.buckets.includes('rev')) {
    const key = reviewStateKey(pr)
    if (!pr.authorIsBot) return REVIEWING_NEEDS_YOU.has(key)
    return BOT_NEEDS_YOU.has(key) || BOT_OWNER_MOVES.has(pr.nextAction)
  }
  return false
}

/** Tray badge = PRs that need you (see needsYou), excluding snoozed. */
export function badgeCount(
  prs: PRSnapshot[],
  snoozed: Record<string, SnoozeEntry>,
  now: number
): number {
  return prs.filter((pr) => needsYou(pr) && !isSnoozeActive(snoozed[pr.key], pr, now)).length
}
