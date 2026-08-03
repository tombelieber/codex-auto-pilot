# Completion Receipt

Create this temporary JSON document. Extra evidence fields are allowed.

```json
{
  "schema_version": 1,
  "mode": "pr",
  "terminal_state": "pr_ready",
  "plan": { "source": "docs/plans/example.md", "approved": true },
  "git": { "base_branch": "main", "delivery_branch": "auto-pilot/example", "commits": ["abc1234"] },
  "criteria": [{ "id": "AC-1", "status": "passed", "evidence": "test and runtime evidence" }],
  "checks": [{ "name": "test", "status": "passed", "evidence": "command or CI URL" }],
  "reviews": {
    "goal_spec": { "status": "passed", "evidence": "review agent result" },
    "engineering_release": { "status": "passed", "evidence": "review agent result" }
  },
  "pull_request": { "url": "https://host/owner/repo/pull/1", "status": "open", "merged": false, "merge_sha": null },
  "release": { "deploy_mechanism": "none_detected", "status": "not_applicable", "url": null, "migrations": "none", "backfills": "none", "post_release_checks": "not_applicable", "deployment_evidence": "Repository inspection found no deploy mechanism", "migrations_evidence": "No migrations apply because no deployment exists", "backfills_evidence": "No backfills apply because no deployment exists", "post_release_evidence": "No post-release check applies because no deployment exists" },
  "blockers": []
}
```

Successful receipts require an approved non-empty plan source, at least one passed criterion and one check with evidence, both final reviews passed with evidence, and no blockers. Every delivery commit and merge SHA must be a 7-64 character hexadecimal Git id. PR and release URLs must be `http` or `https` URLs with a host.

Every release record must include non-empty `deployment_evidence`, `migrations_evidence`, `backfills_evidence`, and `post_release_evidence`. Evidence is required even when an operation is `none`: explain why it is not applicable. `pr_ready` requires an open/unmerged PR, a null merge SHA, and a fully not-applicable release record (`none_detected`, null URL, `none` migrations/backfills, and not-applicable post-release checks). `merged_main` requires a merged PR and valid merge SHA with that same not-applicable release record; its deployment evidence must state that repository inspection found no deploy mechanism. `released` requires a merged PR, valid merge SHA, a non-empty detected deployment mechanism, passed release status, a valid release URL, migrations/backfills `passed` or `none`, and passed post-release checks with real post-release evidence. `blocked` requires at least one blocker with reason and evidence. It may omit Git, criteria, checks, reviews, PR, and release sections entirely; if it includes any of them, that section must be structurally valid.

Render a compact summary: terminal state; PR/MR URL/status; plan; criteria passed/total; checks passed/discovered; both review statuses; release status/URL; and exact blockers.
