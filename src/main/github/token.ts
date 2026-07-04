import { execFile } from 'node:child_process'

/** Packaged GUI apps don't inherit the shell PATH — try known install
 *  locations before falling back to PATH resolution. */
const GH_CANDIDATES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh']

export class GhUnavailableError extends Error {
  constructor(message = 'GitHub CLI is not available or not authenticated') {
    super(message)
  }
}

function tryExec(bin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, ['auth', 'token'], { timeout: 10_000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

export async function getGhToken(): Promise<string> {
  for (const bin of GH_CANDIDATES) {
    try {
      const token = await tryExec(bin)
      if (token) return token
    } catch {
      // try the next candidate
    }
  }
  throw new GhUnavailableError()
}
