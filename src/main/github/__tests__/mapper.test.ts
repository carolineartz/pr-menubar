import { describe, expect, it } from 'vitest'
import { MOCK_SETTINGS, MOCK_VIEWER } from '../../../shared/mockData'
import { reviewingGroups } from '../../../renderer/src/lib/selectors'
import type { PRSnapshot } from '../../../shared/types'
import { mapPoll, type GqlPR } from '../mapper'

const NOW = Date.parse('2026-10-27T09:00:00Z')

type Review = NonNullable<GqlPR['verdicts']>['nodes'][number]
type Thread = NonNullable<GqlPR['reviewThreads']>['nodes'][number]

const review = (login: string, state: string, submittedAt: string): Review => ({
  state,
  submittedAt,
  author: { login }
})

const thread = (login: string, createdAt: string): Thread => ({
  isResolved: false,
  comments: { nodes: [{ author: { login }, createdAt, reactionGroups: [] }] }
})

/** gocutover/core#12903: you comment, approve, comment again; then the author,
 *  Copilot and another reviewer leave unresolved threads. */
function approvedThenCommented(over: Partial<GqlPR> = {}): GqlPR {
  return {
    id: 'PR_12903',
    number: 12903,
    title: '[CFE-3516] ui: text editor table fixes',
    url: 'https://github.com/acme/api/pull/12903',
    isDraft: false,
    state: 'OPEN',
    createdAt: '2026-09-15T10:00:00Z',
    updatedAt: '2026-10-26T12:34:10Z',
    headRefName: 'CFE-3516-table-fixes',
    headRefOid: 'abc123',
    repository: { nameWithOwner: 'acme/api' },
    author: { login: 'davechisholm' },
    mergeable: 'MERGEABLE',
    reviewDecision: 'REVIEW_REQUIRED',
    comments: { totalCount: 4 },
    allReviews: { totalCount: 6 },
    pendingMine: { totalCount: 0 },
    reviewThreads: {
      nodes: [
        thread('davechisholm', '2026-10-02T15:37:32Z'),
        thread('copilot-pull-request-reviewer', '2026-10-23T16:10:00Z'),
        thread('EmmaCutover', '2026-10-26T12:34:10Z')
      ]
    },
    // GitHub keeps one review per author here: your later COMMENTED hides the approval
    latestReviews: {
      nodes: [
        review(MOCK_VIEWER, 'COMMENTED', '2026-10-23T15:32:47Z'),
        review('EmmaCutover', 'COMMENTED', '2026-10-26T12:34:10Z')
      ]
    },
    verdicts: { nodes: [review(MOCK_VIEWER, 'APPROVED', '2026-10-02T15:48:00Z')] },
    reviewRequests: { nodes: [] },
    recentCommits: {
      nodes: [{ commit: { committedDate: '2026-10-24T09:00:00Z', parents: { totalCount: 1 } } }]
    },
    commits: {
      nodes: [{ commit: { committedDate: '2026-10-24T09:00:00Z', statusCheckRollup: null } }]
    },
    ...over
  }
}

const map = (pr: GqlPR): PRSnapshot =>
  mapPoll(
    {
      viewer: { login: MOCK_VIEWER },
      rateLimit: { cost: 1, remaining: 5000, resetAt: '' },
      reviewedBy: { nodes: [pr] },
      commented: { nodes: [pr] }
    },
    MOCK_SETTINGS,
    NOW
  )[0]

const groupOf = (pr: GqlPR): string | undefined =>
  reviewingGroups([map(pr)]).find((g) => g.rows.length > 0)?.key

describe('an approval is your last move', () => {
  it('a later COMMENTED review, new commits and others’ threads keep it approved', () => {
    const snap = map(approvedThenCommented())
    expect(snap.viewerReviewState).toBe('COMMENTED')
    expect(snap.threadsAwaitingViewer).toBeGreaterThan(0)
    expect(snap.viewerApproved).toBe(true)
    expect(snap.nextAction).toBe('WAITING')
    expect(groupOf(approvedThenCommented())).toBe('approved')
  })

  it('a re-request after approving keeps it approved', () => {
    const pr = approvedThenCommented({
      latestReviews: { nodes: [] },
      reviewRequests: { nodes: [{ requestedReviewer: { login: MOCK_VIEWER } }] }
    })
    expect(map(pr).nextAction).toBe('WAITING')
    expect(groupOf(pr)).toBe('approved')
  })

  it('requesting changes after approving withdraws the approval', () => {
    const pr = approvedThenCommented({
      verdicts: {
        nodes: [
          review(MOCK_VIEWER, 'APPROVED', '2026-10-02T15:48:00Z'),
          review(MOCK_VIEWER, 'CHANGES_REQUESTED', '2026-10-23T15:32:47Z')
        ]
      }
    })
    expect(map(pr).viewerApproved).toBe(false)
    expect(groupOf(pr)).toBe('you')
  })
})
