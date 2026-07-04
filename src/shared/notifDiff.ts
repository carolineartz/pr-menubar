import { isSnoozeActive } from './fingerprint'
import type {
  NotifEvent,
  NotifState,
  PRSnapshot,
  PrNotifState,
  Settings,
  SnoozeEntry
} from './types'

const COMMENT_BATCH_MS = 15 * 60 * 1000

export interface DiffOptions {
  settings: Settings
  snoozed: Record<string, SnoozeEntry>
  now: number
}

/**
 * Pure transition detector: compares persisted notification state against the
 * current poll and returns the notifications to fire plus the next state.
 *
 * Invariants (HANDOFF.md "Notifications"):
 * - fire on transitions only, never repeats for the same condition
 * - CI failures: meaningful only (noisy already excluded upstream); re-fires for
 *   a new failure only on a new head SHA
 * - comments: batched, at most one notification per PR per 15 minutes
 * - unknown PRs (first run, newly watched repo) seed silently
 * - snoozed PRs are silent, but state still advances so unsnoozing doesn't
 *   replay stale events
 */
export function diffSnapshots(
  prev: NotifState,
  prs: PRSnapshot[],
  opts: DiffOptions
): { events: NotifEvent[]; nextState: NotifState } {
  const { settings, snoozed, now } = opts
  const events: NotifEvent[] = []
  const nextState: NotifState = {}

  for (const pr of prs) {
    const before = prev[pr.key]
    const mine = pr.authorIsViewer
    const shortRef = `${pr.repo.split('/')[1]} #${pr.number}`

    const after: PrNotifState = {
      ciSha: before?.ciSha ?? null,
      ciPhase: ciPhase(pr),
      mergeReadyNotified: pr.nextAction === 'MERGE' ? (before?.mergeReadyNotified ?? false) : false,
      reviewRequestSeen: pr.reviewRequestedFromViewer ? (before?.reviewRequestSeen ?? false) : false,
      lastNotifiedCommentCount: before?.lastNotifiedCommentCount ?? pr.commentCount,
      lastCommentNotifAt: before?.lastCommentNotifAt ?? 0
    }

    const seeding = !before
    const silent = seeding || isSnoozeActive(snoozed[pr.key], pr, now)
    const fire = (e: NotifEvent): void => {
      if (!silent) events.push(e)
    }

    // 1. CI fails on my PR — on transition, once per failing head SHA
    if (mine && pr.meaningfulFailure && after.ciSha !== pr.headSha) {
      after.ciSha = pr.headSha
      if (settings.notifications.ciFail) {
        const failed = pr.checks.filter((c) => c.status === 'fail' && !c.ignored)
        fire({
          kind: 'ciFail',
          prKey: pr.key,
          title: `CI failed on ${shortRef}`,
          body: failed.map((c) => c.name).join(', ') || pr.title,
          url: pr.url
        })
      }
    }

    // 2. My PR becomes approved / mergeable
    if (mine && pr.nextAction === 'MERGE' && !after.mergeReadyNotified) {
      after.mergeReadyNotified = true
      if (settings.notifications.approved) {
        fire({
          kind: 'mergeReady',
          prKey: pr.key,
          title: `${shortRef} is ready to merge`,
          body: pr.title,
          url: pr.url
        })
      }
    }

    // 3. Someone requests my review
    if (pr.reviewRequestedFromViewer && !after.reviewRequestSeen) {
      after.reviewRequestSeen = true
      if (settings.notifications.reviewRequested) {
        fire({
          kind: 'reviewRequested',
          prKey: pr.key,
          title: `Review requested: ${shortRef}`,
          body: `${pr.author} · ${pr.title}`,
          url: pr.url
        })
      }
    }

    // 4. New comments on my PRs — batched per PR per 15 min
    if (mine && pr.commentCount > after.lastNotifiedCommentCount) {
      if (now - after.lastCommentNotifAt >= COMMENT_BATCH_MS) {
        const delta = pr.commentCount - after.lastNotifiedCommentCount
        after.lastNotifiedCommentCount = pr.commentCount
        after.lastCommentNotifAt = now
        if (settings.notifications.comments) {
          fire({
            kind: 'comments',
            prKey: pr.key,
            title: `${delta} new comment${delta === 1 ? '' : 's'} on ${shortRef}`,
            body: pr.title,
            url: pr.url
          })
        }
      }
      // else: hold — a later poll fires once the window has passed
    }

    nextState[pr.key] = after
  }

  // PRs that disappeared (closed/merged/unwatched) drop out of state entirely.
  return { events, nextState }
}

function ciPhase(pr: PRSnapshot): PrNotifState['ciPhase'] {
  switch (pr.ciState) {
    case 'failed':
      return 'failed'
    case 'running':
    case 'queued':
      return 'running'
    case 'none':
      return 'none'
    case 'green':
      return 'green'
  }
}
