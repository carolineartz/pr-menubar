import { ACTIONABLE } from './nextAction'
import { isSnoozeActive } from './fingerprint'
import type { PRSnapshot, SnoozeEntry } from './types'

/**
 * Tray badge = PRs whose next action is MINE, on My PRs + Reviewing only
 * (never Team/All), excluding snoozed (HANDOFF.md "Tray badge").
 */
export function badgeCount(
  prs: PRSnapshot[],
  snoozed: Record<string, SnoozeEntry>,
  now: number
): number {
  return prs.filter(
    (pr) =>
      (pr.buckets.includes('my') || pr.buckets.includes('rev')) &&
      ACTIONABLE.has(pr.nextAction) &&
      !isSnoozeActive(snoozed[pr.key], pr, now)
  ).length
}
