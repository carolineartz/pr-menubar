import type { AllQueryParams } from '../../shared/ipc'
import type { Settings } from '../../shared/types'

export const PR_FRAGMENT = /* GraphQL */ `
  fragment PRFields on PullRequest {
    id
    number
    title
    url
    isDraft
    state
    createdAt
    updatedAt
    headRefName
    headRefOid
    repository {
      nameWithOwner
    }
    author {
      login
    }
    mergeable
    reviewDecision
    comments {
      totalCount
    }
    allReviews: reviews {
      totalCount
    }
    pendingMine: reviews(states: [PENDING], first: 1) {
      totalCount
    }
    reviewThreads(first: 30) {
      nodes {
        isResolved
        # last comment per thread: who spoke last + whether the viewer reacted.
        # Budget note: probed 2026-08-28 — the heavy search pair ran 4.3s with
        # these fields (limit ~10s), cost 22 points.
        comments(last: 1) {
          nodes {
            author {
              login
            }
            createdAt
            reactionGroups {
              content
              viewerHasReacted
            }
          }
        }
      }
    }
    # latestReviews keeps one review per author, so a COMMENTED review after an
    # approval hides it; the verdict history keeps it
    verdicts: reviews(states: [APPROVED, CHANGES_REQUESTED], last: 50) {
      nodes {
        state
        submittedAt
        author {
          login
        }
      }
    }
    latestReviews(first: 20) {
      nodes {
        state
        submittedAt
        author {
          login
        }
      }
    }
    reviewRequests(first: 20) {
      nodes {
        requestedReviewer {
          ... on User {
            login
          }
        }
      }
    }
    recentCommits: commits(last: 5) {
      nodes {
        commit {
          committedDate
          parents {
            totalCount
          }
        }
      }
    }
    commits(last: 1) {
      nodes {
        commit {
          committedDate
          statusCheckRollup {
            contexts(first: 60) {
              nodes {
                __typename
                ... on CheckRun {
                  name
                  status
                  conclusion
                  startedAt
                  completedAt
                  detailsUrl
                  checkSuite {
                    databaseId
                  }
                }
                ... on StatusContext {
                  context
                  state
                  targetUrl
                }
              }
            }
          }
        }
      }
    }
  }
`

/** Lightweight fragment for the All feed. GitHub 504s when 50 PRs each carry
 *  per-check contexts + review threads, so the plain feed relies on the
 *  precomputed statusCheckRollup state; PRs you're involved in get full
 *  detail from the involvement query and win the merge. */
export const PR_LITE_FRAGMENT = /* GraphQL */ `
  fragment PRLite on PullRequest {
    id
    number
    title
    url
    isDraft
    state
    createdAt
    updatedAt
    headRefName
    headRefOid
    repository {
      nameWithOwner
    }
    author {
      login
    }
    mergeable
    reviewDecision
    comments {
      totalCount
    }
    allReviews: reviews {
      totalCount
    }
    latestReviews(first: 10) {
      nodes {
        state
        submittedAt
        author {
          login
        }
      }
    }
    reviewRequests(first: 10) {
      nodes {
        requestedReviewer {
          ... on User {
            login
          }
        }
      }
    }
    commits(last: 1) {
      nodes {
        commit {
          committedDate
          statusCheckRollup {
            state
          }
        }
      }
    }
  }
`

export interface PollQuery {
  document: string
  variables: Record<string, unknown>
}

export type InvolvementAlias = 'mine' | 'reviewReq' | 'reviewedBy' | 'commented' | 'team'

/** PRs per detail request. Probed 2026-09-30: 10 PRs with PRFields run
 *  2.5–4s of GitHub's ~10s per-request budget; a single 30-result search with
 *  PRFields ran ~9s and pairs of them 504'd or came back truncated. */
export const DETAIL_CHUNK_SIZE = 10

/**
 * Involvement searches, ids only — detail comes from `buildDetailQuery` in
 * parallel chunks, which also fetches a PR once however many searches match
 * it. Searches are included only when they can match (repos configured /
 * team list non-empty); with none, the query still answers `viewer`.
 */
