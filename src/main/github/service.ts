import type { AllQueryParams } from '../../shared/ipc'
import type { Person, PRSnapshot, Settings } from '../../shared/types'
import { AuthFailedError, GithubClient, type RateLimitInfo } from './client'
import { mapPoll, type GqlPR, type PollData } from './mapper'
import {
  buildAllOpenQuery,
  buildAllSearchQuery,
  buildDetailQuery,
  buildInvolvementQuery,
  DETAIL_CHUNK_SIZE,
  type InvolvementAlias
} from './queries'

export { AuthFailedError }

export interface PollOutcome {
  prs: PRSnapshot[]
  viewer: string
  rateLimit: RateLimitInfo
  /** GitHub's total for the All feed search — the feed itself holds the 50 newest */
  allOpenTotal: number
}

export interface AllSearchOutcome {
  prs: PRSnapshot[]
  total: number
}

export class GithubService {
  private client = new GithubClient()

  /** Several small parallel requests instead of one: full PR detail costs
   *  enough of GitHub's ~10s per-request execution budget that bundling it
   *  504s or truncates the response. The All feed runs alongside. */
  async poll(settings: Settings, savedNodeIds: string[]): Promise<PollOutcome> {
    const allOpen = buildAllOpenQuery(settings)
    const [allData, involvement] = await Promise.all([
      settings.repos.length > 0
        ? this.client.graphql<Pick<PollData, 'allOpen' | 'rateLimit'>>(
            allOpen.document,
            allOpen.variables
          )
        : Promise.resolve(null),
      this.fetchInvolvement(settings, savedNodeIds)
    ])
    const data: PollData = { ...involvement.data, allOpen: allData?.allOpen }
    const rateLimit = [...involvement.rateLimits, allData?.rateLimit]
      .filter((r): r is RateLimitInfo => !!r)
      .reduce((min, r) => (r.remaining < min.remaining ? r : min))
    const prs = mapPoll(data, settings, Date.now())
    return {
      prs,
      viewer: data.viewer.login,
      rateLimit,
      allOpenTotal:
        allData?.allOpen?.issueCount ?? prs.filter((p) => p.buckets.includes('all')).length
    }
  }

  /** Ids from the involvement searches, then full detail for the union of
   *  those and the saved PRs in parallel `DETAIL_CHUNK_SIZE` chunks,
   *  reassembled per search in GitHub's order. */
  private async fetchInvolvement(
    settings: Settings,
    savedNodeIds: string[]
  ): Promise<{ data: Omit<PollData, 'allOpen'>; rateLimits: RateLimitInfo[] }> {
    const q = buildInvolvementQuery(settings)
    const found = await this.client.graphql<
      Pick<PollData, 'viewer' | 'rateLimit'> &
        Partial<Record<InvolvementAlias, { nodes: ({ id?: string } | null)[] }>>
    >(q.document, q.variables)
    const idsByAlias = q.aliases.map(
      (alias) => [alias, (found[alias]?.nodes ?? []).flatMap((n) => (n?.id ? [n.id] : []))] as const
    )
    const unique = [...new Set([...idsByAlias.flatMap(([, ids]) => ids), ...savedNodeIds])]
    const chunks = Array.from({ length: Math.ceil(unique.length / DETAIL_CHUNK_SIZE) }, (_, i) =>
      unique.slice(i * DETAIL_CHUNK_SIZE, (i + 1) * DETAIL_CHUNK_SIZE)
    )
    const details = await Promise.all(
      chunks.map((ids) => {
        const d = buildDetailQuery(ids)
        return this.client.graphql<{ rateLimit: RateLimitInfo; nodes: (GqlPR | null)[] }>(
          d.document,
          d.variables
        )
      })
    )
    const byId = new Map(
      details.flatMap((d) => d.nodes).flatMap((n) => (n ? [[n.id, n] as const] : []))
    )
    const pick = (ids: string[]): (GqlPR | null)[] => ids.map((id) => byId.get(id) ?? null)
    const data: Omit<PollData, 'allOpen'> = { viewer: found.viewer, rateLimit: found.rateLimit }
    for (const [alias, ids] of idsByAlias) data[alias] = { nodes: pick(ids) }
    if (savedNodeIds.length > 0) data.saved = pick(savedNodeIds)
    return { data, rateLimits: [found.rateLimit, ...details.map((d) => d.rateLimit)] }
  }

  /**
   * The All feed narrowed server-side (lite fragment). Rows come back
   * bucket-less: the renderer shows them by key while this query is active.
   */
  async fetchAllQuery(settings: Settings, params: AllQueryParams): Promise<AllSearchOutcome> {
    if (settings.repos.length === 0 && !params.repo) return { prs: [], total: 0 }
    const q = buildAllSearchQuery(settings, params)
    const data = await this.client.graphql<PollData>(q.document, q.variables)
    const prs = mapPoll(data, settings, Date.now()).map((pr) => ({ ...pr, buckets: [] }))
    return { prs, total: data.allOpen?.issueCount ?? prs.length }
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
      const res = await this.client.rest('POST', `/repos/${pr.repo}/check-suites/${id}/rerequest`)
      if (res.ok) anyOk = true
    }
    return anyOk
  }
}
