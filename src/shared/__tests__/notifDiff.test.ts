import { describe, expect, it } from 'vitest'
import { diffSnapshots } from '../notifDiff'
import { makeMockPRs, MOCK_SETTINGS } from '../mockData'
import { activityFingerprint } from '../fingerprint'
import type { NotifState, PRSnapshot } from '../types'

const NOW = Date.parse('2026-07-03T12:00:00Z')

function myPr(over: Partial<PRSnapshot> = {}): PRSnapshot {
  const pr = makeMockPRs(NOW).find((p) => p.key === 'acme/api#479')! // mine, MERGE
  return { ...pr, ...over }
}

function opts(over: Partial<Parameters<typeof diffSnapshots>[2]> = {}) {
  return { settings: MOCK_SETTINGS, snoozed: {}, now: NOW, ...over }
}

function seed(prs: PRSnapshot[]): NotifState {
  return diffSnapshots({}, prs, opts()).nextState
}

describe('diffSnapshots', () => {
  it('first run seeds silently — no notification storm', () => {
    const { events, nextState } = diffSnapshots({}, makeMockPRs(NOW), opts())
    expect(events).toEqual([])
    expect(Object.keys(nextState).length).toBe(10)
  })

  it('CI fail fires on transition, once, and again only on a new SHA', () => {
    const green = myPr()
    const state0 = seed([green])
    const failed = myPr({
      meaningfulFailure: true,
      ciState: 'failed',
      dot: 'red',
      checks: [{ name: 'e2e', status: 'fail', duration: '1m', ignored: false }]
    })

    const r1 = diffSnapshots(state0, [failed], opts())
    expect(r1.events.map((e) => e.kind)).toEqual(['ciFail'])

    // same failing SHA on the next poll: silent
    const r2 = diffSnapshots(r1.nextState, [failed], opts())
    expect(r2.events).toEqual([])

    // new commit that also fails: fires again
    const failedNewSha = { ...failed, headSha: 'sha-new' }
    const r3 = diffSnapshots(r2.nextState, [failedNewSha], opts())
    expect(r3.events.map((e) => e.kind)).toEqual(['ciFail'])
  })

  it('merge-ready fires on false→true and re-arms after dropping out', () => {
    const waiting = myPr({ nextAction: 'WAITING' })
    const state0 = seed([waiting])

    const ready = myPr({ nextAction: 'MERGE' })
    const r1 = diffSnapshots(state0, [ready], opts())
    expect(r1.events.map((e) => e.kind)).toEqual(['mergeReady'])

    const r2 = diffSnapshots(r1.nextState, [ready], opts())
    expect(r2.events).toEqual([])

    // drops out (new commits → review dismissed), then approved again
    const r3 = diffSnapshots(r2.nextState, [waiting], opts())
    const r4 = diffSnapshots(r3.nextState, [ready], opts())
    expect(r4.events.map((e) => e.kind)).toEqual(['mergeReady'])
  })

  it('review request fires once, re-fires on re-request', () => {
    const pr = makeMockPRs(NOW).find((p) => p.key === 'acme/auth#217')!
    const notRequested = { ...pr, reviewRequestedFromViewer: false }
    const state0 = seed([notRequested])

    const r1 = diffSnapshots(state0, [pr], opts())
    expect(r1.events.map((e) => e.kind)).toEqual(['reviewRequested'])
    expect(diffSnapshots(r1.nextState, [pr], opts()).events).toEqual([])

    // request withdrawn, then re-requested
    const r2 = diffSnapshots(r1.nextState, [notRequested], opts())
    const r3 = diffSnapshots(r2.nextState, [pr], opts())
    expect(r3.events.map((e) => e.kind)).toEqual(['reviewRequested'])
  })

  it('comments batch to one notification per PR per 15 minutes', () => {
    const pr = myPr({ commentCount: 7 })
    const state0 = seed([pr])

    const r1 = diffSnapshots(state0, [myPr({ commentCount: 9 })], opts())
    expect(r1.events.map((e) => e.kind)).toEqual(['comments'])
    expect(r1.events[0].title).toContain('2 new comments')

    // more comments 5 minutes later: held
    const r2 = diffSnapshots(r1.nextState, [myPr({ commentCount: 10 })], opts({ now: NOW + 5 * 60_000 }))
    expect(r2.events).toEqual([])

    // window passes: fires with the accumulated delta
    const r3 = diffSnapshots(r2.nextState, [myPr({ commentCount: 10 })], opts({ now: NOW + 16 * 60_000 }))
    expect(r3.events.map((e) => e.kind)).toEqual(['comments'])
    expect(r3.events[0].title).toContain('1 new comment')
  })

  it('snoozed PRs stay silent but state still advances', () => {
    const green = myPr()
    const state0 = seed([green])
    const failed = myPr({
      meaningfulFailure: true,
      ciState: 'failed',
      checks: [{ name: 'e2e', status: 'fail', duration: '1m', ignored: false }]
    })
    const snoozed = { [green.key]: { mode: '1h' as const, until: NOW + 60 * 60_000 } }

    const r1 = diffSnapshots(state0, [failed], opts({ snoozed }))
    expect(r1.events).toEqual([])

    // unsnooze: does not replay the stale failure
    const r2 = diffSnapshots(r1.nextState, [failed], opts())
    expect(r2.events).toEqual([])
  })

  it('respects per-kind settings toggles without replaying later', () => {
    const off = {
      ...MOCK_SETTINGS,
      notifications: { ...MOCK_SETTINGS.notifications, approved: false }
    }
    const waiting = myPr({ nextAction: 'WAITING' })
    const ready = myPr({ nextAction: 'MERGE' })
    const state0 = seed([waiting])

    const r1 = diffSnapshots(state0, [ready], opts({ settings: off }))
    expect(r1.events).toEqual([])
    // toggled back on: state already advanced, no replay
    const r2 = diffSnapshots(r1.nextState, [ready], opts())
    expect(r2.events).toEqual([])
  })

  it('closed PRs drop out of state', () => {
    const pr = myPr()
    const state0 = seed([pr])
    const { nextState } = diffSnapshots(state0, [], opts())
    expect(nextState[pr.key]).toBeUndefined()
  })
})

describe('activity fingerprint', () => {
  it('changes on commit, review, comment, or CI state change', () => {
    const pr = myPr()
    const fp = activityFingerprint(pr)
    expect(activityFingerprint({ ...pr, headSha: 'x' })).not.toBe(fp)
    expect(activityFingerprint({ ...pr, reviewCount: pr.reviewCount + 1 })).not.toBe(fp)
    expect(activityFingerprint({ ...pr, commentCount: pr.commentCount + 1 })).not.toBe(fp)
    expect(activityFingerprint({ ...pr, ciState: 'failed' })).not.toBe(fp)
    expect(activityFingerprint({ ...pr })).toBe(fp)
  })
})
