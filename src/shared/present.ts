import type { PRSnapshot } from './types'

export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return ''
  const sec = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

/** Compact single-unit age: "8m", "2h", "5d". */
export function relativeShort(iso: string | null, now: number): string {
  if (!iso) return ''
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

/**
 * Reviewing tab: what timestamp am I behind on? Stale reviews measure from
 * the newest real (non-merge) commit; everything else from the PR's update.
 */
export function behindSince(pr: PRSnapshot): string {
  if (
    pr.nextAction === 'RESUME' &&
    pr.viewerLastReviewAt &&
    pr.lastMeaningfulCommitAt &&
    pr.lastMeaningfulCommitAt > pr.viewerLastReviewAt
  ) {
    return pr.lastMeaningfulCommitAt
  }
  return pr.updatedAt
}

export type PillTone = 'green' | 'red' | 'neut'

/**
 * Review-status pill. REVIEW/RESUME rows show none — the chip already says
 * what to do (matches every row in the prototype dataset).
 */
export function pillFor(pr: PRSnapshot): [string, PillTone] | null {
  if (pr.nextAction === 'REVIEW' || pr.nextAction === 'RESUME') return null
  if (pr.mergeable === 'CONFLICTING') return ['Conflicts', 'red']
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return ['Changes req.', 'red']
  if (pr.reviewDecision === 'APPROVED') {
    return [pr.approvals > 1 ? `${pr.approvals} approvals` : 'Approved', 'green']
  }
  const wanted = pr.approvals + pr.requestedReviewers.length
  if (wanted > 0) return [`${pr.approvals} of ${wanted} review${wanted === 1 ? '' : 's'}`, 'neut']
  return null
}

/** Stable subtle tint per repo. Blended with the meta-text color so it keeps
 *  the same contrast as its neighbors in both themes — a hue hint, not a link. */
export function repoTint(repo: string): string {
  let h = 0
  for (let i = 0; i < repo.length; i++) h = (h * 31 + repo.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `color-mix(in oklab, var(--txt3) 45%, hsl(${hue} 75% 58%))`
}

/** Everything in the meta line after the repo name: `#123 · context`. */
export function metaContext(pr: PRSnapshot, now: number): string {
  let context: string
  if (pr.nextAction === 'REVIEW') {
    // request-event timestamps aren't in the poll query; updatedAt approximates
    context = `review requested ${relativeTime(pr.updatedAt, now)}`
  } else if (pr.nextAction === 'RESUME') {
    if (pr.viewerHasPendingReview) context = 'you have an unfinished review'
    else if (pr.viewerCommented && pr.viewerReviewState === null) context = 'you commented — review not submitted'
    else context = `updated since your review · ${relativeTime(pr.updatedAt, now)}`
  } else if (
    !pr.authorIsViewer &&
    pr.viewerReviewState === 'CHANGES_REQUESTED' &&
    pr.viewerLastReviewAt
  ) {
    context = `you requested changes ${relativeTime(pr.viewerLastReviewAt, now)}`
  } else {
    context = `updated ${relativeTime(pr.updatedAt, now)}`
    if (pr.mergeable === 'CONFLICTING') context += ' · conflicts with main'
  }
  return `#${pr.number} · ${context}`
}

/** Full meta line as plain text (tests / non-interactive rendering). */
export function metaFor(pr: PRSnapshot, now: number): string {
  const draft = pr.isDraft ? 'Draft · ' : ''
  return `${draft}${pr.repo} ${metaContext(pr, now)}`
}

/** Stable avatar colors: viewer always blue; others hashed onto the palette. */
const VIEWER_COLOR = '#3c7dd6'
const OTHER_COLORS = ['#7c5cd6', '#c97a35', '#38995c', '#cf5878']

export function avatarColor(login: string, isViewer: boolean): string {
  if (isViewer) return VIEWER_COLOR
  let h = 0
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0
  return OTHER_COLORS[h % OTHER_COLORS.length]
}

export function initials(login: string, isViewer: boolean): string {
  if (isViewer) return 'YOU'
  return login.slice(0, 2).toUpperCase()
}
