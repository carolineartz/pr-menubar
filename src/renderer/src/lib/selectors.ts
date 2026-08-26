import { PRIO } from '../../../shared/nextAction'
import { isSnoozeActive } from '../../../shared/fingerprint'
import type { PRSnapshot, SnoozeEntry } from '../../../shared/types'

export type TabId = 'my' | 'rev' | 'team' | 'saved' | 'all'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'my', label: 'My PRs' },
  { id: 'rev', label: 'Reviewing' },
  { id: 'team', label: 'Team' },
  { id: 'saved', label: 'Saved' },
  { id: 'all', label: 'All' }
]

export interface ListContext {
  starred: ReadonlySet<string>
  snoozed: Record<string, SnoozeEntry>
  teamToggles: Record<string, boolean>
  now: number
  /** All tab only: show a single author's PRs */
  allAuthor?: string | null
  /** every tab: focus a single repo (click a repo name to toggle) */
  repoFocus?: string | null
}

export function isSnoozedNow(pr: PRSnapshot, ctx: ListContext): boolean {
  return isSnoozeActive(ctx.snoozed[pr.key], pr, ctx.now)
}

/** Port of the prototype's rowsFor(): tab membership, team toggles, snooze hiding. */
export function rowsFor(
  tab: TabId,
  prs: PRSnapshot[],
  ctx: ListContext,
  includeSnoozed = false
): PRSnapshot[] {
  return prs.filter((pr) => {
    if (ctx.repoFocus && pr.repo !== ctx.repoFocus) return false
    let inTab: boolean
    if (tab === 'saved') inTab = ctx.starred.has(pr.key)
    else inTab = pr.buckets.includes(tab)
    if (tab === 'team' && ctx.teamToggles[pr.author] === false) inTab = false
    if (tab === 'all' && ctx.allAuthor) {
      // author filter: bucket-less rows from the on-demand author fetch count
      // too — they exist precisely to escape the All feed's newest-50 window
      inTab = pr.author === ctx.allAuthor
    }
    if (!inTab) return false
    if (isSnoozedNow(pr, ctx) && !includeSnoozed) return false
    return true
  })
}

/** Flat tabs sort by next-action urgency, then recency. */
export function sortByUrgency(rows: PRSnapshot[]): PRSnapshot[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        PRIO[a.nextAction] - PRIO[b.nextAction] || b.updatedAt.localeCompare(a.updatedAt)
    )
}

/** The All tab is a plain feed: newest-opened first. */
export function sortByCreated(rows: PRSnapshot[]): PRSnapshot[] {
  return rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type GroupKey =
  // Reviewing tab
  | 'start'
  | 'team'
  | 'continue'
  | 'waiting'
  | 'approved'
  | 'bots'
  // My PRs tab
  | 'ready'
  | 'active'
  | 'drafts'

export interface Group {
  key: GroupKey
  label: string
  color: string
  rows: PRSnapshot[]
}

type GroupDef = Omit<Group, 'rows'> & { collapsedByDefault: boolean }

const GROUPS: GroupDef[] = [
  { key: 'start', label: 'START REVIEW', color: 'var(--bluet)', collapsedByDefault: false },
  {
    key: 'team',
    label: 'CODE OWNER REQUESTS',
    color: 'var(--tealt)',
    collapsedByDefault: false
  },
  { key: 'continue', label: 'CONTINUE REVIEW', color: 'var(--purt)', collapsedByDefault: false },
  { key: 'waiting', label: 'WAITING FOR AUTHOR', color: 'var(--ambert)', collapsedByDefault: false },
  { key: 'approved', label: 'APPROVED BY YOU', color: 'var(--greent)', collapsedByDefault: true },
  { key: 'bots', label: 'BOTS', color: 'var(--neut)', collapsedByDefault: true }
]

const MY_GROUPS: GroupDef[] = [
  { key: 'ready', label: 'APPROVED', color: 'var(--greent)', collapsedByDefault: false },
  { key: 'active', label: 'IN PROGRESS', color: 'var(--bluet)', collapsedByDefault: false },
  { key: 'drafts', label: 'DRAFTS', color: 'var(--faint)', collapsedByDefault: false }
]

export const DEFAULT_COLLAPSED_GROUPS: readonly GroupKey[] = [...GROUPS, ...MY_GROUPS]
  .filter((g) => g.collapsedByDefault)
  .map((g) => g.key)

const toGroups = (
  defs: GroupDef[],
  rows: PRSnapshot[],
  keyFor: (pr: PRSnapshot) => GroupKey
): Group[] =>
  defs
    .map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      rows: sortByUrgency(rows.filter((pr) => keyFor(pr) === g.key))
    }))
    .filter((g) => g.rows.length > 0)

/** "dependabot", "dependabot[bot]", and "app/dependabot" are the same account. */
const botName = (login: string): string =>
  login.replace(/^app\//i, '').replace(/\[bot\]$/i, '').toLowerCase()

export function isBotAuthor(login: string, botAuthors: string[]): boolean {
  return botAuthors.some((b) => botName(b) === botName(login))
}

/** First match wins: bot author, then your approval (kept there even when new
 *  commits landed after it), then the next-action verbs, then team requests. */
function groupKeyFor(pr: PRSnapshot, botAuthors: string[]): GroupKey {
  if (isBotAuthor(pr.author, botAuthors)) return 'bots'
  if (pr.viewerReviewState === 'APPROVED') return 'approved'
  if (pr.nextAction === 'REVIEW') return 'start'
  if (pr.nextAction === 'RESUME') return 'continue'
  if (pr.reviewRequestedFromTeam) return 'team'
  return 'waiting'
}

export function reviewingGroups(rows: PRSnapshot[], botAuthors: string[] = []): Group[] {
  return toGroups(GROUPS, rows, (pr) => groupKeyFor(pr, botAuthors))
}

/** My PRs groups. "Approved" means GitHub's review decision — required approval
 *  count met and every blocking code-owner group satisfied. */
export function myGroups(rows: PRSnapshot[]): Group[] {
  return toGroups(MY_GROUPS, rows, (pr) => {
    if (pr.isDraft) return 'drafts'
    if (pr.reviewDecision === 'APPROVED') return 'ready'
    return 'active'
  })
}

export function emptyMessage(tab: TabId): string {
  if (tab === 'saved') return 'Nothing saved yet — star a PR from any tab.'
  if (tab === 'team') return 'No people shown — toggle someone back on below.'
  return 'All clear — nothing needs you here.'
}
