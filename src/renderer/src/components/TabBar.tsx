import type { JSX, KeyboardEvent } from 'react'
import { TABS, type TabId } from '../lib/selectors'

/** Segmented control with roving focus: the active tab is the Tab stop,
 *  ←/→ (and Home/End) move between tabs, ⌘1–5 jump from anywhere. */
export function TabBar({
  active,
  counts,
  onSelect
}: {
  active: TabId
  counts: Record<TabId, number>
  onSelect: (tab: TabId) => void
}): JSX.Element {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const cur = TABS.findIndex((t) => t.id === active)
    let next: number
    if (e.key === 'ArrowRight') next = (cur + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (cur - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    onSelect(TABS[next].id)
    e.currentTarget.querySelectorAll<HTMLElement>('.tab')[next]?.focus()
  }

  return (
    <div className="tabs-wrap">
      <div className="tabs" role="tablist" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            tabIndex={active === t.id ? 0 : -1}
            className={active === t.id ? 'tab active' : 'tab'}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
            <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
