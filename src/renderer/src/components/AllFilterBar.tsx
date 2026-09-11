import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Person } from '../../../shared/types'
import { Avatar } from './Avatar'
import { RunningIcon, SearchIcon } from './icons'

/** Typing pauses this long before the title search hits GitHub. */
const SEARCH_DEBOUNCE_MS = 350

/**
 * All-tab filters — every one runs server-side so the count is exact and
 * older PRs beyond the feed's newest-50 window are reachable: one author at a
 * time (autocompleted from org members and feed authors, by handle or display
 * name), free text against titles, and a drafts toggle.
 */
export function AllFilterBar({
  people,
  author,
  onAuthor,
  text,
  onText,
  hideDrafts,
  onToggleDrafts,
  pending
}: {
  people: Person[]
  author: string | null
  onAuthor: (login: string | null) => void
  text: string
  onText: (text: string) => void
  hideDrafts: boolean
  onToggleDrafts: () => void
  /** a narrowed search is in flight — the list still shows the previous result */
  pending: boolean
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  // local echo of the title search so typing stays instant; commits debounced
  const [draft, setDraft] = useState(text)
  const committed = useRef(text)
  useEffect(() => {
    if (text !== committed.current) {
      committed.current = text
      setDraft(text)
    }
  }, [text])
  useEffect(() => {
    if (draft === committed.current) return
    const t = setTimeout(() => {
      committed.current = draft
      onText(draft)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [draft, onText])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return people
      .filter((p) => p.login.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [people, query])

  const pick = (login: string): void => {
    onAuthor(login)
    setQuery('')
    setOpen(false)
  }

  const activePerson = author
    ? (people.find((p) => p.login === author) ?? { login: author, name: null })
    : null

  return (
    <div className="filter-bar">
      <span className="showing">FILTER</span>
      {activePerson ? (
        <button className="team-pill" onClick={() => onAuthor(null)} title="Clear author filter">
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
              if (e.key === 'Escape' && query) {
                e.stopPropagation() // Esc clears the field before it closes the popover
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
      <span className="all-search-wrap">
        <SearchIcon />
        <input
          className="all-search-input"
          placeholder="search titles…"
          title="Searches GitHub for open PRs whose title contains these words (⌘F)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              committed.current = draft
              onText(draft)
            }
            if (e.key === 'Escape' && draft) {
              e.stopPropagation()
              committed.current = ''
              setDraft('')
              onText('')
            }
          }}
        />
        {pending ? (
          <RunningIcon />
        ) : (
          draft && (
            <button
              className="search-clear"
              title="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                committed.current = ''
                setDraft('')
                onText('')
              }}
            >
              ×
            </button>
          )
        )}
      </span>
      <button
        className="gtoggle drafts-toggle"
        title={hideDrafts ? 'Drafts are hidden — click to include them' : 'Hide draft PRs'}
        onClick={onToggleDrafts}
      >
        {hideDrafts ? 'show drafts' : 'hide drafts'}
      </button>
    </div>
  )
}
