import { describe, expect, it } from 'vitest'
import { badgeCount, needsYou } from '../badge'
import { MOCK_SETTINGS, makeMockPRs } from '../mockData'
import type { PRSnapshot } from '../types'

const NOW = Date.parse('2026-07-04T12:00:00Z')
const BOTS = MOCK_SETTINGS.botAuthors

const find = (prs: PRSnapshot[], key: string): PRSnapshot => prs.find((p) => p.key === key)!

describe('badgeCount', () => {
  const prs = makeMockPRs(NOW)
  const counted = prs.filter((p) => needsYou(p, BOTS)).map((p) => p.key)

  it('counts owed review replies, Start review, Waiting on you, and bot requests', () => {
    expect(counted.sort()).toEqual([
      'acme/api#468', // own: reviewer replied, changes requested
      'acme/api#486', // start review
      'acme/api#495', // dependabot, code-owner request
      'acme/auth#217', // start review
      'acme/auth#221', // re-requested → waiting on you
      'acme/web#341' // reply awaiting you
    ])
    expect(badgeCount(prs, {}, BOTS, NOW)).toBe(6)
  })

  describe('own PRs count only while a reviewer waits on your reply', () => {
    const own = find(prs, 'acme/api#465')

    it('merge-ready, red CI, and conflicts alone are not counted', () => {
      expect(find(prs, 'acme/api#479').nextAction).toBe('MERGE')
      expect(needsYou(find(prs, 'acme/api#479'), BOTS)).toBe(false)
      expect(find(prs, 'acme/api#482').nextAction).toBe('FIXCI')
      expect(needsYou(find(prs, 'acme/api#482'), BOTS)).toBe(false)
      expect(find(prs, 'acme/api#455').nextAction).toBe('FIX')
      expect(needsYou(find(prs, 'acme/api#455'), BOTS)).toBe(false)
    })

    it('an unresolved thread whose last word is theirs counts', () => {
      expect(needsYou({ ...own, threadsAwaitingViewer: 1 }, BOTS)).toBe(true)
    })

    it('a changes-requested verdict counts even with no inline thread', () => {
      expect(needsYou({ ...own, reviewDecision: 'CHANGES_REQUESTED' }, BOTS)).toBe(true)
    })

    it('a pending reply counts even when red CI outranks it as the chip', () => {
      const red = { ...find(prs, 'acme/api#482'), threadsAwaitingViewer: 1 }
      expect(red.nextAction).toBe('FIXCI')
      expect(needsYou(red, BOTS)).toBe(true)
    })

    it('drafts count too when a reply is owed', () => {
      expect(needsYou({ ...own, isDraft: true, threadsAwaitingViewer: 1 }, BOTS)).toBe(true)
      expect(needsYou(find(prs, 'acme/billing#91'), BOTS)).toBe(false)
    })
  })

  it('approved-then-pushed is still theirs to move — not counted', () => {
    const pr = find(prs, 'acme/billing#96')
    expect(pr.nextAction).toBe('WAITING')
    expect(needsYou(pr, BOTS)).toBe(false)
  })

  it('you commented and they have not replied → waiting on them, not counted', () => {
    const pr: PRSnapshot = {
      ...find(prs, 'acme/web#341'),
      threadsAwaitingViewer: 0,
      viewerReviewState: null,
      viewerCommented: true
    }
    expect(pr.nextAction).toBe('RESUME')
    expect(needsYou(pr, BOTS)).toBe(false)
  })

  it('code owner requests on human PRs are not counted', () => {
    expect(needsYou(find(prs, 'acme/web#350'), BOTS)).toBe(false)
  })

  describe('bot PRs', () => {
    const bot = find(prs, 'acme/api#495')

    it('count while a review is requested, directly or via code owners', () => {
      expect(needsYou(bot, BOTS)).toBe(true)
      expect(
        needsYou({ ...bot, reviewRequestedFromTeam: false, reviewRequestedFromViewer: true }, BOTS)
      ).toBe(true)
    })

    it('stop counting once you approve', () => {
      expect(
        needsYou({ ...bot, reviewRequestedFromTeam: false, viewerReviewState: 'APPROVED' }, BOTS)
      ).toBe(false)
    })

    it('are treated like people when not listed as bots', () => {
      expect(needsYou(bot, [])).toBe(false)
    })
  })

  it('Team/All-only rows never count', () => {
    const pr = find(prs, 'acme/api#491')
    expect(needsYou({ ...pr, reviewRequestedFromViewer: true }, BOTS)).toBe(false)
  })

  it('snoozed rows drop out', () => {
    expect(
      badgeCount(prs, { 'acme/api#468': { mode: '1h', until: NOW + 60_000 } }, BOTS, NOW)
    ).toBe(5)
    expect(badgeCount(prs, { 'acme/api#468': { mode: '1h', until: NOW - 1 } }, BOTS, NOW)).toBe(6)
  })
})
