import type { PRSnapshot } from './types'

/**
 * Footer search (My PRs / Reviewing / Team / Saved): fuzzy match against the
 * rows already in state. Every whitespace-separated token must hit at least
 * one field — as a plain substring, or (3+ chars) as an in-order character
 * subsequence of the title or branch that starts at a word boundary, so
 * "wbhk" finds "webhook" without "rework onboarding checklist" matching too.
 */
export function matchesQuery(pr: PRSnapshot, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const title = pr.title.toLowerCase()
  const branch = pr.headRefName.toLowerCase()
  const substringFields = [
    title,
    branch,
    pr.repo.toLowerCase(),
    pr.author.toLowerCase(),
    `#${pr.number}`,
    String(pr.number)
  ]
  return tokens.every(
    (t) =>
      substringFields.some((f) => f.includes(t)) ||
      (t.length >= 3 && (fuzzyWord(t, title) || fuzzyWord(t, branch)))
  )
}

/** needle is a subsequence of hay starting at the first letter of some word */
function fuzzyWord(needle: string, hay: string): boolean {
  for (let start = 0; start < hay.length; start++) {
    if (hay[start] !== needle[0]) continue
    if (start > 0 && /[a-z0-9]/.test(hay[start - 1])) continue // mid-word
    let i = 0
    for (let j = start; j < hay.length && i < needle.length; j++) {
      if (hay[j] === needle[i]) i++
    }
    if (i === needle.length) return true
  }
  return false
}
