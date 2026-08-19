// ============================================================
// G2 Read-Only Monitor — TypeScript (Bun runtime)
// ============================================================
// Purpose: Poll GitHub state for Issue #14, Issue #15, PR #18 and
//          notify on Issue #14 when tracked state changes ONLY.
//
// Scope (read-only):
//   - GET /repos/{owner}/{repo}/issues/14
//   - GET /repos/{owner}/{repo}/issues/15
//   - GET /repos/{owner}/{repo}/pulls/18
//   - GET /repos/{owner}/{repo}/commits/{sha}/check-runs
//   - GET /repos/{owner}/{repo}/contents/docs/g2-monitor/state.json
//   - PUT  /repos/{owner}/{repo}/issues/14/comments  (POST, one comment per transition)
//   - PUT  /repos/{owner}/{repo}/contents/docs/g2-monitor/state.json (snapshot only)
//
// Hard rules:
//   - MUST NOT close issues
//   - MUST NOT post G2 PASS / G3 authorization
//   - MUST NOT merge PRs
//   - MUST NOT deploy or touch env vars
//   - MUST NOT use production tokens
//   - MUST NOT summarize on behalf of Audit
//   - Posts AT MOST one comment per run, and ONLY if a state field changed
// ============================================================

import { Octokit } from "@octokit/rest";

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GH_REPOSITORY;

if (!TOKEN) {
  console.error("FATAL: GITHUB_TOKEN env var is required");
  process.exit(1);
}
if (!REPO) {
  console.error("FATAL: GH_REPOSITORY env var is required (format: owner/repo)");
  process.exit(1);
}

const [owner, repo] = REPO.split("/");
if (!owner || !repo) {
  console.error(`FATAL: GH_REPOSITORY must be 'owner/repo', got '${REPO}'`);
  process.exit(1);
}

const octokit = new Octokit({ auth: TOKEN });

// ---------- Tracked resources ----------
const ISSUE_14 = 14;
const ISSUE_15 = 15;
const PR_18 = 18;

// 4 required operational checklist items on Issue #14
// (per Release Owner / Audit governance in chat)
const REQUIRED_CHECKLIST_KEYWORDS = [
  "alert test",
  "rollback test",
  "risk acceptance",
  "approved real staging apps script url",
];

// ---------- Types ----------
interface MonitorState {
  lastRunIso: string;
  issue14: {
    state: "open" | "closed";
    labels: string[];
    updatedAt: string;
    commentCount: number;
    checklist: Record<string, boolean>; // keyword -> present in latest comment body?
  };
  issue15: {
    state: "open" | "closed";
    closedAt: string | null;
  };
  pr18: {
    state: "open" | "closed";
    merged: boolean;
    mergeableState: string | null;
    headSha: string;
    baseRef: string;
  };
  mainHeadSha: string | null;
  ciOnPr18Head: {
    name: string;
    status: string;
    conclusion: string | null;
  }[];
  gateAssertion: {
    // Monitor never decides gate. This is read from the most recent
    // Audit comment on Issue #14 — not computed by monitor.
    g2: string;
    g3: string;
    production: string;
    source: string; // comment URL
  };
}

// ---------- Helpers ----------
async function getIssue(issueNumber: number) {
  const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
  return data;
}

async function getLatestIssueComment(issueNumber: number) {
  const { data } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  if (data.length === 0) return null;
  return data[data.length - 1];
}

async function getPullRequest(prNumber: number) {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  return data;
}

async function getCheckRunsForSha(sha: string) {
  const { data } = await octokit.rest.checks.listForRef({ owner, repo, ref: sha });
  return data.check_runs.map((r) => ({
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
  }));
}

async function getMainHeadSha() {
  const { data } = await octokit.rest.repos.getBranch({ owner, repo, branch: "main" });
  return data.commit.sha;
}

function detectChecklist(commentBody: string): Record<string, boolean> {
  const body = (commentBody || "").toLowerCase();
  const out: Record<string, boolean> = {};
  for (const kw of REQUIRED_CHECKLIST_KEYWORDS) {
    out[kw] = body.includes(kw);
  }
  return out;
}

