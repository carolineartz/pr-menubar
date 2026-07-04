import type { JSX } from 'react'
import { avatarColor, initials } from '../../../shared/present'

export function Avatar({
  login,
  isViewer,
  size = 20
}: {
  login: string
  isViewer: boolean
  size?: number
}): JSX.Element {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: avatarColor(login, isViewer),
        fontSize: size < 20 ? 7.5 : 8.5
      }}
    >
      {initials(login, isViewer)}
    </span>
  )
}
