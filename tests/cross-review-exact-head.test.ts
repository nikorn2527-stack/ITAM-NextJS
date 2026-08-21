import { describe, expect, it } from 'vitest'
import { evaluateCrossReview, isReviewablePullRequest, parseVerdict } from '../scripts/validate-cross-review-exact-head.mjs'

const headSha = 'a'.repeat(40)
const staleSha = 'b'.repeat(40)

const comment = (body, login = 'reviewer') => ({
  body,
  user: { login },
  html_url: `https://example.test/${login}`,
})

describe('parseVerdict()', () => {
  it('parses current-format verdict and exact head SHA', () => {
    expect(parseVerdict(comment(`CROSS-REVIEW: PASS\nExact head SHA: \`${headSha}\``))).toMatchObject({
      verdict: 'PASS',
      sha: headSha,
      author: 'reviewer',
    })
  })

  it('recognizes legacy approval vocabulary while requiring the SHA', () => {
    expect(parseVerdict(comment(`APPROVED FOR AUDIT\nexact commit: ${headSha}`))).toMatchObject({
      verdict: 'PASS',
      sha: headSha,
    })
    expect(parseVerdict(comment('APPROVED FOR AUDIT'))).toMatchObject({
      verdict: 'PASS',
      sha: null,
    })
  })
})

describe('isReviewablePullRequest()', () => {
  it('accepts the latest Author team / Primary reviewer / Head SHA template', () => {
    expect(isReviewablePullRequest({
      body: 'Author team: Dev-4 Meter\\nPrimary reviewer: Dev-1 Repair\\nHead SHA: abc',
    })).toBe(true)
  })

  it('accepts Cross-review owner metadata used by existing PRs', () => {
    expect(isReviewablePullRequest({
      body: 'Author team: Dev-2 Stock\\nCross-review owner: Dev-3 Devices\\nHead SHA: abc',
    })).toBe(true)
  })

  it('skips governance PRs without module review metadata', () => {
    expect(isReviewablePullRequest({ body: 'Governance documentation only' })).toBe(false)
  })
})

describe('evaluateCrossReview()', () => {
  it('passes only when a verdict is bound to the current head', () => {
    const result = evaluateCrossReview({
      headSha,
      prAuthor: 'owner',
      comments: [comment(`CROSS-REVIEW: PASS\nExact head SHA: ${staleSha}`), comment(`CROSS-REVIEW: PASS\nExact head SHA: ${headSha}`)],
    })
    expect(result.fresh).toBe(true)
    expect(result.current).toMatchObject({ verdict: 'PASS', sha: headSha })
    expect(result.stale).toHaveLength(1)
  })

  it('blocks when all verdicts are stale or omit the SHA', () => {
    const result = evaluateCrossReview({
      headSha,
      prAuthor: 'owner',
      comments: [comment(`CROSS-REVIEW: PASS\nExact head SHA: ${staleSha}`), comment('CROSS-REVIEW: REQUEST CHANGES')],
    })
    expect(result.fresh).toBe(false)
    expect(result.current).toBeNull()
    expect(result.stale).toHaveLength(2)
    expect(result.missingSha).toHaveLength(1)
  })

  it('ignores a current-head verdict written by the PR owner', () => {
    const result = evaluateCrossReview({
      headSha,
      prAuthor: 'owner',
      comments: [comment(`CROSS-REVIEW: PASS\nExact head SHA: ${headSha}`, 'owner')],
    })
    expect(result.fresh).toBe(false)
    expect(result.current).toBeNull()
    expect(result.ownerVerdicts).toHaveLength(1)
  })
})
