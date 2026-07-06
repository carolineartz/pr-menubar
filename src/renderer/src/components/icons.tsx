import type { JSX } from 'react'

/* All icons are the prototype's inline 16-viewBox stroke SVGs, verbatim. */

export function DraftGlyph(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.7" style={{ flex: 'none' }}>
      <circle cx="4.5" cy="3.7" r="1.9" />
      <circle cx="4.5" cy="12.3" r="1.9" />
      <path d="M4.5 5.6v4.8" strokeDasharray="2 2.2" />
      <circle cx="11.5" cy="12.3" r="1.9" />
      <circle cx="11.5" cy="7.5" r=".9" fill="var(--faint)" stroke="none" />
      <circle cx="11.5" cy="4" r=".9" fill="var(--faint)" stroke="none" />
    </svg>
  )
}

export function CheckIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
      <path d="M3 8.5l3.2 3.2L13 4.8" stroke="var(--greendot)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FailIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="var(--reddot)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function RunningIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="5.5" stroke="var(--insetb)" strokeWidth="2" />
      <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" stroke="var(--amberdot)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function QueuedIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="5.5" stroke="var(--faint)" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  )
}

export function IgnoredIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flex: 'none' }}>
      <path d="M4 8h8" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ExtLinkIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 3H3v10h10V9.5" />
      <path d="M9.5 3H13v3.5" />
      <path d="M13 3L7.5 8.5" />
    </svg>
  )
}

export function CopyIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5h-6a1 1 0 0 0-1 1v6" />
    </svg>
  )
}

export function StarIcon({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill={filled ? '#ffd60a' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="8 1.8 9.9 5.7 14.2 6.3 11.1 9.3 11.8 13.6 8 11.5 4.2 13.6 4.9 9.3 1.8 6.3 6.1 5.7" />
    </svg>
  )
}

export function ClockIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.8V8l2.3 1.4" />
    </svg>
  )
}

/** Atlassian Jira mark (user-supplied), brand blue. */
export function JiraIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#2684FF">
      <path d="M11.53,2a4.37,4.37,0,0,0,4.35,4.35h1.78v1.7A4.35,4.35,0,0,0,22,12.4V2.84A.85.85,0,0,0,21.16,2H11.53M6.77,6.8a4.36,4.36,0,0,0,4.34,4.34h1.8v1.72a4.36,4.36,0,0,0,4.34,4.34V7.63a.84.84,0,0,0-.83-.83H6.77M2,11.6a4.34,4.34,0,0,0,4.35,4.34H8.13v1.72A4.36,4.36,0,0,0,12.47,22V12.43a.85.85,0,0,0-.84-.84H2Z" />
    </svg>
  )
}

export function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--faint)" strokeWidth="1.8" strokeLinecap="round" className={open ? 'chevron open' : 'chevron'}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
