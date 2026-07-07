import type { Person, PRSnapshot, Settings } from '../../shared/types'
import { AuthFailedError, GithubClient, type RateLimitInfo } from './client'
import { mapPoll, type PollData } from './mapper'
import { buildAllOpenQuery, buildAuthorQuery, buildInvolvementQueries } from './queries'

export { AuthFailedError }

export interface PollOutcome {
  prs: PRSnapshot[]
  viewer: string
  rateLimit: RateLimitInfo
}

export class GithubService {
  private client = new GithubClient()

  /** Several small parallel requests instead of one: each involvement search
   *  costs ~3–4s of GitHub's ~10s per-request execution budget on a large
   *  repo, so bundling them all 504s. */
  async poll(settings: Settings, savedNodeIds: string[]): Promise<PollOutcome> {
    const invQueries = buildInvolvementQueries(settings, savedNodeIds)
    const allOpen = buildAllOpenQuery(settings)
    const [allData, ...invParts] = await Promise.all([
      settings.repos.length > 0
        ? this.client.graphql<Pick<PollData, 'allOpen' | 'rateLimit'>>(
            allOpen.document,
            allOpen.variables
          )
        : Promise.resolve(null),
      ...invQueries.map((q) => this.client.graphql<PollData>(q.document, q.variables))
    ])
    const data: PollData = Object.assign({}, ...invParts, { allOpen: allData?.allOpen })
    const limits = [...invParts.map((p) => p.rateLimit), allData?.rateLimit].filter(
      (r): r is PollData['rateLimit'] => !!r
    )
    const rateLimit = limits.reduce((min, r) => (r.remaining < min.remaining ? r : min))
    return {
      prs: mapPoll(data, settings, Date.now()),
      viewer: invParts[0].viewer.login,
      rateLimit
    }
  }

  /**
   * One author's complete open-PR list (lite fragment). Returned bucket-less:
   * these rows only surface while that author filter is active.
   */
  async fetchAuthorPRs(settings: Settings, login: string): Promise<PRSnapshot[]> {
    if (settings.repos.length === 0) return []
    const q = buildAuthorQuery(settings, login)
    const data = await this.client.graphql<PollData>(q.document, q.variables)
    return mapPoll(data, settings, Date.now()).map((pr) => ({ ...pr, buckets: [] }))
  }

  /**
   * Org members for the author autocomplete, derived from the watched repos'
   * owners. Best-effort: user-owned repos and orgs that hide their member
   * list just contribute nothing.
   */
  async fetchPeople(repos: string[]): Promise<Person[]> {
    const owners = [...new Set(repos.map((r) => r.split('/')[0]).filter(Boolean))]
    const people = new Map<string, Person>()
    for (const owner of owners) {
      try {
        const data = await this.client.graphql<{
          organization: {
            membersWithRole: { nodes: { login: string; name: string | null }[] }
          } | null
        }>(
          `query Members($org: String!) {
            organization(login: $org) {
              membersWithRole(first: 100) { nodes { login name } }
            }
          }`,
          { org: owner }
        )
        for (const m of data.organization?.membersWithRole.nodes ?? []) {
          people.set(m.login, { login: m.login, name: m.name ?? null })
        }
      } catch {
        // not an org / no read:org visibility — skip
      }
    }
    return [...people.values()].sort((a, b) => a.login.localeCompare(b.login))
  }

  /** true if gh credentials work. */
  async checkAuth(): Promise<boolean> {
    try {
      await this.client.graphql<{ viewer: { login: string } }>('query { viewer { login } }', {})
      return true
    } catch {
      return false
    }
  }

  /**
   * Re-request every check suite that has a failed, non-ignored check.
   * Returns false when nothing could be re-run (e.g. external CI) so the
   * caller can fall back to opening the checks page.
   */
  async rerunFailed(pr: PRSnapshot): Promise<boolean> {
    const suiteIds = [
      ...new Set(
        pr.checks
          .filter((c) => c.status === 'fail' && !c.ignored && c.suiteId != null)
          .map((c) => c.suiteId as number)
      )
    ]
    let anyOk = false
    for (const id of suiteIds) {
      const res = await this.client.rest(
        'POST',
        `/repos/${pr.repo}/check-suites/${id}/rerequest`
      )
      if (res.ok) anyOk = true
    }
    return anyOk
  }
}
