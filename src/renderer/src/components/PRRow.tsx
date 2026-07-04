import type { JSX, MouseEvent } from 'react'
import type { ClassifiedCheck, PRSnapshot, SnoozeMode } from '../../../shared/types'
import { metaFor, pillFor } from '../../../shared/present'
import { Avatar } from './Avatar'
import {
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CopyIcon,
  DraftGlyph,
  ExtLinkIcon,
  FailIcon,
  IgnoredIcon,
  QueuedIcon,
  RunningIcon,
  StarIcon
} from './icons'

export interface RowActions {
  toggleExpand: (key: string) => void
  openPr: (key: string) => void
  openLog: (key: string, check: string) => void
  rerunFailed: (key: string) => void
  copyBranch: (pr: PRSnapshot) => void
  toggleStar: (pr: PRSnapshot) => void
  toggleSnoozeMenu: (key: string) => void
  snooze: (pr: PRSnapshot, mode: SnoozeMode) => void
  unsnooze: (key: string) => void
}

export function PRRow({
  pr,
  now,
  expanded,
  snoozeMenuOpen,
  starred,
  snoozed,
  hideChip,
  actions
}: {
  pr: PRSnapshot
  now: number
  expanded: boolean
  snoozeMenuOpen: boolean
  starred: boolean
  snoozed: boolean
  hideChip: boolean
  actions: RowActions
}): JSX.Element {
  const pill = pillFor(pr)
  const rowClass = [
    'row',
    expanded ? 'expanded' : '',
    snoozed ? 'snoozed' : pr.nextAction === 'WAITING' ? 'waiting' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <>
      <div className={rowClass} onClick={() => actions.toggleExpand(pr.key)}>
        <span className={`dot ${pr.dot}`} />
        <div className="row-main">
          <div className="row-title-line">
            {pr.isDraft && <DraftGlyph />}
            <span className={pr.isDraft ? 'row-title draft' : 'row-title'}>{pr.title}</span>
          </div>
          <div className="row-meta">{metaFor(pr, now)}</div>
        </div>
        {snoozed && (
          <button className="unsnooze-btn" onClick={stop(() => actions.unsnooze(pr.key))}>
            Unsnooze
          </button>
        )}
        {!hideChip && (
          <span className={`chip ${pr.nextAction}`}>
            {pr.nextAction === 'FIXCI' ? 'FIX CI' : pr.nextAction}
          </span>
        )}
        {pill && <span className={`pill ${pill[1]}`}>{pill[0]}</span>}
        <Avatar login={pr.author} isViewer={pr.authorIsViewer} />
        <ChevronIcon open={expanded} />
      </div>
      {expanded && (
        <ExpandedPanel
          pr={pr}
          starred={starred}
          snoozeMenuOpen={snoozeMenuOpen}
          actions={actions}
        />
      )}
    </>
  )
}

function ExpandedPanel({
  pr,
  starred,
  snoozeMenuOpen,
  actions
}: {
  pr: PRSnapshot
  starred: boolean
  snoozeMenuOpen: boolean
  actions: RowActions
}): JSX.Element {
  const nonIgnored = pr.checks.filter((c) => !c.ignored)
  const okCount = nonIgnored.filter((c) => c.status === 'ok').length
  const hasFail = pr.checks.some((c) => c.status === 'fail' && !c.ignored)

  // failures first, then in-flight, passed, and ignored-noisy last
  const order = (c: ClassifiedCheck): number =>
    c.ignored ? 4 : { fail: 0, running: 1, queued: 2, ok: 3 }[c.status]
  const sortedChecks = pr.checks.slice().sort((a, b) => order(a) - order(b))

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div className="inset">
      {sortedChecks.map((c) => (
        <CheckRow key={c.name} check={c} onViewLog={() => actions.openLog(pr.key, c.name)} />
      ))}
      <div className="action-strip">
        <span className="check-summary">
          {pr.checksLoaded
            ? `${okCount} of ${nonIgnored.length} passed`
            : 'check details on GitHub'}
        </span>
        <div className="spacer" />
        {hasFail && (
          <button className="btn rerun" onClick={stop(() => actions.rerunFailed(pr.key))}>
            Re-run failed
          </button>
        )}
        <button className="btn" onClick={stop(() => actions.openPr(pr.key))}>
          <ExtLinkIcon />
          Open
        </button>
        <button className="btn mono" onClick={stop(() => actions.copyBranch(pr))}>
          <CopyIcon />
          {pr.headRefName}
        </button>
        <button
          className={starred ? 'btn icon-btn starred' : 'btn icon-btn'}
          onClick={stop(() => actions.toggleStar(pr))}
        >
          <StarIcon filled={starred} />
        </button>
        <span className="snooze-wrap">
          <button className="btn icon-btn" onClick={stop(() => actions.toggleSnoozeMenu(pr.key))}>
            <ClockIcon />
          </button>
          {snoozeMenuOpen && (
            <div className="snooze-menu">
              <button className="snooze-item" onClick={stop(() => actions.snooze(pr, '1h'))}>
                Snooze 1 hour
              </button>
              <button className="snooze-item" onClick={stop(() => actions.snooze(pr, 'tomorrow'))}>
                Until tomorrow
              </button>
              <button className="snooze-item" onClick={stop(() => actions.snooze(pr, 'activity'))}>
                Until activity
              </button>
            </div>
          )}
        </span>
      </div>
    </div>
  )
}

function CheckRow({
  check,
  onViewLog
}: {
  check: ClassifiedCheck
  onViewLog: () => void
}): JSX.Element {
  const failed = check.status === 'fail' && !check.ignored
  const icon = check.ignored ? (
    <IgnoredIcon />
  ) : check.status === 'ok' ? (
    <CheckIcon />
  ) : check.status === 'fail' ? (
    <FailIcon />
  ) : check.status === 'running' ? (
    <RunningIcon />
  ) : (
    <QueuedIcon />
  )
  const dur = check.ignored
    ? 'ignored · noisy'
    : check.status === 'queued'
      ? 'queued'
      : check.status === 'running'
        ? `running · ${check.duration}`
        : check.duration

  return (
    <div className={failed ? 'check-row failed' : 'check-row'}>
      {icon}
      <span className={check.ignored ? 'check-name ignored' : 'check-name'}>{check.name}</span>
      <span className="check-dur">{dur}</span>
      {failed && (
        <button
          className="view-log"
          onClick={(e) => {
            e.stopPropagation()
            onViewLog()
          }}
        >
          View log
        </button>
      )}
    </div>
  )
}
