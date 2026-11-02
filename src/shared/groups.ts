import type { PRSnapshot } from './types'

export type ReviewingGroupKey = 'start' | 'you' | 'them' | 'team' | 'approved' | 'bots'
export type MyGroupKey = 'yourmove' | 'nudge' | 'inreview' | 'drafts'

/** "dependabot", "dependabot[bot]", and "app/dependabot" are the same account. */
const botName = (login: string): string =>
  login
    .replace(/^app\//i, '')
    .replace(/\[bot\]$/i, '')
    .toLowerCase()

export function isBotAuthor(login: string, botAuthors: string[]): boolean {
  return botAuthors.some((b) => botName(b) === botName(login))
}

/**
 * Reviewing classification — a PR waits on you only if their move is newer
 * than yours. First match wins:
 * - bots
 * - you approved and haven't requested changes since → approved, whatever
 *   follows (commits, re-requests, others' threads, your later comments)
 * - re-requested review (you already engaged, they clicked re-request) →
 *   waiting on you. Keyed off engagement, not your last review state: GitHub
 *   drops a reviewer from latestReviews the moment they're re-requested, so
 *   viewerReviewState is null exactly when this rule matters
 * - fresh direct request, not started → start review
 * - code-owner group request, not started → code owner requests (never PRs
 *   where you're tagged individually — those matched above)
 * - unfinished pending review → waiting on you. Replies in your threads
 *   don't count: the author re-requests you when it's ready again
 * - anything else you've engaged with → waiting on them
 */
export function reviewingGroupKey(pr: PRSnapshot, botAuthors: string[]): ReviewingGroupKey {
  if (isBotAuthor(pr.author, botAuthors)) return 'bots'
  if (pr.viewerApproved) return 'approved'
  const started = pr.viewerReviewState !== null || pr.viewerCommented || pr.viewerHasPendingReview
  if (pr.reviewRequestedFromViewer && started) return 'you'
  if (pr.reviewRequestedFromViewer && !started) return 'start'
  if (pr.reviewRequestedFromTeam && !started) return 'team'
  if (pr.viewerHasPendingReview) return 'you'
  return 'them'
}

/** My PRs classification, by whose move it is. "Your move" holds every own-PR
 *  verb (merge / respond / fix, plus red-dot CI failures); "Awaiting reviewers"
 *  is the nudge list — nothing on your plate, but fewer reviewers engaged than
 *  the repo requires; "In review" is relax-and-wait. */
export function myGroupKey(pr: PRSnapshot, requiredReviews: number): MyGroupKey {
  if (pr.isDraft) return 'drafts'
  if (pr.nextAction !== 'WAITING') return 'yourmove'
  if (pr.engagedReviewers < requiredReviews) return 'nudge'
  return 'inreview'
}