function detectGateFromAuditComment(commentBody: string): MonitorState["gateAssertion"] | null {
  const body = commentBody || "";
  // Look for Audit's standard verdict patterns.
  // Monitor does NOT compute gate — only extracts what Audit wrote.
  // Patterns observed in actual comments:
  //   "G2: **CONDITIONAL / PENDING**"
  //   "G2 remains **CONDITIONAL / PENDING**"
  //   "G2 remains CONDITIONAL/PENDING"
  //   "G3 Canary and Production remain **BLOCKED**"
  //   "G3 Canary: **BLOCKED**"
  const g2Match = body.match(/G2(?:\s+remains)?[:\s]+\*{0,2}(CONDITIONAL[\s\/]*PENDING|PASS|FAIL|BLOCKED)\*{0,2}/i);
  // G3 and Production are often in one sentence: "G3 Canary and Production remain **BLOCKED**"
  const g3ProdMatch = body.match(/G3[\s\w]*?\s+and\s+Production\s+(?:remain|remains)?[:\s]*\*{0,2}(BLOCKED|PASS|FAIL|READY|CANARY)\*{0,2}/i);
  const g3Match = body.match(/G3[\s\w]*?[:\s]+\*{0,2}(BLOCKED|PASS|FAIL|READY|CANARY)\*{0,2}/i);
  const prodMatch = body.match(/Production(?:\s+remain[s]?|[:\s])+\*{0,2}(BLOCKED|PASS|FAIL|READY)\*{0,2}/i);
  if (!g2Match) return null;
  const normalize = (s: string | undefined) =>
    s ? s.toUpperCase().replace(/\s+/g, " ").trim() : "UNKNOWN";
  return {
    g2: normalize(g2Match[1]),
    g3: normalize((g3ProdMatch ? g3ProdMatch[1] : g3Match ? g3Match[1] : undefined)),
    production: normalize((g3ProdMatch ? g3ProdMatch[1] : prodMatch ? prodMatch[1] : undefined)),
    source: "extracted from latest comment on Issue #14",
  };
}

async function readPreviousState(): Promise<MonitorState | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "docs/g2-monitor/state.json",
      ref: "main",
    });
    if ("content" in data && data.content) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return JSON.parse(decoded) as MonitorState;
    }
  } catch (e) {
    console.log("No previous snapshot found — first run.");
  }
  return null;
}

function writeLocalSnapshot(state: MonitorState) {
  // Persist locally so the workflow step can git commit + push it.
  const fs = require("fs");
  const path = require("path");
  const dir = "docs/g2-monitor";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

function shallowEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffState(prev: MonitorState, curr: MonitorState): string[] {
  const changes: string[] = [];
  if (prev.issue14.state !== curr.issue14.state) {
    changes.push(`Issue #14 state: ${prev.issue14.state} -> ${curr.issue14.state}`);
  }
  if (prev.issue15.state !== curr.issue15.state) {
    changes.push(`Issue #15 state: ${prev.issue15.state} -> ${curr.issue15.state}`);
  }
  if (prev.pr18.state !== curr.pr18.state) {
    changes.push(`PR #18 state: ${prev.pr18.state} -> ${curr.pr18.state}`);
  }
  if (prev.pr18.merged !== curr.pr18.merged) {
    changes.push(`PR #18 merged: ${prev.pr18.merged} -> ${curr.pr18.merged}`);
  }
  if (prev.pr18.mergeableState !== curr.pr18.mergeableState) {
    changes.push(
      `PR #18 mergeable_state: ${prev.pr18.mergeableState} -> ${curr.pr18.mergeableState}`,
    );
  }
  if (prev.pr18.headSha !== curr.pr18.headSha) {
    changes.push(`PR #18 head SHA: ${prev.pr18.headSha.slice(0, 8)} -> ${curr.pr18.headSha.slice(0, 8)}`);
  }
  if (!shallowEqual(prev.issue14.checklist, curr.issue14.checklist)) {
    const added = Object.entries(curr.issue14.checklist)
      .filter(([k, v]) => v && !prev.issue14.checklist[k])
      .map(([k]) => `+${k}`);
    const removed = Object.entries(curr.issue14.checklist)
      .filter(([k, v]) => !v && prev.issue14.checklist[k])
      .map(([k]) => `-${k}`);
    if (added.length || removed.length) {
      changes.push(`Issue #14 checklist: ${[...added, ...removed].join(", ")}`);
    }
  }
  if (!shallowEqual(prev.ciOnPr18Head, curr.ciOnPr18Head)) {
    changes.push(`CI on PR #18 head changed`);
  }
  if (prev.mainHeadSha !== curr.mainHeadSha) {
    changes.push(`main HEAD: ${prev.mainHeadSha?.slice(0, 8)} -> ${curr.mainHeadSha?.slice(0, 8)}`);
  }
  if (!shallowEqual(prev.gateAssertion, curr.gateAssertion)) {
    changes.push(
      `Gate assertion (from latest Audit comment): ${JSON.stringify(curr.gateAssertion)}`,
    );
  }
  return changes;
}

async function postTransitionComment(changes: string[], state: MonitorState) {
  const header = "## G2 Monitor — State Transition Detected";
  const time = new Date().toISOString();
  const lines = [
    header,
    "",
    `**Run time (UTC):** ${time}`,
    `**Monitor:** read-only, automated`,
    "**Gate state (extracted from latest comment — not computed by monitor):**",
    `- G2: ${state.gateAssertion.g2}`,
    `- G3 Canary: ${state.gateAssertion.g3}`,
    `- Production: ${state.gateAssertion.production}`,
    "",
    "**Changes detected:**",
    ...changes.map((c) => `- ${c}`),
    "",
    "**Current snapshot:**",
    `- Issue #14: ${state.issue14.state} (comments: ${state.issue14.commentCount}, updated: ${state.issue14.updatedAt})`,
    `- Issue #15: ${state.issue15.state}${state.issue15.closedAt ? ` (closed at ${state.issue15.closedAt})` : ""}`,
    `- PR #18: ${state.pr18.state} (mergeable_state: ${state.pr18.mergeableState}, head: ${state.pr18.headSha.slice(0, 8)})`,
    `- main HEAD: ${state.mainHeadSha?.slice(0, 8)}`,
    `- CI on PR #18 head: ${state.ciOnPr18Head.length} check-runs`,
    "",
    "**Required checklist (Issue #14, latest comment):**",
    ...Object.entries(state.issue14.checklist).map(
      ([k, v]) => `- ${v ? "✅" : "❌"} ${k}`,
    ),
    "",
    "---",
    "_This is an automated read-only notification. The monitor does not decide gate state, does not close issues, does not merge PRs, and does not deploy. Gate state above is extracted from the latest Audit comment on Issue #14, not computed by the monitor._",
  ];

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: ISSUE_14,
    body: lines.join("\n"),
  });
  console.log("Posted transition comment on Issue #14");
}

