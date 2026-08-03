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

Successful receipts require an approved non-empty plan source, at least one passed criterion and one check with evidence, both final reviews passed with evidence, and no blockers. Every delivery commit and merge SHA must be a 7-64 character hexadecimal Git id. PR and release URLs must be `http` or `https` URLs with a host.

`pr_ready` requires an open/unmerged PR, a null merge SHA, and a fully not-applicable release record (`none_detected`, null URL, `none` migrations/backfills, and not-applicable post-release checks). `merged_main` requires a merged PR and valid merge SHA with that same not-applicable release record. `released` requires a merged PR, valid merge SHA, a non-empty detected deployment mechanism, passed release status, a valid release URL, migrations/backfills `passed` or `none`, and passed post-release checks. `blocked` requires at least one blocker with reason and evidence; it may omit unfinished delivery evidence.

Render a compact summary: terminal state; PR/MR URL/status; plan; criteria passed/total; checks passed/discovered; both review statuses; release status/URL; and exact blockers.
