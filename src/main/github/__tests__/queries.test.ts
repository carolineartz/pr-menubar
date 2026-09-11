import { describe, expect, it } from 'vitest'
import { EMPTY_ALL_QUERY } from '../../../shared/ipc'
import { MOCK_SETTINGS } from '../../../shared/mockData'
import { allSearchString, buildAllOpenQuery, buildAllSearchQuery } from '../queries'

describe('All-tab search strings', () => {
  it('the base feed asks GitHub for its total', () => {
    expect(buildAllOpenQuery(MOCK_SETTINGS).document).toMatch(/issueCount/)
  })

  it('no filters → the same feed as the poll', () => {
    expect(allSearchString(MOCK_SETTINGS, EMPTY_ALL_QUERY)).toBe(
      'is:pr is:open sort:created-desc repo:acme/api repo:acme/web repo:acme/auth repo:acme/billing'
    )
  })

  it('author, drafts, title text and repo focus each add a qualifier', () => {
    const s = allSearchString(MOCK_SETTINGS, {
      author: 'mkatz',
      text: '  rate limit ',
      hideDrafts: true,
      repo: 'acme/api'
    })
    expect(s).toBe(
      'is:pr is:open author:mkatz draft:false rate limit in:title sort:created-desc repo:acme/api'
    )
  })

  it('repo focus replaces the watched-repo list rather than adding to it', () => {
    const s = allSearchString(MOCK_SETTINGS, { ...EMPTY_ALL_QUERY, repo: 'acme/web' })
    expect(s.match(/repo:/g)).toHaveLength(1)
  })

  it('the narrowed query carries the string and requests a count', () => {
    const q = buildAllSearchQuery(MOCK_SETTINGS, { ...EMPTY_ALL_QUERY, author: 'dvest' })
    expect(q.variables.allOpenQ).toContain('author:dvest')
    expect(q.document).toMatch(/issueCount/)
  })
})
