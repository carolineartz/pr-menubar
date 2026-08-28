import { useState, type JSX, type MouseEvent } from 'react'
import type { ClassifiedCheck, PRSnapshot, SnoozeMode } from '../../../shared/types'
import { jiraTicketFrom } from '../../../shared/jira'
import { behindSince, metaContext, pillFor, relativeShort, repoTint } from '../../../shared/present'
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
  JiraIcon,
  QueuedIcon,
  RunningIcon,
  StarIcon
} from './icons'

export interface RowActions {
  toggleExpand: (key: string) => void
  toggleRepoFocus: (repo: string) => void
  openPr: (key: string) => void
  /** copy a "still waiting for reviews on <url>" line for Slack */
  copyNudge: (pr: PRSnapshot) => void
  openJira: (key: string) => void
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
  authorName,
  now,
  expanded,
  snoozeMenuOpen,
  starred,
  snoozed,
  hideChip,
  timeBadge,
  repoFocused,
  jiraEnabled,
  showOwnAvatar,
  actions
}: {
  pr: PRSnapshot
  /** author's display name for the avatar tooltip, when the org profile has one */
  authorName: string | null
  /** All tab: mixed authorship, so the viewer's rows keep their YOU circle */
  showOwnAvatar: boolean
  now: number
  expanded: boolean
  snoozeMenuOpen: boolean
  starred: boolean
  snoozed: boolean
  hideChip: boolean
  /** Reviewing tab: the group header names the action, so the chip slot shows
   *  how long this has been waiting instead */
  timeBadge: boolean
  repoFocused: boolean
  /** Settings → Jira base URL; '' hides ticket buttons */
  jiraEnabled: boolean
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
      <div
        className={rowClass}
        onClick={(e) => (e.metaKey ? actions.openPr(pr.key) : actions.toggleExpand(pr.key))}
      >
        <span className={`dot ${pr.dot}`} />
        <div className="row-main">
          <div className="row-title-line">
            {pr.isDraft && <DraftGlyph />}
            <span className={pr.isDraft ? 'row-title draft' : 'row-title'}>{pr.title}</span>
          </div>
          <div className="row-meta">
            {pr.isDraft && 'Draft · '}
            <button
              className={repoFocused ? 'repo-name focused' : 'repo-name'}
              style={{ color: repoTint(pr.repo) }}
              title={repoFocused ? 'Click to show all repos' : `Only show ${pr.repo}`}
              onClick={stop(() => actions.toggleRepoFocus(pr.repo))}
            >
              {pr.repo}
            </button>{' '}
            {metaContext(pr, now)}
          </div>
        </div>
        {snoozed && (
          <button className="unsnooze-btn" onClick={stop(() => actions.unsnooze(pr.key))}>
            Unsnooze
          </button>
        )}
        {/* FIXCI has no chip — the red dot already says it */}
        {!timeBadge && !hideChip && pr.nextAction !== 'FIXCI' && (
          <span className={`chip ${pr.nextAction}`}>{pr.nextAction}</span>
        )}
        {pill && <span className={`pill ${pill[1]}`}>{pill[0]}</span>}
        {/* the age chip reads best as the row's last word before the avatar */}
        {timeBadge && <TimeBadge pr={pr} now={now} />}
        {(!pr.authorIsViewer || showOwnAvatar) && (
          <Avatar login={pr.author} name={authorName} isViewer={pr.authorIsViewer} />
        )}
        <ChevronIcon open={expanded} />
      </div>
      {expanded && (
        <ExpandedPanel
          pr={pr}
          starred={starred}
          snoozeMenuOpen={snoozeMenuOpen}
          jiraEnabled={jiraEnabled}
          actions={actions}
        />
      )}
    </>
  )
}

const STALE_MS = 2 * 24 * 60 * 60 * 1000

function TimeBadge({ pr, now }: { pr: PRSnapshot; now: number }): JSX.Element {
  const since = behindSince(pr)
  const stale = now - Date.parse(since) >= STALE_MS
  return (
    <span className={stale ? 'time-badge stale' : 'time-badge'} title="waiting for you since">
      {relativeShort(since, now)}
    </span>
  )
}

function ExpandedPanel({
  pr,
  starred,
  snoozeMenuOpen,
  jiraEnabled,
  actions
}: {
  pr: PRSnapshot
  starred: boolean
  snoozeMenuOpen: boolean
  jiraEnabled: boolean
  actions: RowActions
}): JSX.Element {
  const jiraTicket = jiraEnabled ? jiraTicketFrom(pr.title) : null
  // big CI pipelines drown the signal — passed checks collapse behind a toggle
  const [showPassed, setShowPassed] = useState(false)

  const nonIgnored = pr.checks.filter((c) => !c.ignored)
  const okCount = nonIgnored.filter((c) => c.status === 'ok').length
  const hasFail = pr.checks.some((c) => c.status === 'fail' && !c.ignored)

  // failures first, then in-flight, passed, and ignored-noisy last
  const order = (c: ClassifiedCheck): number =>
    c.ignored ? 4 : { fail: 0, running: 1, queued: 2, ok: 3 }[c.status]
  const sortedChecks = pr.checks.slice().sort((a, b) => order(a) - order(b))
  const passedCount = sortedChecks.filter((c) => c.status === 'ok' && !c.ignored).length
  const visibleChecks = showPassed
    ? sortedChecks
    : sortedChecks.filter((c) => !(c.status === 'ok' && !c.ignored))

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div className="inset">
      {visibleChecks.map((c) => (
        <CheckRow key={c.name} check={c} onViewLog={() => actions.openLog(pr.key, c.name)} />
      ))}
      {passedCount > 0 && (
        <button
          className="show-passed"
          onClick={(e) => {
            e.stopPropagation()
            setShowPassed((v) => !v)
          }}
        >
          {showPassed ? 'Hide passed checks' : `Show ${passedCount} passed`}
        </button>
      )}
      <div className="action-strip">
        <div className="action-row">
          <span className="check-summary">
            {pr.checksLoaded
              ? `${okCount}/${nonIgnored.length} passed`
              : 'check details on GitHub'}
          </span>
          <div className="spacer" />
          {hasFail && (
            <button className="btn rerun" onClick={stop(() => actions.rerunFailed(pr.key))}>
              Re-run failed
            </button>
          )}
          {pr.authorIsViewer && !pr.isDraft && pr.reviewDecision !== 'APPROVED' && (
            <button
              className="btn"
              title="Copy a Slack-ready reminder with the PR link"
              onClick={stop(() => actions.copyNudge(pr))}
            >
              <CopyIcon />
              Nudge
            </button>
          )}
          <button className="btn" onClick={stop(() => actions.openPr(pr.key))}>
            <ExtLinkIcon />
            Open
          </button>
        </div>
        <div className="action-row">
          <button
            className="btn mono branch-btn"
            title={`Copy ${pr.headRefName}`}
            onClick={stop(() => actions.copyBranch(pr))}
          >
            <CopyIcon />
            <span className="branch-name">{pr.headRefName}</span>
          </button>
          <div className="spacer" />
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
          {jiraTicket && (
            <button
              className="btn icon-btn"
              title={`Open ${jiraTicket} in Jira`}
              onClick={stop(() => actions.openJira(pr.key))}
            >
              <JiraIcon />
            </button>
          )}
        </div>
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
