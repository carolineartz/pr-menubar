import type { JSX } from 'react'

export function SetupScreen({ onRecheck }: { onRecheck: () => void }): JSX.Element {
  return (
    <div className="setup">
      <h2>Connect GitHub</h2>
      <p>
        PR Menubar reuses your GitHub CLI credentials. Sign in with the GitHub CLI, then check
        again.
      </p>
      <code>gh auth login</code>
      <button className="btn" onClick={onRecheck}>
        Check again
      </button>
    </div>
  )
}