// ---------- Main ----------
async function main() {
  console.log(`[G2 Monitor] start at ${new Date().toISOString()}`);
  console.log(`[G2 Monitor] repo: ${owner}/${repo}`);

  // Fetch all state (read-only)
  const [i14, i15, latestComment14, pr18] = await Promise.all([
    getIssue(ISSUE_14),
    getIssue(ISSUE_15),
    getLatestIssueComment(ISSUE_14),
    getPullRequest(PR_18),
  ]);

  const mainHeadSha = await getMainHeadSha();
  const ciOnPr18Head = await getCheckRunsForSha(pr18.head.sha);

  const checklist = latestComment14?.body
    ? detectChecklist(latestComment14.body)
    : Object.fromEntries(REQUIRED_CHECKLIST_KEYWORDS.map((k) => [k, false]));

  const gateAssertion = latestComment14?.body
    ? detectGateFromAuditComment(latestComment14.body) ?? {
        g2: "CONDITIONAL/PENDING (default)",
        g3: "BLOCKED (default)",
        production: "BLOCKED (default)",
        source: "default — no Audit verdict found in latest comment",
      }
    : {
        g2: "CONDITIONAL/PENDING (default)",
        g3: "BLOCKED (default)",
        production: "BLOCKED (default)",
        source: "default — no comment found",
      };

  const currentState: MonitorState = {
    lastRunIso: new Date().toISOString(),
    issue14: {
      state: i14.state as "open" | "closed",
      labels: i14.labels.map((l) => (typeof l === "string" ? l : l.name || "")),
      updatedAt: i14.updated_at,
      commentCount: i14.comments,
      checklist,
    },
    issue15: {
      state: i15.state as "open" | "closed",
      closedAt: i15.closed_at,
    },
    pr18: {
      state: pr18.state as "open" | "closed",
      merged: pr18.merged,
      mergeableState: pr18.mergeable_state,
      headSha: pr18.head.sha,
      baseRef: pr18.base.ref,
    },
    mainHeadSha,
    ciOnPr18Head,
    gateAssertion,
  };

  console.log("[G2 Monitor] current state:");
  console.log(JSON.stringify(currentState, null, 2));

  // Persist locally so workflow step can commit + push snapshot
  writeLocalSnapshot(currentState);

  // Diff against previous snapshot
  const prevState = await readPreviousState();
  if (!prevState) {
    console.log("[G2 Monitor] first run — no comment posted (snapshot will be committed)");
    // Even on first run, do NOT post a "hello" comment — silent bootstrap.
    return;
  }

  const changes = diffState(prevState, currentState);
  if (changes.length === 0) {
    console.log("[G2 Monitor] no state changes detected — no comment posted");
    return;
  }

  console.log(`[G2 Monitor] ${changes.length} change(s) detected — posting comment`);
  await postTransitionComment(changes, currentState);

  console.log("[G2 Monitor] done");
}

main().catch((err) => {
  console.error("[G2 Monitor] FATAL:", err);
  process.exit(1);
});
