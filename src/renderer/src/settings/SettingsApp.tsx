import { useEffect, useState, type JSX } from 'react'
import type { Settings } from '../../../shared/types'
import { api } from '../lib/api'

export default function SettingsApp(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    api.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="settings" />

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="placeholder">Full settings form coming in M7 — current values:</p>
      <pre>{JSON.stringify(settings, null, 2)}</pre>
    </div>
  )
}
