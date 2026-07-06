import { useEffect, useRef, useState, type JSX } from 'react'
import type { NoisyPattern, Settings } from '../../../shared/types'
import { api } from '../lib/api'

export default function SettingsApp(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    api.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="settings" />

  const patch = (p: Partial<Settings>): void => {
    setSettings({ ...settings, ...p })
    void api.setSettings(p)
  }

  return (
    <div className="settings">
      <Section
        title="Repositories"
        hint="owner/repo — PRs from these repos are watched and polled every minute."
      >
        <ListEditor
          items={settings.repos}
          placeholder="owner/repo"
          validate={(v) => /^[\w.-]+\/[\w.-]+$/.test(v)}
          onChange={(repos) => patch({ repos })}
        />
      </Section>

      <Section
        title="Team"
        hint="GitHub usernames whose PRs appear in the Team tab (regardless of your involvement)."
      >
        <ListEditor
          items={settings.teamUsernames}
          placeholder="username"
          validate={(v) => /^[\w-]+$/.test(v)}
          onChange={(teamUsernames) => patch({ teamUsernames })}
        />
      </Section>

      <Section
        title="Noisy checks"
        hint="Failures from matching checks never trigger FIX CI, a red dot, or a notification. * matches anything — e.g. codecov/*."
      >
        <NoisyEditor
          patterns={settings.noisyPatterns}
          repos={settings.repos}
          onChange={(noisyPatterns) => patch({ noisyPatterns })}
        />
      </Section>

      <Section title="Notifications">
        {(
          [
            ['ciFail', 'CI fails on my PR'],
            ['approved', 'My PR becomes approved / mergeable'],
            ['reviewRequested', 'Someone requests my review'],
            ['comments', 'New comments on my PRs (batched, 15 min)']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="toggle-row">
            <input
              type="checkbox"
              checked={settings.notifications[key]}
              onChange={(e) =>
                patch({
                  notifications: { ...settings.notifications, [key]: e.target.checked }
                })
              }
            />
            {label}
          </label>
        ))}
      </Section>

      <Section title="General">
        <div className="theme-row">
          <span>Appearance</span>
          <div className="theme-seg">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                className={settings.theme === t ? 'seg-btn active' : 'seg-btn'}
                onClick={() => patch({ theme: t })}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.badgeEnabled}
            onChange={(e) => patch({ badgeEnabled: e.target.checked })}
          />
          Show count in the menu bar
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(e) => patch({ launchAtLogin: e.target.checked })}
          />
          Launch at login
        </label>
        <div className="shortcut-row">
          <span>
            Global shortcut
            <span className="row-hint">toggles the popover from anywhere</span>
          </span>
          <input
            className="shortcut-input"
            placeholder="e.g. Cmd+Shift+P"
            defaultValue={settings.globalShortcut}
            onBlur={(e) => patch({ globalShortcut: e.target.value.trim() })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="section">
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  )
}

function ListEditor({
  items,
  placeholder,
  validate,
  onChange
}: {
  items: string[]
  placeholder: string
  validate: (v: string) => boolean
  onChange: (items: string[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const add = (): void => {
    const v = draft.trim()
    if (!v || !validate(v) || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
    inputRef.current?.focus()
  }

  return (
    <div className="list-editor">
      {items.map((item) => (
        <div key={item} className="list-item">
          <span className="mono">{item}</span>
          <button
            className="remove"
            title="Remove"
            onClick={() => onChange(items.filter((i) => i !== item))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="add-row">
        <input
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="add" onClick={add} disabled={!validate(draft.trim())}>
          Add
        </button>
      </div>
    </div>
  )
}

function NoisyEditor({
  patterns,
  repos,
  onChange
}: {
  patterns: NoisyPattern[]
  repos: string[]
  onChange: (patterns: NoisyPattern[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState('')

  const add = (): void => {
    const pattern = draft.trim()
    if (!pattern) return
    const entry: NoisyPattern = scope ? { pattern, repo: scope } : { pattern }
    if (patterns.some((p) => p.pattern === pattern && p.repo === entry.repo)) return
    onChange([...patterns, entry])
    setDraft('')
  }

  return (
    <div className="list-editor">
      {patterns.map((p, i) => (
        <div key={`${p.pattern}-${p.repo ?? 'all'}`} className="list-item">
          <span className="mono">{p.pattern}</span>
          <span className="scope">{p.repo ?? 'all repos'}</span>
          <button
            className="remove"
            title="Remove"
            onClick={() => onChange(patterns.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="add-row">
        <input
          value={draft}
          placeholder="check name or pattern, e.g. codecov/*"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">all repos</option>
          {repos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="add" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
