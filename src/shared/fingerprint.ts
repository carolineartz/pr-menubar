import type { PRSnapshot, SnoozeEntry } from './types'

/**
 * "Activity" for snooze-until-activity = new commit, review, comment,
 * or CI state change (HANDOFF.md).
 */
export type FingerprintInput = Pick<
  PRSnapshot,
  'headSha' | 'reviewCount' | 'commentCount' | 'ciState'
>

export function activityFingerprint(pr: FingerprintInput): string {
  return [pr.headSha, pr.reviewCount, pr.commentCount, pr.ciState].join('|')
}

/** A snooze keeps hiding the row while this returns true. */
export function isSnoozeActive(
  entry: SnoozeEntry | undefined,
  pr: FingerprintInput,
  now: number
): boolean {
  if (!entry) return false
  if (entry.mode === 'activity') return entry.fingerprint === activityFingerprint(pr)
  return (entry.until ?? 0) > now
}

/** Snooze targets: 1h from now, or 8:00 AM tomorrow local time. */
export function snoozeUntil(mode: '1h' | 'tomorrow', now: number): number {
  if (mode === '1h') return now + 60 * 60 * 1000
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return d.getTime()
}
