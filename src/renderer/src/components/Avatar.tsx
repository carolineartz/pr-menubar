import { useEffect, useRef, useState, type JSX } from 'react'
import { avatarColor, initials } from '../../../shared/present'

/** Deliberate-hover delay before the tooltip shows — no flashing on pass-over. */
const TIP_DELAY_MS = 450

export function Avatar({
  login,
  name,
  isViewer,
  size = 20
}: {
  login: string
  /** display name from the org profile, when known */
  name?: string | null
  isViewer: boolean
  size?: number
}): JSX.Element {
  // custom tooltip: native title tooltips don't show over the frameless
  // pop-up-menu-level popover window. position:fixed escapes .list's overflow
  // clipping (its containing block is the viewport).
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: avatarColor(login, isViewer),
        fontSize: size < 20 ? 7.5 : 8.5
      }}
      onMouseEnter={(e) => {
        if (isViewer) return // you know who you are
        const r = e.currentTarget.getBoundingClientRect()
        timer.current = setTimeout(() => setTip({ x: r.right, y: r.bottom + 6 }), TIP_DELAY_MS)
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current)
        setTip(null)
      }}
    >
      {initials(login, isViewer, name)}
      {tip && (
        <span className="avatar-tip" style={{ left: tip.x, top: tip.y }}>
          {name ? `${name} · ${login}` : login}
        </span>
      )}
    </span>
  )
}
