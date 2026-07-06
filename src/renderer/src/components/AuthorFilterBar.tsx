import { useMemo, useRef, useState, type JSX } from 'react'
import type { Person } from '../../../shared/types'
import { Avatar } from './Avatar'

/**
 * All-tab filter: one author at a time, autocompleted from org members and
 * feed authors — searchable by handle or display name.
 */
export function AuthorFilterBar({
  people,
  active,
  onSelect
}: {
  people: Person[]
  active: string | null
  onSelect: (login: string | null) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return people
      .filter(
        (p) => p.login.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [people, query])

  const pick = (login: string): void => {
    onSelect(login)
    setQuery('')
    setOpen(false)
  }

  const activePerson = active ? (people.find((p) => p.login === active) ?? { login: active, name: null }) : null

  return (
    <div className="filter-bar">
      <span className="showing">FILTER</span>
      {activePerson ? (
        <button className="team-pill" onClick={() => onSelect(null)} title="Clear filter">
          <Avatar login={activePerson.login} isViewer={false} size={16} />
          <span className="pname">
            {activePerson.login}
            {activePerson.name ? ` · ${activePerson.name}` : ''}
          </span>
          <span className="clear-x">×</span>
        </button>
      ) : (
        <span className="filter-input-wrap">
          <input
            ref={inputRef}
            className="filter-input"
            placeholder="author — handle or name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length > 0) pick(matches[0].login)
              if (e.key === 'Escape') {
                setQuery('')
                setOpen(false)
              }
            }}
          />
          {open && matches.length > 0 && (
            <div className="filter-menu">
              {matches.map((p) => (
                <button key={p.login} className="filter-item" onMouseDown={() => pick(p.login)}>
                  <Avatar login={p.login} isViewer={false} size={16} />
                  <span className="fi-login">{p.login}</span>
                  {p.name && <span className="fi-name">{p.name}</span>}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </div>
  )
}
