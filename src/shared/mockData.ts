import { classifyChecks } from './noisyChecks'
import { computeNextAction } from './nextAction'
import type {
  CheckInfo,
  NoisyPattern,
  PRSnapshot,
  Settings,
  TabBucket
} from './types'
import { DEFAULT_SETTINGS } from './types'

export const MOCK_VIEWER = 'carolineartz'

export const MOCK_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  repos: ['acme/api', 'acme/web', 'acme/auth', 'acme/billing'],
  teamUsernames: ['mkatz', 'dvest', 'alind', 'rsoto'],
  noisyPatterns: [{ pattern: 'codecov/*' }]
}

interface MockSpec {
  repo: string
  number: number
  title: string
  branch: string
  author: string
  buckets: TabBucket[]
  updatedMin: number
  isDraft?: boolean
  mergeable?: PRSnapshot['mergeable']
  reviewDecision?: PRSnapshot['reviewDecision']
  approvals?: number
  requestedReviewers?: string[]
  reviewRequestedFromViewer?: boolean
  viewerHasPendingReview?: boolean
  viewerLastReviewMin?: number
  viewerReviewState?: PRSnapshot['viewerReviewState']
  viewerCommented?: boolean
  unresolvedThreads?: number
  commentCount?: number
  reviewCount?: number
  lastCommitMin?: number
  checks: [string, CheckInfo['status'], string][]
}

/** The prototype's DATA array, expressed as raw inputs so the real
 *  classify/next-action logic derives the chips, dots, and pills. */
const SPECS: MockSpec[] = [
  {
    repo: 'acme/api', number: 482, title: 'Fix flaky retry logic in webhook dispatcher',
    branch: 'fix/webhook-retry', author: MOCK_VIEWER, buckets: ['my'], updatedMin: 8,
    reviewDecision: 'APPROVED', approvals: 1, commentCount: 4, reviewCount: 2, lastCommitMin: 12,
    checks: [
      ['build', 'ok', '1m 02s'], ['lint', 'ok', '24s'], ['e2e-tests', 'fail', '2m 14s'],
      ['deploy-preview', 'running', '40s'], ['codecov/project', 'fail', '']
    ]
  },
  {
    repo: 'acme/api', number: 479, title: 'Add rate-limit headers to public API',
    branch: 'jt/rate-limit-headers', author: MOCK_VIEWER, buckets: ['my'], updatedMin: 26,
    reviewDecision: 'APPROVED', approvals: 2, commentCount: 7, reviewCount: 3, lastCommitMin: 60,
    checks: [
      ['build', 'ok', '58s'], ['lint', 'ok', '21s'], ['unit', 'ok', '1m 40s'],
      ['e2e-tests', 'ok', '2m 03s'], ['codecov/project', 'ok', '12s']
    ]
  },
  {
    repo: 'acme/api', number: 468, title: 'Refactor session cache eviction policy',
    branch: 'jt/cache-eviction', author: MOCK_VIEWER, buckets: ['my'], updatedMin: 180,
    reviewDecision: 'CHANGES_REQUESTED', unresolvedThreads: 3, commentCount: 11, reviewCount: 2,
    lastCommitMin: 200,
    checks: [['build', 'ok', '1m 05s'], ['lint', 'ok', '22s'], ['e2e-tests', 'ok', '2m 30s']]
  },
  {
    repo: 'acme/api', number: 455, title: 'Bump minimum Node to 22 in CI images',
    branch: 'jt/node-22', author: MOCK_VIEWER, buckets: ['my'], updatedMin: 2880,
    mergeable: 'CONFLICTING', commentCount: 2, reviewCount: 0, lastCommitMin: 2900,
    checks: [['build', 'ok', '1m 11s'], ['lint', 'ok', '20s'], ['e2e-tests', 'ok', '2m 21s']]
  },
  {
    repo: 'acme/billing', number: 91, title: 'Migrate billing webhooks to v2 signatures',
    branch: 'jt/webhooks-v2', author: MOCK_VIEWER, buckets: ['my'], updatedMin: 60, isDraft: true,
    requestedReviewers: ['mkatz', 'dvest'], commentCount: 0, reviewCount: 0, lastCommitMin: 65,
    checks: [['build', 'queued', ''], ['lint', 'queued', '']]
  },
  {
    repo: 'acme/auth', number: 217, title: 'Support SSO domain allow-list',
    branch: 'mk/sso-allowlist', author: 'mkatz', buckets: ['rev', 'team'], updatedMin: 120,
    reviewRequestedFromViewer: true, requestedReviewers: [MOCK_VIEWER],
    commentCount: 1, reviewCount: 0, lastCommitMin: 130,
    checks: [['build', 'ok', '1m 12s'], ['lint', 'ok', '19s'], ['e2e-tests', 'ok', '1m 58s']]
  },
  {
    repo: 'acme/api', number: 486, title: 'Fix N+1 query in org members endpoint',
    branch: 'dv/org-members-n1', author: 'dvest', buckets: ['rev', 'team'], updatedMin: 240,
    reviewRequestedFromViewer: true, requestedReviewers: [MOCK_VIEWER],
    commentCount: 0, reviewCount: 0, lastCommitMin: 245,
    checks: [['build', 'ok', '1m 00s'], ['e2e-tests', 'running', '1m 10s']]
  },
  {
    repo: 'acme/web', number: 341, title: 'Rework onboarding checklist state machine',
    branch: 'al/onboarding-sm', author: 'alind', buckets: ['rev', 'team'], updatedMin: 300,
    viewerCommented: true, commentCount: 9, reviewCount: 1, lastCommitMin: 400,
    checks: [['build', 'ok', '1m 21s'], ['lint', 'ok', '25s'], ['e2e-tests', 'ok', '2m 44s']]
  },
  {
    repo: 'acme/web', number: 322, title: 'Extract transactional email templates',
    branch: 'rs/email-templates', author: 'rsoto', buckets: ['rev', 'team'], updatedMin: 1440,
    reviewDecision: 'CHANGES_REQUESTED', viewerReviewState: 'CHANGES_REQUESTED',
    viewerLastReviewMin: 1440, viewerCommented: true,
    commentCount: 6, reviewCount: 2, lastCommitMin: 2000,
    checks: [['build', 'ok', '1m 02s'], ['e2e-tests', 'fail', '1m 40s']]
  },
  {
    repo: 'acme/api', number: 491, title: 'Add audit log export endpoint',
    branch: 'mk/audit-export', author: 'mkatz', buckets: ['team'], updatedMin: 30,
    approvals: 1, requestedReviewers: ['dvest'], commentCount: 3, reviewCount: 1,
    lastCommitMin: 45,
    checks: [['build', 'ok', '1m 08s'], ['unit', 'running', '52s']]
  }
]

