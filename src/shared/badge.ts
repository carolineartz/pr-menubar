import { isSnoozeActive } from './fingerprint'
import { isBotAuthor, reviewingGroupKey, type ReviewingGroupKey } from './groups'
import type { PRSnapshot, SnoozeEntry } from './types'

/** Reviewing sections whose rows sit on your plate. Waiting on them and
 *  Approved by you are theirs to move (even when nextAction says RESUME);
 *  Code owner requests are a pool the whole group draws from. */
const REVIEWING_NEEDS_YOU: ReadonlySet<ReviewingGroupKey> = new Set(['start', 'you'])

/** A bot PR has no author to wait on, so a code-owner request on one is
 *  yours to clear as well. */
const BOT_NEEDS_YOU: ReadonlySet<ReviewingGroupKey> = new Set(['start', 'you', 'team'])

/** Own PR with a review awaiting your answer: an unresolved thread whose last
 *  word isn't yours, or a changes-requested verdict. Merging, red CI and
 *  conflicts are your move too, but nobody is waiting on a reply for them. */
function owesReviewResponse(pr: PRSnapshot): boolean {
  return pr.threadsAwaitingViewer > 0 || pr.reviewDecision === 'CHANGES_REQUESTED'
}

/**
 * Does this PR need something from you? My PRs: a reviewer is waiting on
 * your reply. Reviewing: it's filed under Start review or Waiting on you —
 * the same classification as the sections, so the count matches the list —
 * and for bots also Code owner requests. Team/All-only rows never qualify.
 */
export function needsYou(pr: PRSnapshot, botAuthors: string[]): boolean {
  if (pr.buckets.includes('my')) return owesReviewResponse(pr)
  if (pr.buckets.includes('rev')) {
    // classify bots like anyone else, then widen what counts for them
    const key = reviewingGroupKey(pr, [])
    return (isBotAuthor(pr.author, botAuthors) ? BOT_NEEDS_YOU : REVIEWING_NEEDS_YOU).has(key)
  }
  return false
}

/** Tray badge = PRs that need you (see needsYou), excluding snoozed. */
export function badgeCount(
  prs: PRSnapshot[],
  snoozed: Record<string, SnoozeEntry>,
  botAuthors: string[],
  now: number
): number {
  return prs.filter((pr) => needsYou(pr, botAuthors) && !isSnoozeActive(snoozed[pr.key], pr, now))
    .length
}
