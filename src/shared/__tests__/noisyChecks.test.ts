import { describe, expect, it } from 'vitest'
import { classifyChecks, matchNoisy } from '../noisyChecks'
import type { CheckInfo, NoisyPattern } from '../types'

const NOISY: NoisyPattern[] = [{ pattern: 'codecov/*' }]

function ck(name: string, status: CheckInfo['status']): CheckInfo {
  return { name, status, duration: '' }
}

describe('matchNoisy', () => {
  it('star-glob matches', () => {
    expect(matchNoisy('codecov/project', 'a/b', NOISY)).toBe(true)
    expect(matchNoisy('codecov/patch', 'a/b', NOISY)).toBe(true)
    expect(matchNoisy('build', 'a/b', NOISY)).toBe(false)
    expect(matchNoisy('not-codecov/x', 'a/b', NOISY)).toBe(false)
  })

  it('is case-insensitive and escapes regex chars', () => {
    expect(matchNoisy('CodeCov/Project', 'a/b', NOISY)).toBe(true)
    expect(matchNoisy('ci (lint)', 'a/b', [{ pattern: 'ci (lint)' }])).toBe(true)
    expect(matchNoisy('ci-x-lint', 'a/b', [{ pattern: 'ci (lint)' }])).toBe(false)
  })

  it('respects per-repo scoping', () => {
    const scoped: NoisyPattern[] = [{ pattern: 'flaky-*', repo: 'acme/api' }]
    expect(matchNoisy('flaky-e2e', 'acme/api', scoped)).toBe(true)
    expect(matchNoisy('flaky-e2e', 'acme/web', scoped)).toBe(false)
  })
})

describe('classifyChecks — the noisy-checks rule', () => {
  it('noisy failure while others run: no red, no meaningful failure', () => {
    const r = classifyChecks(
      [ck('build', 'ok'), ck('e2e', 'running'), ck('codecov/project', 'fail')],
      'a/b',
      NOISY
    )
    expect(r.meaningfulFailure).toBe(false)
    expect(r.dot).toBe('amber') // running
    expect(r.checks.find((c) => c.name === 'codecov/project')!.ignored).toBe(true)
  })

  it('all meaningful green + noisy still failing: amber dot, semantically green', () => {
    const r = classifyChecks(
      [ck('build', 'ok'), ck('lint', 'ok'), ck('codecov/project', 'fail')],
      'a/b',
      NOISY
    )
    expect(r.ciState).toBe('green') // MERGE + notifications treat as passing
    expect(r.dot).toBe('amber') // only-noisy failure at completion
    expect(r.meaningfulFailure).toBe(false)
  })

  it('all green including noisy: green dot', () => {
    const r = classifyChecks(
      [ck('build', 'ok'), ck('codecov/project', 'ok')],
      'a/b',
      NOISY
    )
    expect(r.dot).toBe('green')
    expect(r.ciState).toBe('green')
  })

  it('non-noisy failure reports immediately, even mid-run', () => {
    const r = classifyChecks(
      [ck('build', 'ok'), ck('e2e', 'fail'), ck('deploy', 'running')],
      'a/b',
      NOISY
    )
    expect(r.meaningfulFailure).toBe(true)
    expect(r.dot).toBe('red')
    expect(r.ciState).toBe('failed')
  })

  it('no checks: gray dot', () => {
    const r = classifyChecks([], 'a/b', NOISY)
    expect(r.dot).toBe('gray')
    expect(r.ciState).toBe('none')
  })

  it('all queued: hollow queued dot', () => {
    const r = classifyChecks([ck('build', 'queued'), ck('lint', 'queued')], 'a/b', NOISY)
    expect(r.dot).toBe('queued')
    expect(r.ciState).toBe('queued')
  })

  it('mixed queued + complete counts as running', () => {
    const r = classifyChecks([ck('build', 'ok'), ck('lint', 'queued')], 'a/b', NOISY)
    expect(r.ciState).toBe('running')
    expect(r.dot).toBe('amber')
  })
})
