import type {
  CheckInfo,
  CiState,
  ClassifiedCheck,
  DotColor,
  NoisyPattern
} from './types'

/** Star-glob match: "*" is the only wildcard; case-insensitive. */
export function matchNoisy(name: string, repo: string, patterns: NoisyPattern[]): boolean {
  return patterns.some((p) => {
    if (p.repo && p.repo !== repo) return false
    const re = new RegExp(
      '^' + p.pattern.split('*').map(escapeRegExp).join('.*') + '$',
      'i'
    )
    return re.test(name)
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ClassifiedChecks {
  checks: ClassifiedCheck[]
  ciState: CiState
  dot: DotColor
  meaningfulFailure: boolean
}

/**
 * The noisy-checks rule (HANDOFF.md, "critical — user's #1 requirement"):
 * - a noisy check's failure never triggers FIX CI, a red dot, or a notification
 * - meaningful (non-noisy) failures report immediately, even mid-run
 * - all meaningful checks green + noisy failing → amber dot, but semantically green
 *   (ciState 'green' — MERGE and notifications treat the PR as passing)
 * - dot: green = meaningful pass · red = meaningful failure · amber = running or
 *   only-noisy failure · queued (hollow) = all queued · gray = no checks
 */
export function classifyChecks(
  checks: CheckInfo[],
  repo: string,
  patterns: NoisyPattern[]
): ClassifiedChecks {
  const classified: ClassifiedCheck[] = checks.map((c) => ({
    ...c,
    ignored: c.status === 'fail' && matchNoisy(c.name, repo, patterns)
  }))

  const meaningful = classified.filter((c) => !matchNoisy(c.name, repo, patterns))
  const noisyFailing = classified.some((c) => c.ignored)

  let ciState: CiState
  if (checks.length === 0) ciState = 'none'
  else if (meaningful.some((c) => c.status === 'fail')) ciState = 'failed'
  else if (meaningful.some((c) => c.status === 'running')) ciState = 'running'
  else if (meaningful.length > 0 && meaningful.every((c) => c.status === 'queued')) ciState = 'queued'
  else if (meaningful.some((c) => c.status === 'queued')) ciState = 'running'
  else ciState = 'green'

  let dot: DotColor
  switch (ciState) {
    case 'failed':
      dot = 'red'
      break
    case 'running':
      dot = 'amber'
      break
    case 'queued':
      dot = 'queued'
      break
    case 'none':
      dot = 'gray'
      break
    case 'green':
      dot = noisyFailing ? 'amber' : 'green'
      break
  }

  return { checks: classified, ciState, dot, meaningfulFailure: ciState === 'failed' }
}
