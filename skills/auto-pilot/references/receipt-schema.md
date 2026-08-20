# Completion Receipt

Create a temporary JSON document with this version 5 shape. It records delivery and authority evidence, not model or orchestration choices.

```json
{
  "schema_version": 5,
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
- `released`: mode `release`; PR is merged, release is `passed`, a release URL exists, and exact capability reachability is proven for the deployed merge commit.
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

A `released` receipt must also add at least one impact-selected reachability
case. Do not add this object to `pr_ready` or `merged_main` receipts:

```json
"capability_reachability": {
  "deployed_candidate_sha": "cccccccccccccccccccccccccccccccccccccccc",
  "scope_evidence": "The repository release plan selected the changed comment reply capability only.",
  "cases": [
    {
      "id": "comment-reply",
      "actor": "authenticated external caller",
      "credential_class": "personal access token",
      "resource_scope": "runtime-supplied canary workspace and connected account",
      "entrypoint": "public reply apply endpoint",
      "runtime_principal": "production edge runtime database role",
      "representative_data_case": "legacy missing author identity plus a valid reply target",
      "expected_terminal_outcome": "provider reply identifier observed",
      "deterministic": {
        "status": "passed",
        "evidence": "Exact local API-to-worker-to-fake-provider E2E artifact"
      },
      "production": {
        "status": "passed",
        "evidence": "One bounded canary through the deployed public API reached the terminal provider outcome"
      },
      "authorization_changed": true,
      "authorized": {
        "status": "passed",
        "decision": "allowed",
        "effective_binding_count": 1,
        "evidence": "Authorized runtime credential reached the scoped capability"
      },
      "unauthorized": {
        "status": "passed",
        "decision": "denied",
        "effective_binding_count": 0,
        "evidence": "Out-of-scope credential was denied at the same boundary"
      }
    }
  ]
}
```

Each case binds the observable capability to its real actor, credential,
resource scope, entry point, runtime principal, representative data, and
terminal result. Both deterministic and production proof must pass. When
`authorization_changed` is true, authorized and unauthorized proofs are also
mandatory. The authorized case needs at least one effective scope binding; the
denied case needs zero effective bindings for that exact scope. The deployed
SHA must be the full merged commit recorded by the PR.

Repository impact selection decides which cases are affected. Production
canaries run only during an explicitly authorized release candidate, never on
every edit or commit. Use runtime-supplied dedicated canary resources through
the normal production integration; do not hard-code account IDs or require a
duplicate provider app merely for test isolation.

Record migrations, backfills, E2E, rollout, rollback, and post-release verification as normal `checks` when applicable. Extra evidence fields are allowed. Do not add model names, agent counts, reviewer identities, effort routing, or parallelism requirements.

## Hand the receipt to local history

After `validate_receipt.py` succeeds, keep the temporary file in place through the final response and append one hidden marker using its absolute path:

```text
<!-- auto-pilot-receipt: /absolute/path/to/receipt.json -->
```

The passive local hook runs the same full validator, verifies the invocation mode, copies the receipt into the private run archive, and hashes the source path without storing that path. Missing or invalid receipt evidence remains `unknown`; final-message keywords never create a successful history record.
