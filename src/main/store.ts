import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { NotifState, Settings, SnoozeEntry } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

export interface PersistedState {
  settings: Settings
  starred: string[]
  /** PrKey → GraphQL node id, so starred PRs can be re-fetched via nodes(ids:) */
  starredNodeIds: Record<string, string>
  snoozed: Record<string, SnoozeEntry>
  teamToggles: Record<string, boolean>
  notifState: NotifState
}

const DEFAULTS: PersistedState = {
  settings: DEFAULT_SETTINGS,
  starred: [],
  starredNodeIds: {},
  snoozed: {},
  teamToggles: {},
  notifState: {}
}

/** Minimal atomic JSON store in userData — one file, write-through. */
export class Store {
  private path: string
  private data: PersistedState

  constructor(filename = 'state.json') {
    this.path = join(app.getPath('userData'), filename)
    this.data = this.load()
  }

  private load(): PersistedState {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<PersistedState>
      return {
        ...DEFAULTS,
        ...raw,
        settings: { ...DEFAULT_SETTINGS, ...raw.settings,
          notifications: { ...DEFAULT_SETTINGS.notifications, ...raw.settings?.notifications } }
      }
    } catch {
      return structuredClone(DEFAULTS)
    }
  }

  private save(): void {
    const tmp = `${this.path}.tmp`
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.path)
  }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.data[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.data[key] = value
    this.save()
  }
}
