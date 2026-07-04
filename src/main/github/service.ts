import type { PRSnapshot, Settings } from '../../shared/types'
import { AuthFailedError, GithubClient, type RateLimitInfo } from './client'
import { mapPoll, type PollData } from './mapper'
import { buildPollQuery } from './queries'

export { AuthFailedError }

export interface PollOutcome {
  prs: PRSnapshot[]
  viewer: string
  rateLimit: RateLimitInfo
}

export class GithubService {
  private client = new GithubClient()

  async poll(settings: Settings, savedNodeIds: string[]): Promise<PollOutcome> {
    const { document, variables } = buildPollQuery(settings, savedNodeIds)
    const data = await this.client.graphql<PollData>(document, variables)
    return {
      prs: mapPoll(data, settings, Date.now()),
      viewer: data.viewer.login,
      rateLimit: data.rateLimit
    }
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
