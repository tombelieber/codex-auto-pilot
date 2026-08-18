---
name: auto-pilot
description: "Deliver one approved software goal through a production-ready PR and, when explicitly requested, automatically continue in one fresh production-release task. Invoke explicitly with $auto-pilot at the start of the prompt. Use pr for PR-only delivery, ship or a clear current release imperative for automatic PR-to-release continuation, and release for an existing PR. Keep one Sol controller, at most one Terra implementation task, one compact handoff, deterministic harnesses, and no prep, status, reviewer, or repair agent stages."
---

# Auto Pilot

Deliver one approved artifact through two deliberately separate stages and the fewest useful contexts:

```text
$auto-pilot pr /path/to/approved-plan.md
$auto-pilot ship /path/to/approved-plan.md
$auto-pilot release <PR URL or number>
```

Put the command at the start of the prompt so private run history records only real executions. `pr` ends at a production-ready PR. `ship` completes that PR, then creates exactly one fresh release task automatically. `release` starts directly from an existing candidate. Never merge or mutate production inside the PR controller.

Read [receipt schema](references/receipt-schema.md) before declaring a terminal result. In the PR stage, read [delegated implementation](references/delegated-implementation.md) completely before starting an independent implementation task. For `ship`, read [automatic promotion](references/automatic-promotion.md) before dispatching the continuation. In the release stage, read [release promotion](references/release-promotion.md) completely before any merge or external mutation.

## Select the stage

1. Default to `pr` when no subcommand or current production-delivery imperative is supplied: resolve the approved artifact, implement it, verify it, and stop at an open unmerged PR.
2. Select `ship` when the current invocation explicitly uses `ship`, `--then-release`, or directly and unambiguously orders implementation followed by merge/deploy/release/go-live. Do not infer it from a future wish, question, hypothetical, quoted example, prior chat, “do all,” or negated release request.
3. Select `release` only when the current invocation explicitly uses `release` or `promote` and identifies an existing PR/candidate.
4. Treat `ship` as authority to create and run one fresh release task after `pr_ready`, not authority for the PR controller to mutate production. The generated task begins with an explicit `$auto-pilot release <PR>` command and rebinds live candidate state.

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
4. Stop PR work at `pr_ready`. Do not merge, deploy, migrate, rotate secrets, or mutate production in this session.
5. For `ship`, dispatch or reuse exactly one fresh release task for the exact PR head by following [automatic promotion](references/automatic-promotion.md). End this session after the task is created; do not wait in a second controller loop.

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

For an automatic continuation, record the created/reused release task and exact candidate head as normal evidenced checks in the `pr_ready` receipt. If the runtime cannot create a new task, return the exact `$auto-pilot release <PR>` fallback command without performing release work in the PR session.
