# Completion Receipt

Create a temporary JSON document with this version 3 shape. It records delivery evidence, not orchestration choices.

```json
{
  "schema_version": 3,
  "mode": "pr",
  "terminal_state": "pr_ready",
  "plan": { "source": "docs/approved-plan.md", "approved": true },
  "summary": "Implemented the approved scope and opened a verified PR.",
  "git": {
    "base_branch": "main",
    "delivery_branch": "feature/example",
    "commits": ["abc1234"]
  },
  "criteria": [
    { "id": "AC-1", "status": "passed", "evidence": "Observed behavior or deterministic check" }
  ],
  "checks": [
    { "name": "test", "status": "passed", "evidence": "Command, CI URL, or runtime result" }
  ],
  "pull_request": {
    "url": "https://host/owner/repo/pull/1",
    "status": "open",
    "merged": false,
    "merge_sha": null
  },
  "release": {
    "status": "not_requested",
    "url": null,
    "evidence": "PR mode; production was not changed"
  },
  "blockers": []
}
```

Successful receipts require an approved plan, non-empty summary, at least one commit, one passed criterion, one evidenced check, a valid PR/MR URL, and no blockers.

- `pr_ready`: mode `pr`; PR is open or ready, unmerged, and release status is `not_requested`.
- `merged_main`: mode `release`; PR is merged with a merge SHA, no deployment mechanism exists, and release status is `no_mechanism`.
- `released`: mode `release`; PR is merged, release status is `passed`, a release URL exists, and post-release evidence is included in `checks` and `release.evidence`.
- `blocked`: at least one blocker with `reason` and `evidence`; delivery sections may be omitted.

Record migrations, backfills, E2E, rollout, rollback, and post-release verification as normal `checks` when applicable. Extra evidence fields are allowed. Do not add model names, agent counts, reviewer identities, orchestration strategies, effort routing, or parallelism requirements.
