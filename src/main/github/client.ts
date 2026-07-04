import { getGhToken, GhUnavailableError } from './token'

export class AuthFailedError extends Error {
  constructor(message = 'GitHub authentication failed — run `gh auth login`') {
    super(message)
  }
}

export interface RateLimitInfo {
  cost: number
  remaining: number
  resetAt: string
}

/** GraphQL + minimal REST against api.github.com, authenticated via the gh CLI
 *  token. The token is cached; a 401 refreshes it once before giving up. */
export class GithubClient {
  private token: string | null = null

  private async ensureToken(force = false): Promise<string> {
    if (!this.token || force) {
      try {
        this.token = await getGhToken()
      } catch (err) {
        throw err instanceof GhUnavailableError ? new AuthFailedError(err.message) : err
      }
    }
    return this.token
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    return this.request<T>(query, variables, false)
  }

  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
    isRetry: boolean
  ): Promise<T> {
    const token = await this.ensureToken(isRetry)
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000)
    })
    if (res.status === 401) {
      if (isRetry) throw new AuthFailedError()
      return this.request<T>(query, variables, true)
    }
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (body.errors?.length) {
      throw new Error(`GitHub GraphQL: ${body.errors.map((e) => e.message).join('; ')}`)
    }
    if (!body.data) throw new Error('GitHub GraphQL: empty response')
    return body.data
  }

  /** REST helper — used only for check-suite re-runs. */
  async rest(method: string, path: string): Promise<Response> {
    const token = await this.ensureToken()
    return fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json'
      }
    })
  }
}
