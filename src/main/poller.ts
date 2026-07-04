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
    this.timer = setTimeout(() => void this.poll(), BASE_INTERVAL_MS * this.backoffFactor)
  }

  private async poll(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      this.onData(await this.fetchFn())
    } catch (err) {
      this.onError(err)
    } finally {
      this.inFlight = false
      this.schedule()
    }
  }
}
