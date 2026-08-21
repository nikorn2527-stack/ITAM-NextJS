#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

const VERDICT_PATTERNS = [
  { pattern: /CROSS-REVIEW\s*:\s*PASS\s+WITH\s+CONDITIONS/i, value: 'PASS WITH CONDITIONS' },
  { pattern: /CROSS-REVIEW\s*:\s*REQUEST\s+CHANGES/i, value: 'REQUEST CHANGES' },
  { pattern: /CROSS-REVIEW\s*:\s*BLOCKED/i, value: 'BLOCKED' },
  { pattern: /CROSS-REVIEW\s*:\s*PASS/i, value: 'PASS' },
  { pattern: /APPROVED\s+FOR\s+AUDIT/i, value: 'PASS' },
  { pattern: /CHANGES\s+REQUESTED/i, value: 'REQUEST CHANGES' },
]

const SHA_PATTERNS = [
  /(?:exact\s+(?:head|sha)(?:\s+sha)?|head\s+sha|exact\s+commit)\s*[:=\-]?\s*`?([a-f0-9]{40})`?/i,
]

export function parseVerdict(comment) {
  const body = typeof comment?.body === 'string' ? comment.body : ''
  const verdict = VERDICT_PATTERNS.find(({ pattern }) => pattern.test(body))?.value
  if (!verdict) return null

  const sha = SHA_PATTERNS.find((pattern) => pattern.exec(body))?.exec(body)?.[1]?.toLowerCase() ?? null
  return {
    verdict,
    sha,
    author: comment?.user?.login ?? 'unknown',
    url: comment?.html_url ?? null,
    createdAt: comment?.created_at ?? null,
  }
}

export function isReviewablePullRequest(pr) {
  const body = typeof pr?.body === 'string' ? pr.body : ''
  return /(?:Primary(?: peer)? reviewer|Cross-review owner)\s*:/i.test(body)
    && /(?:Exact head(?: SHA)?|Head SHA)\s*:/i.test(body)
}

export function evaluateCrossReview({ headSha, prAuthor, comments }) {
  const normalizedHead = String(headSha ?? '').toLowerCase()
  const normalizedAuthor = String(prAuthor ?? '').toLowerCase()
  const verdicts = (comments ?? []).map(parseVerdict).filter(Boolean)
  const ownerVerdicts = verdicts.filter(
    (verdict) => verdict.author.toLowerCase() === normalizedAuthor,
  )
  const reviewerVerdicts = verdicts.filter(
    (verdict) => verdict.author.toLowerCase() !== normalizedAuthor,
  )
  const current = reviewerVerdicts
    .slice()
    .reverse()
    .find((verdict) => verdict.sha === normalizedHead)
  const stale = reviewerVerdicts.filter((verdict) => verdict.sha !== normalizedHead)
  const missingSha = reviewerVerdicts.filter((verdict) => verdict.sha === null)

  return {
    headSha: normalizedHead,
    current: current ?? null,
    stale,
    missingSha,
    ownerVerdicts,
    verdictCount: reviewerVerdicts.length,
    fresh: Boolean(current),
  }
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

async function allIssueComments(repo, issueNumber, token) {
  const comments = []
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubJson(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      token,
    )
    comments.push(...batch)
    if (batch.length < 100) break
  }
  return comments
}

function printResult(result) {
  console.log(`EXACT_HEAD=${result.headSha}`)
  console.log(`VERDICTS=${result.verdictCount}`)
  console.log(`OWNER_VERDICTS=${result.ownerVerdicts.length}`)
  if (result.current) {
    console.log(`CURRENT_VERDICT=${result.current.verdict}`)
    console.log(`CURRENT_VERDICT_AUTHOR=${result.current.author}`)
    console.log(`CURRENT_VERDICT_SHA=${result.current.sha}`)
    if (result.current.url) console.log(`CURRENT_VERDICT_URL=${result.current.url}`)
  } else {
    console.log('CURRENT_VERDICT=NONE')
  }
  console.log(`STALE_VERDICTS=${result.stale.length}`)
  console.log(`MISSING_SHA_VERDICTS=${result.missingSha.length}`)
  console.log(`EXACT_HEAD_CHECK=${result.fresh ? 'PASS' : 'BLOCKED'}`)
}

async function main() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const issueNumber = process.env.PR_NUMBER
  if (!token || !repo || !issueNumber) {
    throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required')
  }

  const pr = await githubJson(
    `https://api.github.com/repos/${repo}/pulls/${issueNumber}`,
    token,
  )
  if (!isReviewablePullRequest(pr)) {
    console.log('SCOPE_CHECK=SKIP')
    console.log('EXACT_HEAD_CHECK=NOT_APPLICABLE')
    return
  }

  const comments = await allIssueComments(repo, issueNumber, token)
  const result = evaluateCrossReview({
    headSha: pr.head.sha,
    prAuthor: pr.user?.login,
    comments,
  })
  printResult(result)
  if (!result.fresh) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
