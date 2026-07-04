import { describe, expect, it } from 'vitest'
import { makeMockPRs } from '../mockData'
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
    [468, 'ADDRESS', 'green', 'Changes req.'],
    [455, 'ADDRESS', 'green', 'Conflicts'],
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

  it('tray badge = 7 actionable on My PRs + Reviewing (matches prototype)', () => {
    expect(badgeCount(prs, {}, NOW)).toBe(7)
  })

  it('badge excludes snoozed and never counts Team-only PRs', () => {
    const snoozed = { 'acme/api#482': { mode: '1h' as const, until: NOW + 3_600_000 } }
    expect(badgeCount(prs, snoozed, NOW)).toBe(6)
    // #491 is team-only and actionable-looking rows there never count
    expect(prs.find((p) => p.number === 491)!.buckets).toEqual(['team'])
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
