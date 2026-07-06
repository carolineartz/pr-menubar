/**
 * Best-effort Jira ticket extraction from PR titles.
 *
 * Convention is "[XX-1234] Title" but reality is looser: brackets go missing,
 * project keys vary in length and case, digit counts vary. To avoid linking
 * "UTF-8" or "react-19" to Jira:
 * - bracketed keys ([cfe-3369]) match in any case — brackets are deliberate
 * - bare keys must be UPPERCASE (CFE-3353) and not a well-known tech acronym
 * First match wins; keys normalize to uppercase.
 */
const BRACKETED = /\[\s*([A-Za-z]{2,10})-(\d{1,6})(?:[^\]]*)\]/
const BARE = /(?:^|[^A-Za-z0-9])([A-Z]{2,10})-(\d{1,6})(?![A-Za-z0-9])/
const NOISE = new Set([
  'UTF', 'SHA', 'MD', 'ISO', 'RFC', 'AES', 'RSA', 'TLS', 'SSL',
  'HTTP', 'HTTPS', 'ES', 'CVE', 'IPV', 'OAUTH', 'GPT'
])

export function jiraTicketFrom(title: string): string | null {
  const bracketed = BRACKETED.exec(title)
  if (bracketed) return `${bracketed[1].toUpperCase()}-${bracketed[2]}`
  const bare = BARE.exec(title)
  if (bare && !NOISE.has(bare[1])) return `${bare[1]}-${bare[2]}`
  return null
}

export function jiraUrl(baseUrl: string, ticket: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${ticket}`
}