export function makeMockPRs(
  now: number,
  noisyPatterns: NoisyPattern[] = MOCK_SETTINGS.noisyPatterns
): PRSnapshot[] {
  return SPECS.map((s) => {
    const iso = (min: number): string => new Date(now - min * 60_000).toISOString()
    const checks: CheckInfo[] = s.checks.map(([name, status, duration]) => ({
      name,
      status,
      duration,
      detailsUrl: `https://github.com/${s.repo}/pull/${s.number}/checks`
    }))
    const classified = classifyChecks(checks, s.repo, noisyPatterns)
    const base = {
      key: `${s.repo}#${s.number}`,
      nodeId: `MOCK_${s.repo}_${s.number}`,
      number: s.number,
      title: s.title,
      url: `https://github.com/${s.repo}/pull/${s.number}`,
      repo: s.repo,
      author: s.author,
      authorIsViewer: s.author === MOCK_VIEWER,
      isDraft: s.isDraft ?? false,
      updatedAt: iso(s.updatedMin),
      headRefName: s.branch,
      headSha: `sha-${s.number}`,
      lastCommitAt: s.lastCommitMin != null ? iso(s.lastCommitMin) : null,
      mergeable: s.mergeable ?? ('MERGEABLE' as const),
      reviewDecision: s.reviewDecision ?? null,
      commentCount: s.commentCount ?? 0,
      reviewCount: s.reviewCount ?? 0,
      unresolvedThreads: s.unresolvedThreads ?? 0,
      approvals: s.approvals ?? 0,
      requestedReviewers: s.requestedReviewers ?? [],
      reviewRequestedFromViewer: s.reviewRequestedFromViewer ?? false,
      viewerHasPendingReview: s.viewerHasPendingReview ?? false,
      viewerLastReviewAt: s.viewerLastReviewMin != null ? iso(s.viewerLastReviewMin) : null,
      viewerReviewState: s.viewerReviewState ?? null,
      viewerCommented: s.viewerCommented ?? false,
      buckets: s.buckets,
      checks: classified.checks,
      ciState: classified.ciState,
      dot: classified.dot,
      meaningfulFailure: classified.meaningfulFailure
    }
    return { ...base, nextAction: computeNextAction(base) }
  })
}
