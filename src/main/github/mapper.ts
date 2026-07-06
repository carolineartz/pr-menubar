import { classifyChecks, type ClassifiedChecks } from '../../shared/noisyChecks'
import { computeNextAction, resolveDot } from '../../shared/nextAction'
import type { CheckInfo, PRSnapshot, Settings, TabBucket } from '../../shared/types'

/* ---- raw GraphQL node shapes (only the fields we read) ---- */

interface GqlReview {
  state: string
  submittedAt: string | null
  author: { login: string } | null
}

interface GqlContext {
  __typename: 'CheckRun' | 'StatusContext'
  name?: string
  status?: string
  conclusion?: string | null
  startedAt?: string | null
  completedAt?: string | null
  detailsUrl?: string | null
  checkSuite?: { databaseId: number | null } | null
  context?: string
  state?: string
  targetUrl?: string | null
}

export interface GqlPR {
  id: string
  number: number
  title: string
  url: string
  isDraft: boolean
  state: string
  createdAt: string
  updatedAt: string
  headRefName: string
  headRefOid: string
  repository: { nameWithOwner: string }
  author: { login: string } | null
  mergeable: string
  reviewDecision: string | null
  comments: { totalCount: number }
  allReviews: { totalCount: number }
  /** absent on PRLite nodes */
  pendingMine?: { totalCount: number }
  reviewThreads?: { nodes: { isResolved: boolean }[] }
  latestReviews: { nodes: GqlReview[] }
  reviewRequests: { nodes: { requestedReviewer: { login: string } | null }[] }
  /** absent on PRLite nodes */
  recentCommits?: {
    nodes: { commit: { committedDate: string; parents: { totalCount: number } } }[]
  }
  commits: {
    nodes: {
      commit: {
        committedDate: string
        statusCheckRollup: { state?: string; contexts?: { nodes: GqlContext[] } } | null
      }
    }[]
  }
}

export interface PollData {
  viewer: { login: string }
  rateLimit: { cost: number; remaining: number; resetAt: string }
  allOpen?: { nodes: (GqlPR | null)[] }
  mine?: { nodes: (GqlPR | null)[] }
  reviewReq?: { nodes: (GqlPR | null)[] }
  reviewedBy?: { nodes: (GqlPR | null)[] }
  commented?: { nodes: (GqlPR | null)[] }
  team?: { nodes: (GqlPR | null)[] }
  saved?: (GqlPR | null)[]
}

