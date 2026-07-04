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
    reviewThreads(first: 50) {
      nodes {
        isResolved
      }
    }
    latestReviews(first: 30) {
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

export interface PollQuery {
  document: string
  variables: Record<string, unknown>
}

/** One aliased request per poll. Searches are included only when they can
 *  match (repos configured / team list non-empty / stars exist). */
export function buildPollQuery(settings: Settings, savedNodeIds: string[]): PollQuery {
  const repoQualifier = settings.repos.map((r) => `repo:${r}`).join(' ')
  const searches: string[] = []
  const variables: Record<string, unknown> = {}
  const varDefs: string[] = []

  const addSearch = (alias: string, q: string, first = 30): void => {
    varDefs.push(`$${alias}Q: String!`)
    variables[`${alias}Q`] = q
    searches.push(
      `${alias}: search(query: $${alias}Q, type: ISSUE, first: ${first}) { nodes { ...PRFields } }`
    )
  }

  if (settings.repos.length > 0) {
    addSearch('allOpen', `is:pr is:open sort:created-desc ${repoQualifier}`, 50)
    addSearch('mine', `is:pr is:open author:@me ${repoQualifier}`)
    addSearch('reviewReq', `is:pr is:open review-requested:@me ${repoQualifier}`)
    addSearch('reviewedBy', `is:pr is:open reviewed-by:@me -author:@me ${repoQualifier}`)
    addSearch('commented', `is:pr is:open commenter:@me -author:@me ${repoQualifier}`)
    if (settings.teamUsernames.length > 0) {
      const authors = settings.teamUsernames.map((u) => `author:${u}`).join(' ')
      addSearch('team', `is:pr is:open ${authors} ${repoQualifier}`)
    }
  }

  if (savedNodeIds.length > 0) {
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
      ${searches.join('\n      ')}
    }
    ${PR_FRAGMENT}
  `
  return { document, variables }
}
