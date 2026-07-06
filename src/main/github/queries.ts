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

/**
 * Involvement searches with full per-check detail, split into TWO requests:
 * each search costs ~3–4s of GitHub's ~10s per-request execution budget on a
 * large repo, so four in one document flips 504s. Two per request is safe.
 * Searches are included only when they can match (repos configured / team
 * list non-empty / stars exist).
 */
export function buildInvolvementQueries(settings: Settings, savedNodeIds: string[]): PollQuery[] {
  const repoQualifier = settings.repos.map((r) => `repo:${r}`).join(' ')

  const build = (parts: [alias: string, q: string][], withSaved: boolean): PollQuery => {
    const searches: string[] = []
    const variables: Record<string, unknown> = {}
    const varDefs: string[] = []
    for (const [alias, q] of parts) {
      varDefs.push(`$${alias}Q: String!`)
      variables[`${alias}Q`] = q
      searches.push(
        `${alias}: search(query: $${alias}Q, type: ISSUE, first: 30) { nodes { ...PRFields } }`
      )
    }
    if (withSaved && savedNodeIds.length > 0) {
      varDefs.push('$savedIds: [ID!]!')
      variables['savedIds'] = savedNodeIds
      searches.push('saved: nodes(ids: $savedIds) { ...PRFields }')
    }
    const document = /* GraphQL */ `
      query Poll${varDefs.length ? `(${varDefs.join(', ')})` : ''} {
        viewer {
          login
        }
        rateLimit {
          cost
          remaining
          resetAt
        }
        ${searches.join('\n        ')}
      }
      ${PR_FRAGMENT}
    `
    return { document, variables }
  }

  if (settings.repos.length === 0) {
    return [build([], savedNodeIds.length > 0)]
  }

  const groupA: [string, string][] = [
    ['mine', `is:pr is:open author:@me ${repoQualifier}`],
    ['reviewReq', `is:pr is:open review-requested:@me ${repoQualifier}`]
  ]
  const groupB: [string, string][] = [
    ['reviewedBy', `is:pr is:open reviewed-by:@me -author:@me ${repoQualifier}`],
    ['commented', `is:pr is:open commenter:@me -author:@me ${repoQualifier}`]
  ]
  if (settings.teamUsernames.length > 0) {
    const authors = settings.teamUsernames.map((u) => `author:${u}`).join(' ')
    groupA.push(['team', `is:pr is:open ${authors} ${repoQualifier}`])
  }
  return [build(groupA, true), build(groupB, false)]
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
