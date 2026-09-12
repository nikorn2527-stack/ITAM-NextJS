## Module and ownership

- Module owner team: `Dev-1 Repair | Dev-2 Stock | Dev-3 Devices | Dev-4 Meter`
- Work type: `feature | bugfix | security | refactor | migration | sync | docs/test-only`
- Primary cross-review team: `Dev-N`
- Backup cross-review team: `Dev-N`
- Domain-consult team(s), if cross-module: `Dev-N / none`

## Scope and contracts

- Impacted modules: `Repair | Stock | Devices | Meter | Shared Platform`
- Shared Contract Change: `yes | no`
- Changes auth/RBAC/audit/migration/sync-apply: `yes | no`
- B4 frozen files changed: `yes | no`
- CSV fallback preserved: `yes | no | not applicable`

## Evidence

- Exact head SHA reviewed: `<40-character SHA>`
- Test command and result: `...`
- Lint/typecheck result: `...`
- Performance/resource bound checked: `yes | no | not applicable`
- Mobile/API consumer compatibility checked: `yes | no | not applicable`
- Database write or migration performed: `yes | no`

## Cross-review handoff

- [ ] I am not approving my own work.
- [ ] The primary reviewer is outside the author team.
- [ ] If the primary reviewer has a conflict, the backup reviewer and reason are recorded in a comment.
- [ ] Cross-module consumers have been identified and domain review requested where needed.
- [ ] Shared Contract Change is explicitly sent to Audit before merge.
- [ ] No `prisma db:push` was used.
- [ ] No secret, password, token, or unredacted PII is included in code, logs, or evidence.

## Reviewer verdict template

```text
CROSS-REVIEW: PASS | PASS WITH CONDITIONS | REQUEST CHANGES
Reviewer team: Dev-N <module>
Author team: Dev-N <module>
Review role: PRIMARY | DOMAIN-CONSULT | BACKUP
Exact head: <40-char SHA>
Scope checked: contract, security, data integrity, performance, consumer compatibility
Blocking findings: none | <findings>
Evidence: <test command/result or file links>
Re-review required: yes | no
```

## Governance note

Cross-review is a peer technical review and is not release approval. Audit remains the technical gate for shared/high-risk changes, and Release Owner decides environment, risk, staging, canary, and production release.

Reference: [`MODULAR-CROSS-REVIEW-OPERATING-PROCEDURE-TH.md`](../docs/MODULAR-CROSS-REVIEW-OPERATING-PROCEDURE-TH.md)
