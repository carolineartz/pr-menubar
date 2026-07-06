import type { Person, PRSnapshot, Settings } from '../../shared/types'
import { AuthFailedError, GithubClient, type RateLimitInfo } from './client'
import { mapPoll, type PollData } from './mapper'
import { buildAllOpenQuery, buildInvolvementQuery } from './queries'

export { AuthFailedError }

export interface PollOutcome {
  prs: PRSnapshot[]
  viewer: string
  rateLimit: RateLimitInfo
}

export class GithubService {
  private client = new GithubClient()

  /** Two smaller requests instead of one: a single query with the All feed's
   *  full detail exceeds GitHub's per-request GraphQL compute budget (504s). */
  async poll(settings: Settings, savedNodeIds: string[]): Promise<PollOutcome> {
    const inv = buildInvolvementQuery(settings, savedNodeIds)
    const allOpen = buildAllOpenQuery(settings)
    const [invData, allData] = await Promise.all([
      this.client.graphql<PollData>(inv.document, inv.variables),
      settings.repos.length > 0
        ? this.client.graphql<Pick<PollData, 'allOpen' | 'rateLimit'>>(
            allOpen.document,
            allOpen.variables
          )
        : Promise.resolve(null)
    ])
    const data: PollData = { ...invData, allOpen: allData?.allOpen }
    const rateLimit =
      allData && allData.rateLimit.remaining < invData.rateLimit.remaining
        ? allData.rateLimit
        : invData.rateLimit
    return {
      prs: mapPoll(data, settings, Date.now()),
      viewer: invData.viewer.login,
      rateLimit
    }
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