export function buildInvolvementQuery(
  settings: Settings
): PollQuery & { aliases: InvolvementAlias[] } {
  const repoQualifier = settings.repos.map((r) => `repo:${r}`).join(' ')
  const parts: [InvolvementAlias, string][] = []
  if (settings.repos.length > 0) {
    parts.push(
      ['mine', `is:pr is:open author:@me ${repoQualifier}`],
      ['reviewReq', `is:pr is:open review-requested:@me ${repoQualifier}`],
      ['reviewedBy', `is:pr is:open reviewed-by:@me -author:@me ${repoQualifier}`],
      ['commented', `is:pr is:open commenter:@me -author:@me ${repoQualifier}`]
    )
    if (settings.teamUsernames.length > 0) {
      const authors = settings.teamUsernames.map((u) => `author:${u}`).join(' ')
      parts.push(['team', `is:pr is:open ${authors} ${repoQualifier}`])
    }
  }

  const variables: Record<string, unknown> = {}
  const varDefs: string[] = []
  const searches: string[] = []
  for (const [alias, q] of parts) {
    varDefs.push(`$${alias}Q: String!`)
    variables[`${alias}Q`] = q
    searches.push(
      `${alias}: search(query: $${alias}Q, type: ISSUE, first: 30) { nodes { ... on PullRequest { id } } }`
    )
  }
  const document = /* GraphQL */ `
    query Involvement${varDefs.length ? `(${varDefs.join(', ')})` : ''} {
      viewer {
        login
      }
      rateLimit {
        cost
        remaining
        resetAt
      }
      ${searches.join('\n      ')}
    }
  `
  return { document, variables, aliases: parts.map(([alias]) => alias) }
}

/** Full per-check detail for up to `DETAIL_CHUNK_SIZE` PRs by node id. */
export function buildDetailQuery(ids: string[]): PollQuery {
  return {
    document: /* GraphQL */ `
      query Detail($ids: [ID!]!) {
        rateLimit {
          cost
          remaining
          resetAt
        }
        nodes(ids: $ids) {
          ...PRFields
        }
      }
      ${PR_FRAGMENT}
    `,
    variables: { ids }
  }
}

/** Search text with the qualifiers GitHub's search understands. Free text
 *  is matched against titles only; qualifiers the user types (label:, head:)
 *  pass through untouched. */
export function allSearchString(settings: Settings, params: AllQueryParams): string {
  const repos = params.repo ? [params.repo] : settings.repos
  const parts = ['is:pr', 'is:open']
  if (params.author) parts.push(`author:${params.author}`)
  if (params.hideDrafts) parts.push('draft:false')
  const text = params.text.trim()
  if (text) parts.push(text, 'in:title')
  parts.push('sort:created-desc', ...repos.map((r) => `repo:${r}`))
  return parts.join(' ')
}

/** On-demand: the All feed narrowed server-side (author / title text / no
 *  drafts / one repo). The poll's feed caps at the 50 newest overall, which
 *  can miss older PRs; a narrowed search finds them and reports an exact total. */
export function buildAllSearchQuery(settings: Settings, params: AllQueryParams): PollQuery {
  return {
    document: /* GraphQL */ `
      query AllSearch($allOpenQ: String!) {
        viewer {
          login
        }
        rateLimit {
          cost
          remaining
          resetAt
        }
        allOpen: search(query: $allOpenQ, type: ISSUE, first: 50) {
          issueCount
          nodes {
            ...PRLite
          }
        }
      }
      ${PR_LITE_FRAGMENT}
    `,
    variables: { allOpenQ: allSearchString(settings, params) }
  }
}

/** The All feed: newest open PRs across watched repos, light fragment. */
export function buildAllOpenQuery(settings: Settings): PollQuery {
  const repoQualifier = settings.repos.map((r) => `repo:${r}`).join(' ')
  return {
    document: /* GraphQL */ `
      query AllOpen($allOpenQ: String!) {
        rateLimit {
          cost
          remaining
          resetAt
        }
        allOpen: search(query: $allOpenQ, type: ISSUE, first: 50) {
          issueCount
          nodes {
            ...PRLite
          }
        }
      }
      ${PR_LITE_FRAGMENT}
    `,
    variables: { allOpenQ: `is:pr is:open sort:created-desc ${repoQualifier}` }
  }
}
