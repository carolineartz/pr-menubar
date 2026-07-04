import type { PRSnapshot } from '../shared/types'

export interface PollResult {
  prs: PRSnapshot[]
  viewer: string
}

export class AuthError extends Error {}

const BASE_INTERVAL_MS = 60_000

/**
 * Polling scheduler: every 60s in the background, immediately on popover open
 * and on manual refresh. One fetch in flight at a time; interval doubles on
 * rate-limit pressure (backoffFactor set by the data layer).
 */
export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private consecutiveErrors = 0
  backoffFactor = 1

  constructor(
    private fetchFn: () => Promise<PollResult>,
    private onData: (r: PollResult) => void,
    private onError: (err: unknown) => void
  ) {}

  start(): void {
    void this.poll()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Immediate poll (popover opened / ⌘R / settings changed). */
  refresh(): void {
    void this.poll()
  }

  private schedule(): void {
    this.stop()
    // transient failures (flaky network) retry quickly instead of waiting a full cycle
    const delay =
      this.consecutiveErrors > 0
        ? Math.min(10_000 * this.consecutiveErrors, BASE_INTERVAL_MS)
        : BASE_INTERVAL_MS * this.backoffFactor
    this.timer = setTimeout(() => void this.poll(), delay)
  }

  private async poll(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      this.onData(await this.fetchFn())
      this.consecutiveErrors = 0
    } catch (err) {
      this.consecutiveErrors++
      this.onError(err)
    } finally {
      this.inFlight = false
      this.schedule()
    }
  }
}
