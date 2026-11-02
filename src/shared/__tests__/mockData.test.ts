import { describe, expect, it } from 'vitest'
import { MOCK_SETTINGS, makeMockPRs } from '../mockData'
import { badgeCount } from '../badge'
import { pillFor } from '../present'
import { snoozeUntil } from '../fingerprint'

const NOW = Date.parse('2026-07-03T12:00:00Z')

/** The mock dataset must reproduce the prototype's chips, dots, and pills
 *  through the real classify/next-action logic. */
describe('mock data matches the prototype', () => {
  const prs = makeMockPRs(NOW)
  const byNum = (n: number) => prs.find((p) => p.number === n)!

  it.each([
    [482, 'FIXCI', 'red', 'Approved'],
    [479, 'MERGE', 'green', '2 approvals'],
    [468, 'RESPOND', 'green', 'Changes req.'],
    [465, 'WAITING', 'green', null],
    [455, 'FIX', 'green', 'Conflicts'],
    [91, 'WAITING', 'queued', '0 of 2 reviews'],
    [217, 'REVIEW', 'green', null],
    [486, 'REVIEW', 'amber', null],
    [341, 'RESUME', 'green', null],
    [322, 'WAITING', 'red', 'Changes req.'],
    [491, 'WAITING', 'amber', '1 of 2 reviews']
  ])('#%i → %s / %s dot / %s pill', (num, chip, dot, pill) => {
    const pr = byNum(num as number)
    expect(pr.nextAction).toBe(chip)
    expect(pr.dot).toBe(dot)
    expect(pillFor(pr)?.[0] ?? null).toBe(pill)
  })

  it('#482 marks codecov as ignored · noisy', () => {
    const codecov = byNum(482).checks.find((c) => c.name === 'codecov/project')!
    expect(codecov.ignored).toBe(true)
  })

  it('tray badge counts owed replies, reviews on your plate, and bot requests', () => {
    // #468 (reviewer awaits your reply) · #217 #486 (start review) · #221
    // (waiting on you) · #495 (dependabot, code-owner request)
    expect(badgeCount(prs, {}, MOCK_SETTINGS.botAuthors, NOW)).toBe(5)
  })

  it('badge excludes snoozed and never counts Team-only PRs', () => {
    const snoozed = { 'acme/api#468': { mode: '1h' as const, until: NOW + 3_600_000 } }
    expect(badgeCount(prs, snoozed, MOCK_SETTINGS.botAuthors, NOW)).toBe(4)
    // #491 is team-only (plus the All feed) — never counted in the badge
    expect(prs.find((p) => p.number === 491)!.buckets).toEqual(['team', 'all'])
  })
})

describe('snoozeUntil', () => {
  it('1h adds an hour', () => {
    expect(snoozeUntil('1h', NOW)).toBe(NOW + 3_600_000)
  })

  it('tomorrow lands on 8:00 AM local the next day', () => {
    const t = new Date(snoozeUntil('tomorrow', NOW))
    expect(t.getHours()).toBe(8)
    expect(t.getMinutes()).toBe(0)
    expect(t.getTime()).toBeGreaterThan(NOW)
  })
})