function fmtDuration(startIso: string | null | undefined, endIso: string | null | undefined, now: number): string {
  const start = startIso ? Date.parse(startIso) : NaN
  const end = endIso ? Date.parse(endIso) : now
  if (Number.isNaN(start)) return ''
  const sec = Math.max(0, Math.round((end - start) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

/**
 * The rollup returns one CheckRun per workflow run, so re-triggered workflows
 * repeat the same job name ("label" ×4, "remove-preview-env" ×3…). Match
 * GitHub's merge-box behavior: keep only the most recent run per check name.
 */
function dedupeChecks(contexts: GqlContext[]): GqlContext[] {
  const byName = new Map<string, GqlContext>()
  for (const ctx of contexts) {
    const name = ctx.__typename === 'StatusContext' ? ctx.context : ctx.name
    if (!name) continue
    const prev = byName.get(name)
    if (!prev || started(ctx) >= started(prev)) byName.set(name, ctx)
  }
  return [...byName.values()]
}

function started(ctx: GqlContext): number {
  return ctx.startedAt ? Date.parse(ctx.startedAt) : 0
}

function mapCheck(ctx: GqlContext, now: number): CheckInfo {
  if (ctx.__typename === 'StatusContext') {
    return {
      name: ctx.context ?? 'status',
      status: ctx.state === 'SUCCESS' ? 'ok' : ctx.state === 'PENDING' ? 'running' : 'fail',
      duration: '',
      detailsUrl: ctx.targetUrl ?? undefined
    }
  }
  const conclusion = ctx.conclusion
  let status: CheckInfo['status']
  if (ctx.status === 'COMPLETED') {
    status =
      conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED'
        ? 'ok'
        : 'fail'
  } else if (ctx.status === 'IN_PROGRESS') {
    status = 'running'
  } else {
    status = 'queued'
  }
  return {
    name: ctx.name ?? 'check',
    status,
    duration:
      status === 'queued' ? '' : fmtDuration(ctx.startedAt, ctx.completedAt, now),
    detailsUrl: ctx.detailsUrl ?? undefined,
    suiteId: ctx.checkSuite?.databaseId ?? undefined
  }
}

/** PRLite nodes carry only GitHub's precomputed rollup — no per-check detail,
 *  so the noisy-checks rule can't apply. Fine: any PR where that matters
 *  (yours / review-requested) arrives via the full-fragment query. */
function fromRollupState(state: string | undefined): ClassifiedChecks {
  let ciState: ClassifiedChecks['ciState']
  let dot: ClassifiedChecks['dot']
  switch (state) {
    case 'SUCCESS':
      ciState = 'green'
      dot = 'green'
      break
    case 'FAILURE':
    case 'ERROR':
      ciState = 'failed'
      dot = 'red'
      break
    case 'PENDING':
      ciState = 'running'
      dot = 'amber'
      break
    case 'EXPECTED':
      ciState = 'queued'
      dot = 'queued'
      break
    default:
      ciState = 'none'
      dot = 'gray'
  }
  return { checks: [], ciState, dot, meaningfulFailure: ciState === 'failed' }
}

/** Newest commit with a single parent — merge commits (2+ parents) are branch
 *  upkeep, not reviewable activity. When the whole recent window is merges,
 *  report nothing rather than false-flagging a merge as new work. */
function lastMeaningfulCommit(pr: GqlPR): string | null {
  if (!pr.recentCommits) return pr.commits.nodes[0]?.commit.committedDate ?? null
  const recents = pr.recentCommits.nodes
    .map((n) => n.commit)
    .filter((c) => c.parents.totalCount <= 1)
    .map((c) => c.committedDate)
    .sort()
  return recents[recents.length - 1] ?? null
}

function mapOne(
  pr: GqlPR,
  buckets: TabBucket[],
  viewer: string,
  settings: Settings,
  now: number
): PRSnapshot {
  const repo = pr.repository.nameWithOwner
  const author = pr.author?.login ?? 'ghost'
  const commit = pr.commits.nodes[0]?.commit
  const rollup = commit?.statusCheckRollup
  const checksLoaded = rollup?.contexts != null || rollup == null
  const rawChecks = dedupeChecks(rollup?.contexts?.nodes ?? []).map((c) => mapCheck(c, now))
  const classified = checksLoaded
    ? classifyChecks(rawChecks, repo, settings.noisyPatterns)
    : fromRollupState(rollup?.state)

  const myLatestReview = pr.latestReviews.nodes.find(
    (r) => r.author?.login === viewer && r.state !== 'PENDING'
  )
  const requested = pr.reviewRequests.nodes
    .map((n) => n.requestedReviewer?.login)
    .filter((l): l is string => !!l)

  const base = {
    key: `${repo}#${pr.number}`,
    nodeId: pr.id,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    repo,
    author,
    authorIsViewer: author === viewer,
    isDraft: pr.isDraft,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    headRefName: pr.headRefName,
    headSha: pr.headRefOid,
    lastCommitAt: commit?.committedDate ?? null,
    lastMeaningfulCommitAt: lastMeaningfulCommit(pr),
    mergeable: (pr.mergeable === 'MERGEABLE' || pr.mergeable === 'CONFLICTING'
      ? pr.mergeable
      : 'UNKNOWN') as PRSnapshot['mergeable'],
    reviewDecision: (pr.reviewDecision ?? null) as PRSnapshot['reviewDecision'],
    commentCount: pr.comments.totalCount,
    reviewCount: pr.allReviews.totalCount,
    unresolvedThreads: (pr.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length,
    approvals: pr.latestReviews.nodes.filter((r) => r.state === 'APPROVED').length,
    requestedReviewers: requested,
    reviewRequestedFromViewer: requested.includes(viewer),
    viewerHasPendingReview: (pr.pendingMine?.totalCount ?? 0) > 0,
    viewerLastReviewAt: myLatestReview?.submittedAt ?? null,
    viewerReviewState: (myLatestReview &&
    ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(myLatestReview.state)
      ? myLatestReview.state
      : null) as PRSnapshot['viewerReviewState'],
    viewerCommented: false, // set from the `commented` search bucket below
    buckets,
    checksLoaded,
    checks: classified.checks,
    ciState: classified.ciState,
    dot: classified.dot,
    meaningfulFailure: classified.meaningfulFailure
  }
  const nextAction = computeNextAction(base)
  return { ...base, nextAction, dot: resolveDot(base.dot, nextAction) }
}

/** Merge the aliased search results into deduplicated snapshots with bucket tags. */
export function mapPoll(data: PollData, settings: Settings, now: number): PRSnapshot[] {
  const viewer = data.viewer.login
  // full-fragment sources first: on dedupe the first-seen (detailed) node wins
  const sources: [(GqlPR | null)[] | undefined, TabBucket | null, boolean][] = [
    [data.mine?.nodes, 'my', false],
    [data.reviewReq?.nodes, 'rev', false],
    [data.reviewedBy?.nodes, 'rev', false],
    [data.commented?.nodes, 'rev', true],
    [data.team?.nodes, 'team', false],
    [data.saved, null, false],
    [data.allOpen?.nodes, 'all', false]
  ]

  const byId = new Map<string, { pr: GqlPR; buckets: Set<TabBucket>; commented: boolean }>()
  for (const [nodes, bucket, isCommented] of sources) {
    for (const pr of nodes ?? []) {
      if (!pr || pr.state !== 'OPEN') continue
      const entry = byId.get(pr.id) ?? { pr, buckets: new Set<TabBucket>(), commented: false }
      if (bucket) entry.buckets.add(bucket)
      if (isCommented) entry.commented = true
      byId.set(pr.id, entry)
    }
  }

  return [...byId.values()].map(({ pr, buckets, commented }) => {
    const snap = mapOne(pr, [...buckets], viewer, settings, now)
    if (commented && !snap.authorIsViewer) {
      snap.viewerCommented = true
      snap.nextAction = computeNextAction({ ...snap, viewerCommented: true })
    }
    return snap
  })
}
