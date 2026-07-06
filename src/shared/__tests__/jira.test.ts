import { describe, expect, it } from 'vitest'
import { jiraTicketFrom, jiraUrl } from '../jira'

describe('jiraTicketFrom', () => {
  it.each([
    ['[CFE-3369] Authentication refresh', 'CFE-3369'],
    ['bugfix/[CFE-3310] Dynamic Variables', 'CFE-3310'],
    ['CFE-3353 - Guard against phantom deps', 'CFE-3353'], // bare, uppercase
    ['refactor/[WIN-3879] Autocomplete nav', 'WIN-3879'],
    ['[win-3879] lowercase but bracketed', 'WIN-3879'],
    ['[ Platform-42 ] longer keys, stray spaces', 'PLATFORM-42'],
    ['ABC-123456 six digit ticket', 'ABC-123456'],
    ['[WIN-3478 | WIN-3915] Custom Field Select', 'WIN-3478'], // first wins
    ['chore: bump deps (JIRA-1)', 'JIRA-1'],
    ['prefer [CFE-9] over bare ABC-1 mentions', 'CFE-9'] // brackets are the deliberate tag
  ])('%s → %s', (title, ticket) => {
    expect(jiraTicketFrom(title)).toBe(ticket)
  })

  it.each([
    ['Persist rotated devise tokens at rest'], // nothing ticket-shaped
    ['Support UTF-8 everywhere'], // famous acronym
    ['SHA-256 hashing everywhere'],
    ['fix win-3879 keyboard nav'], // bare + lowercase: indistinguishable from react-19
    ['upgrade react-19 and vue-3'],
    ['release-2024 rollup'],
    ['upgrade x-1 widget'], // single-letter prefix
    ['feature/rb 3640 dashboard component'], // space, not a dash
    ['part ABC-1234567 has too many digits']
  ])('no match: %s', (title) => {
    expect(jiraTicketFrom(title)).toBeNull()
  })

  it('builds the URL from base + ticket, tolerating trailing slashes', () => {
    expect(jiraUrl('https://acme.atlassian.net/browse/', 'CFE-1')).toBe(
      'https://acme.atlassian.net/browse/CFE-1'
    )
    expect(jiraUrl('https://acme.atlassian.net/browse', 'CFE-1')).toBe(
      'https://acme.atlassian.net/browse/CFE-1'
    )
  })
})
