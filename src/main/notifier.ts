import { Notification, shell } from 'electron'
import { diffSnapshots } from '../shared/notifDiff'
import type { PRSnapshot } from '../shared/types'
import type { Store } from './store'

/**
 * Runs the pure snapshot diff after every successful poll, fires macOS
 * notifications for the resulting events, and persists the notification
 * state so restarts never replay old events.
 */
export function processNotifications(store: Store, prs: PRSnapshot[]): void {
  const { events, nextState } = diffSnapshots(store.get('notifState'), prs, {
    settings: store.get('settings'),
    snoozed: store.get('snoozed'),
    now: Date.now()
  })
  store.set('notifState', nextState)

  if (!Notification.isSupported()) return
  for (const event of events) {
    const n = new Notification({ title: event.title, body: event.body, silent: false })
    n.on('click', () => void shell.openExternal(event.url))
    n.show()
  }
}
