# Completion Receipt

Create a temporary JSON document with this version 2 shape. Extra evidence fields are allowed.

```json
{
  "schema_version": 2,
  "mode": "pr",
  "terminal_state": "pr_ready",
  "plan": { "source": "docs/approved-spec.md", "approved": true },
  "effort": {
    "requested": "auto",
    "resolved": "xhigh",
    "rationale": "Wide independent frontier with release-sensitive changes"
  },
  "orchestration": {
    "strategy": "dynamic_ready_frontier",
    "commander": {
      "id": "commander-1",
      "model": "gpt-5.6-sol",
      "reasoning_effort": "xhigh"
    },
    "implementer_model": "gpt-5.6-terra",
    "tickets_total": 8,
    "tickets_completed": 8,
    "peak_active_writers": 6,
    "capacity_evidence": "Runtime accepted six concurrent ownership-safe writers",
    "integration_evidence": "Eight scoped commits integrated with targeted checks"
  },
  "git": { "base_branch": "main", "delivery_branch": "auto-pilot/example", "commits": ["abc1234"] },
  "criteria": [{ "id": "AC-1", "status": "passed", "evidence": "test and runtime evidence" }],
  "checks": [{ "name": "test", "status": "passed", "evidence": "command or CI URL" }],
  "reviews": {
    "goal_spec": { "reviewer": "goal-reviewer-1", "model": "gpt-5.6-sol", "reasoning_effort": "xhigh", "status": "passed", "evidence": "plan-fidelity review result" },
    "engineering_release": { "reviewer": "release-reviewer-1", "model": "gpt-5.6-sol", "reasoning_effort": "xhigh", "status": "passed", "evidence": "engineering/release review result" }
  },
  "pull_request": { "url": "https://host/owner/repo/pull/1", "status": "open", "merged": false, "merge_sha": null },
  "release": { "deploy_mechanism": "GitHub Actions release.yml", "status": "not_applicable", "url": null, "migrations": "validated", "backfills": "none", "post_release_checks": "not_applicable", "deployment_evidence": "Release workflow detected but not invoked in PR mode", "migrations_evidence": "Migration dry-run passed in an isolated test database", "backfills_evidence": "The approved spec contains no backfill", "post_release_evidence": "Post-release checks wait for explicit release authority" },
  "blockers": []
}
```

`effort.requested` accepts `auto`, `low`, `medium`, `high`, `xhigh`, or `ultra`; `effort.resolved` must be a concrete non-auto value. Include a non-empty resolution rationale.

Successful receipts require `dynamic_ready_frontier`, a `gpt-5.6-sol` commander whose reasoning effort matches `effort.resolved`, `gpt-5.6-terra` implementers, at least one completed ticket, equality between total and completed tickets, at least one active writer, capacity/integration evidence, an approved plan, at least one passed criterion and one evidenced check, and no blockers. Both final reviewers must pass on `gpt-5.6-sol` at `high`, `xhigh`, or `ultra`; their identities must be distinct from each other and from the commander. Every delivery commit and merge SHA must be a 7-64 character hexadecimal Git id. PR and release URLs must use HTTP or HTTPS and include a host.

Every release record includes non-empty deployment, migration, backfill, and post-release evidence even when an operation is `none`. Migration/backfill status is `validated` when an operation exists and passed pre-release proof but was not executed, `passed` after authorized execution and verification, and `none` when no operation exists. `pr_ready` requires an open unmerged PR, null merge SHA, and a not-executed release record; it may truthfully name a detected deployment mechanism. `merged_main` requires a merged PR, valid merge SHA, `none_detected`, and a not-executed release record. `released` requires a merged PR, detected deployment mechanism, passed release status, valid release URL, migrations/backfills `passed` or `none`, and passed post-release checks with real evidence.

`blocked` requires at least one blocker with reason and evidence. It still requires the approved plan and resolved effort. Git, orchestration, criteria, checks, reviews, PR, and release sections may be omitted; any included section must be structurally valid. Included criteria, checks, and reviews may report `failed` or `not_run` so the blocker evidence remains truthful.

Render a compact summary: terminal state; PR/MR URL/status; plan; requested/resolved effort; tickets completed/total and peak active writers; criteria/checks; both reviewer identities/statuses; release status/URL; and exact blockers.
