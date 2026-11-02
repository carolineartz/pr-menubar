import { describe, expect, it } from 'vitest'
import { badgeCount, needsYou } from '../badge'
import { makeMockPRs } from '../mockData'
import { computeNextAction } from '../nextAction'
import type { PRSnapshot } from '../types'

const NOW = Date.parse('2026-07-04T12:00:00Z')

const find = (prs: PRSnapshot[], key: string): PRSnapshot => prs.find((p) => p.key === key)!

describe('badgeCount', () => {
  const prs = makeMockPRs(NOW)
  const counted = prs.filter((p) => needsYou(p)).map((p) => p.key)

  it('counts owed review replies, Start review, Waiting on you, and bot requests', () => {
    expect(counted.sort()).toEqual([
      'acme/api#468', // own: reviewer replied, changes requested
      'acme/api#486', // start review
      'acme/api#495', // dependabot, code-owner request
      'acme/auth#217', // start review
      'acme/auth#221', // re-requested → waiting on you
      'acme/web#358' // dependabot you approved, ready to merge
    ])
    expect(badgeCount(prs, {}, NOW)).toBe(6)
  })

  describe('own PRs count only while a reviewer waits on your reply', () => {
    const own = find(prs, 'acme/api#465')

    it('merge-ready, red CI, and conflicts alone are not counted', () => {
      expect(find(prs, 'acme/api#479').nextAction).toBe('MERGE')
      expect(needsYou(find(prs, 'acme/api#479'))).toBe(false)
      expect(find(prs, 'acme/api#482').nextAction).toBe('FIXCI')
      expect(needsYou(find(prs, 'acme/api#482'))).toBe(false)
      expect(find(prs, 'acme/api#455').nextAction).toBe('FIX')
      expect(needsYou(find(prs, 'acme/api#455'))).toBe(false)
    })

    it('an unresolved thread whose last word is theirs counts', () => {
      expect(needsYou({ ...own, threadsAwaitingViewer: 1 })).toBe(true)
    })

    it('a changes-requested verdict counts even with no inline thread', () => {
      expect(needsYou({ ...own, reviewDecision: 'CHANGES_REQUESTED' })).toBe(true)
    })

    it('a pending reply counts even when red CI outranks it as the chip', () => {
      const red = { ...find(prs, 'acme/api#482'), threadsAwaitingViewer: 1 }
      expect(red.nextAction).toBe('FIXCI')
      expect(needsYou(red)).toBe(true)
    })

    it('drafts count too when a reply is owed', () => {
      expect(needsYou({ ...own, isDraft: true, threadsAwaitingViewer: 1 })).toBe(true)
      expect(needsYou(find(prs, 'acme/billing#91'))).toBe(false)
    })
  })

  it('approved-then-pushed is still theirs to move — not counted', () => {
    const pr = find(prs, 'acme/billing#96')
    expect(pr.nextAction).toBe('WAITING')
    expect(needsYou(pr)).toBe(false)
  })

  it('you commented and they have not replied → waiting on them, not counted', () => {
    const pr: PRSnapshot = {
      ...find(prs, 'acme/web#341'),
      threadsAwaitingViewer: 0,
      viewerReviewState: null,
      viewerCommented: true
    }
    expect(pr.nextAction).toBe('RESUME')
    expect(needsYou(pr)).toBe(false)
  })

  it('code owner requests on human PRs are not counted', () => {
    expect(needsYou(find(prs, 'acme/web#350'))).toBe(false)
  })

  describe('bot PRs', () => {
    const bot = find(prs, 'acme/api#495')

    it('count while a review is requested, directly or via code owners', () => {
      expect(needsYou(bot)).toBe(true)
      expect(
        needsYou({ ...bot, reviewRequestedFromTeam: false, reviewRequestedFromViewer: true })
      ).toBe(true)
    })

    describe('once you approve, count while merging or fixing is your move', () => {
      const approved = find(prs, 'acme/web#358')
      const recompute = (pr: PRSnapshot): PRSnapshot => ({
        ...pr,
        nextAction: computeNextAction(pr)
      })

      it('ready to merge', () => {
        expect(approved.nextAction).toBe('MERGE')
        expect(needsYou(approved)).toBe(true)
      })

      it('merge conflicts or red CI', () => {
        expect(needsYou(recompute({ ...approved, mergeable: 'CONFLICTING' }))).toBe(true)
        expect(needsYou(recompute({ ...approved, meaningfulFailure: true }))).toBe(true)
      })

      it('not while the repo waits on other approvals', () => {
        expect(needsYou(recompute({ ...approved, reviewDecision: 'REVIEW_REQUIRED' }))).toBe(false)
      })
    })

    it('are treated like people when not listed as bots', () => {
      expect(needsYou({ ...bot, authorIsBot: false })).toBe(false)
      const approved = find(prs, 'acme/web#358')
      expect(needsYou({ ...approved, authorIsBot: false, nextAction: 'WAITING' })).toBe(false)
    })
  })

  it('Team/All-only rows never count', () => {
    const pr = find(prs, 'acme/api#491')
    expect(needsYou({ ...pr, reviewRequestedFromViewer: true })).toBe(false)
  })

  it('snoozed rows drop out', () => {
    expect(badgeCount(prs, { 'acme/api#468': { mode: '1h', until: NOW + 60_000 } }, NOW)).toBe(5)
    expect(badgeCount(prs, { 'acme/api#468': { mode: '1h', until: NOW - 1 } }, NOW)).toBe(6)
  })
})
