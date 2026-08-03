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
  "release": { "deploy_mechanism": "none_detected", "status": "not_applicable", "url": null, "migrations": "none", "backfills": "none", "post_release_checks": "not_applicable" },
  "blockers": []
}
```

Successful receipts require an approved non-empty plan source, at least one passed criterion with evidence, only passed or not-applicable discovered checks with evidence, both final reviews passed with evidence, and no blockers. `pr_ready` requires an open/unmerged PR. `merged_main` requires a merged PR and merge SHA with `deploy_mechanism: none_detected`. `released` requires merged PR, passed release, migrations/backfills `passed` or `none`, and passed post-release checks. `blocked` requires at least one blocker with reason and evidence.

Render a compact summary: terminal state; PR/MR URL/status; plan; criteria passed/total; checks passed/discovered; both review statuses; release status/URL; and exact blockers.
