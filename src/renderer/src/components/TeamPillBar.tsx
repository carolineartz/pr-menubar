import type { JSX } from 'react'
import { Avatar } from './Avatar'

export function TeamPillBar({
  usernames,
  toggles,
  onToggle
}: {
  usernames: string[]
  toggles: Record<string, boolean>
  onToggle: (login: string, on: boolean) => void
}): JSX.Element {
  return (
    <div className="team-bar">
      <span className="showing">SHOWING</span>
      {usernames.map((u) => {
        const on = toggles[u] !== false
        return (
          <button
            key={u}
            className={on ? 'team-pill' : 'team-pill off'}
            onClick={() => onToggle(u, !on)}
          >
            <Avatar login={u} isViewer={false} size={16} />
            <span className="pname">{u}</span>
          </button>
        )
      })}
    </div>
  )
}
