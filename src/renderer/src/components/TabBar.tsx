import type { JSX } from 'react'
import { TABS, type TabId } from '../lib/selectors'

export function TabBar({
  active,
  counts,
  onSelect
}: {
  active: TabId
  counts: Record<TabId, number>
  onSelect: (tab: TabId) => void
}): JSX.Element {
  return (
    <div className="tabs-wrap">
      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={active === t.id ? 'tab active' : 'tab'}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
            <span className="count">{counts[t.id]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
