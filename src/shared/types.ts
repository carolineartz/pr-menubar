/** "owner/repo#123" — stable identity for stars, snoozes, notification state */
export type PrKey = string

export type CheckStatus = 'ok' | 'fail' | 'running' | 'queued'

export interface CheckInfo {
  name: string
  status: CheckStatus
  /** preformatted, e.g. "1m 02s" (empty for queued) */
  duration: string
  detailsUrl?: string
  /** GitHub Actions check-suite id, present when re-run is possible */
  suiteId?: number
}

export interface ClassifiedCheck extends CheckInfo {
  /** matched a noisy pattern and is failing — shown as "ignored · noisy" */
  ignored: boolean
}

/**
 * State of the *meaningful* (non-noisy) checks only.
 * Drives next-action and notifications; the visual dot derives from this
 * plus whether a noisy check is failing.
 */
export type CiState = 'none' | 'queued' | 'running' | 'green' | 'failed'

export type DotColor = 'green' | 'red' | 'amber' | 'queued' | 'gray'

export type NextAction = 'FIXCI' | 'MERGE' | 'ADDRESS' | 'REVIEW' | 'RESUME' | 'WAITING'

/** Which poll searches matched this PR ('all' = every open PR in watched repos;
 *  Saved derives from stars) */
export type TabBucket = 'my' | 'rev' | 'team' | 'all'

export type Mergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
export type ViewerReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | null

export interface PRSnapshot {
  key: PrKey
  /** GraphQL node id — lets Saved PRs be re-fetched via nodes(ids:) */
  nodeId: string
  number: number
  title: string
  url: string
  repo: string
  author: string
  authorIsViewer: boolean
  isDraft: boolean
  createdAt: string
  updatedAt: string
  headRefName: string
  headSha: string
  lastCommitAt: string | null
  /** newest non-merge commit — merges from main don't count as activity */
  lastMeaningfulCommitAt: string | null
  mergeable: Mergeable
  reviewDecision: ReviewDecision
  commentCount: number
  reviewCount: number
  unresolvedThreads: number
  approvals: number
  /** logins with an outstanding review request */
  requestedReviewers: string[]
  reviewRequestedFromViewer: boolean
  viewerHasPendingReview: boolean
  viewerLastReviewAt: string | null
  viewerReviewState: ViewerReviewState
  viewerCommented: boolean
  buckets: TabBucket[]

  // ---- derived by classifyChecks + computeNextAction (attached in mapper) ----
  /** false for PRs fetched via the lightweight All-feed fragment: the dot comes
   *  from GitHub's rollup state and per-check detail isn't available */
  checksLoaded: boolean
  checks: ClassifiedCheck[]
  ciState: CiState
  dot: DotColor
  meaningfulFailure: boolean
  nextAction: NextAction
}

export type SnoozeMode = '1h' | 'tomorrow' | 'activity'

export interface SnoozeEntry {
  mode: SnoozeMode
  /** epoch ms — for '1h' and 'tomorrow' */
  until?: number
  /** activityFingerprint at snooze time — for 'activity' */
  fingerprint?: string
}

export interface NoisyPattern {
  /** star-glob, e.g. "codecov/*" */
  pattern: string
  /** limit to one repo ("owner/name"); absent = global */
  repo?: string
}

export interface NotificationToggles {
  ciFail: boolean
  approved: boolean
  reviewRequested: boolean
  comments: boolean
}

export type ThemePreference = 'system' | 'light' | 'dark'

/** Someone who can author PRs — feeds the All-tab author autocomplete. */
export interface Person {
  login: string
  /** display name when the org profile has one */
  name: string | null
}

export interface Settings {
  repos: string[]
  teamUsernames: string[]
  noisyPatterns: NoisyPattern[]
  notifications: NotificationToggles
  badgeEnabled: boolean
  launchAtLogin: boolean
  theme: ThemePreference
  /** Electron accelerator that toggles the popover, e.g. "Cmd+Shift+P"; '' = off */
  globalShortcut: string
  /** e.g. "https://acme.atlassian.net/browse" — '' disables Jira links */
  jiraBaseUrl: string
}

export const DEFAULT_SETTINGS: Settings = {
  repos: [],
  teamUsernames: [],
  noisyPatterns: [{ pattern: 'codecov/*' }],
  notifications: { ciFail: true, approved: true, reviewRequested: true, comments: true },
  badgeEnabled: true,
  launchAtLogin: false,
  theme: 'system',
  globalShortcut: '',
  jiraBaseUrl: ''
}

export interface PrNotifState {
  /** head SHA we last fired a CI-fail notification for (null = never) */
  ciSha: string | null
  ciPhase: 'none' | 'green' | 'running' | 'failed'
  mergeReadyNotified: boolean
  reviewRequestSeen: boolean
  lastNotifiedCommentCount: number
  /** epoch ms of last comment notification (0 = never) */
  lastCommentNotifAt: number
}

export type NotifState = Record<PrKey, PrNotifState>

export type NotifKind = 'ciFail' | 'mergeReady' | 'reviewRequested' | 'comments'

export interface NotifEvent {
  kind: NotifKind
  prKey: PrKey
  title: string
  body: string
  url: string
}
