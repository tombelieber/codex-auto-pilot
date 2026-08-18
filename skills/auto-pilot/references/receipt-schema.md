# Completion Receipt

Create a temporary JSON document with this version 4 shape. It records delivery and authority evidence, not model or orchestration choices.

```json
{
  "schema_version": 4,
  "mode": "pr",
  "terminal_state": "pr_ready",
  "plan": { "source": "docs/approved-plan.md", "approved": true },
  "summary": "Implemented the approved scope and opened a verified PR.",
  "git": {
    "base_branch": "main",
    "delivery_branch": "feature/example",
    "commits": ["0123456789abcdef0123456789abcdef01234567"]
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
    "evidence": "PR stage; production was not changed"
  },
  "blockers": []
}
```

Successful receipts require an approved plan, non-empty summary, at least one commit, one passed criterion, one evidenced check, a valid PR/MR URL, and no blockers.

- `pr_ready`: mode `pr`; PR is open or ready, unmerged, release is `not_requested`, and `promotion` is absent.
- `merged_main`: mode `release`; PR is merged with a merge SHA, no deployment mechanism exists, and release is `no_mechanism`.
- `released`: mode `release`; PR is merged, release is `passed`, a release URL exists, and post-release evidence is included in `checks` and `release.evidence`.
- `blocked`: at least one blocker with `reason` and `evidence`; delivery sections may be omitted.

A successful release-mode receipt must add this object:

```json
"promotion": {
  "source": "live_pr",
  "source_receipt": null,
  "candidate_base_sha": "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "candidate_head_sha": "0123456789abcdef0123456789abcdef01234567",
  "authority_evidence": "Explicit current invocation: $auto-pilot release PR #1"
}
```

`source` is `live_pr` or `pr_ready_receipt`. For `pr_ready_receipt`, set `source_receipt` to the receipt path or immutable receipt identity; otherwise it must be null. `candidate_head_sha` must be the full live pre-merge PR head and must appear in `git.commits`. A receipt is evidence only: `authority_evidence` must identify the fresh current promotion invocation.

Record migrations, backfills, E2E, rollout, rollback, and post-release verification as normal `checks` when applicable. Extra evidence fields are allowed. Do not add model names, agent counts, reviewer identities, effort routing, or parallelism requirements.

## Hand the receipt to local history

After `validate_receipt.py` succeeds, keep the temporary file in place through the final response and append one hidden marker using its absolute path:

```text
<!-- auto-pilot-receipt: /absolute/path/to/receipt.json -->
```

The passive local hook verifies the receipt mode and terminal state, copies it into the private run archive, and hashes the source path without storing that path. Missing or invalid receipt evidence remains `unknown`; final-message keywords never create a successful history record.
