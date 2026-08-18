# Release promotion

Use this workflow only in a fresh `$auto-pilot release <PR>` or `$auto-pilot promote <PR>` invocation. A prior `pr_ready` receipt is useful evidence, not release authority.

## Release owner and model boundary

- Keep one Sol controller for the whole promotion. Use `high` for a reversible code-only deploy with a deterministic repository harness. Use `xhigh` for database migrations/backfills, authorization, security, billing, shared infrastructure, secrets, or unclear rollback. Reserve `max` for an exceptional manual override supported by measured need.
- Prefer deterministic scripts over any model for CI status, diff inventory, migration dry-runs, scope hashes, deploy plans, and health probes. Batch bounded read-only collection so intermediate logs do not repeatedly enter model context.
- Do not add a lighter-model preparation or status agent. The fresh Sol task should consume one compact live-PR packet and primary repository evidence, not implementation conversation history.
- Do not start an implementation agent during promotion. Patch small directly causal release defects in the controller; return material new scope to a new PR-stage invocation.

## Promote the candidate

1. Resolve the live PR/MR and capture its URL, base branch/SHA, head branch/SHA, checks, reviews, mergeability, and changed production surfaces in one bounded packet.
2. Compare the live head with any `pr_ready` receipt. Reuse evidence only while its candidate hash and relevant environment are unchanged; review and verify only a changed delta.
3. Read the repository release and migration contracts. Produce the exact dry-run plan, compatibility/backfill decision, rollback boundary, required credentials, and pre-mutation live-state proof.
4. Merge through the repository's normal protected path. Re-resolve the exact merge SHA and use a clean checkout at that SHA for release.
5. Run the repository release owner once. Let it perform its own required gate, approved migrations/backfills, deploy, smoke, and domain proof without duplicating the same expensive checks immediately beforehand.
6. Verify real production after release: exact deployed identity, critical preserved state, health/queue/error signals, and at least one safe real-surface or real-data observation when the repository permits it.

## Fail closed

- Before production mutation: fix a small causal defect on the PR branch, bind the new head, and re-run the affected evidence. Block on material new scope or missing authority.
- During a database migration or incomplete deploy: stop and reconcile exact remote state. Never blindly retry, roll forward, or roll back.
- After a completed deploy: use only the repository's bounded resume mechanism for eligible smoke or observation failures.
- Never call a merge, draft release, successful command, or passing local test “released” without current production evidence.

## Terminal result

- `merged_main`: the candidate is merged and the repository has no deployment mechanism.
- `released`: merge, production mutation, and post-release evidence all succeeded.
- `blocked`: record the exact candidate, last safe boundary, remote state, and next authorized action.

The release receipt must use schema v4 and include the `promotion` object described in [receipt schema](receipt-schema.md).
