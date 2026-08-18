---
name: auto-pilot
description: "Deliver one approved software goal through a production-ready PR or a separately authorized production promotion. Invoke explicitly with $auto-pilot at the start of the prompt. Keep each PR to one active Sol controller and at most one fresh Terra implementation task; never add prep, status, reviewer, or repair agent stages. Use deterministic repository harnesses for mechanical work, one compact Git-backed handoff, one consolidated Sol review, and a fresh Sol release invocation for production promotion."
---

# Auto Pilot

Deliver one approved artifact through two deliberately separate stages and the fewest useful contexts:

```text
$auto-pilot pr /path/to/approved-plan.md
$auto-pilot release <PR URL or number>
```

Put the command at the start of the prompt so private run history records only real executions. The first command ends at a production-ready PR. The second must be a fresh invocation and starts from that existing candidate. Never carry production authority across the boundary.

Read [receipt schema](references/receipt-schema.md) before declaring a terminal result. In the PR stage, read [delegated implementation](references/delegated-implementation.md) completely before starting an independent implementation task. In the release stage, read [release promotion](references/release-promotion.md) completely before any merge or external mutation.

## Select the stage

1. Default to `pr` when no subcommand is supplied: resolve and read the approved artifact, implement it, verify it, and stop at an open unmerged PR.
2. Select `release` only when the current invocation explicitly uses `release` or `promote` and identifies an existing PR/candidate.
3. Never infer release authority from the PR-stage invocation, earlier chat, a receipt, examples, or “do all.” If implementation and release are requested together, finish `pr_ready` and return the exact fresh promotion command.

## Minimize contexts

1. Handle tiny, localized work directly in the active Sol task when a handoff would cost more than the change.
2. For substantive implementation, use exactly one fresh independent Terra task, then return once to the same Sol controller. Prefer Terra `high`; use `ultra` only for genuinely cross-cutting or difficult implementation.
3. Do not create separate planning, inventory, status, log-summary, reviewer, or repair agents. Use repository scripts or bounded programmatic tool calls for mechanical work in the current task.
4. Share truth through the approved artifact, Git SHAs, diff, test artifacts, and the handoff contract—not copied conversation history or hidden reasoning.
5. Use at most one implementer-to-controller handoff. Never bounce review findings between tasks.

## PR stage

1. Refresh only the repository truth needed to choose the direct or one-implementer route. Avoid deeply reading the implementation surface twice.
2. Batch deterministic inventory, status, and verification work. For substantive implementation, follow [delegated implementation](references/delegated-implementation.md).
3. After the single handoff, let the Sol controller inspect the complete diff once, patch all findings directly, run exact-candidate gates, clean task-owned resources, commit, push, and create the final PR/MR.
4. Stop at `pr_ready`. Do not merge, deploy, migrate, rotate secrets, schedule production work, or mutate production.

## Release stage

1. Start from the live existing PR, not a remembered branch. Bind its exact base SHA, head SHA, current checks, reviews, mergeability, and release scope.
2. Reuse unchanged deterministic evidence by hash. Re-run only repository-required candidate and release gates; do not repeat implementation or create another implementer.
3. Keep one Sol controller as release owner. Use repository harnesses for dry-runs and evidence; do not add a lighter-model status or preparation agent.
4. Merge through the normal protected path, then use the repository release owner for approved migrations, backfills, deploys, recovery, rollback decisions, and real post-release verification.
5. If no deployment mechanism exists, stop at `merged_main`; otherwise stop only at `released`. Follow [release promotion](references/release-promotion.md).

## Prove completion

Use repository-defined deterministic evidence first. Do not invent checks, reviews, deployments, migrations, or observations. Create a temporary v4 completion receipt and validate it:

```bash
python3 <skill-dir>/scripts/validate_receipt.py <receipt.json>
```

Keep the validated file until the local history hook copies it. Append this hidden marker to the final answer:

```text
<!-- auto-pilot-receipt: /absolute/path/to/receipt.json -->
```

Report exactly one terminal state: `pr_ready`, `merged_main`, `released`, or `blocked`. Do not commit agent-control artifacts unless the repository explicitly requires them.
