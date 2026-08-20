---
name: auto-pilot
description: "Deliver one approved software goal through a production-ready PR and, when explicitly requested, automatically continue in one fresh production-release task. Invoke explicitly with $auto-pilot at the start of the prompt. Use pr for PR-only delivery, ship or a clear current release imperative for automatic PR-to-release continuation, and release for an existing PR. Keep one controller, one accountable implementation lane, optional bounded helpers, one compact handoff, and deterministic evidence."
---

# Auto Pilot

Deliver one approved artifact through two deliberately separate stages and the fewest useful contexts:

```text
$auto-pilot pr /path/to/approved-plan.md
$auto-pilot ship /path/to/approved-plan.md
$auto-pilot release <PR URL or number>
```

Put the command at the start of the prompt so private run history records only real executions. `pr` ends at a production-ready PR. `ship` completes that PR, then creates one fresh release task automatically unless the exact continuation already exists. `release` starts directly from an existing candidate. Never merge or mutate production inside the PR controller.

Read [receipt schema](references/receipt-schema.md) before declaring a terminal result. In the PR stage, read [delegated implementation](references/delegated-implementation.md) completely before selecting a substantive implementation lane. For `ship`, read [automatic promotion](references/automatic-promotion.md) before dispatching the continuation. In the release stage, read [release promotion](references/release-promotion.md) completely before any merge or external mutation.

## Resolve preferences

Before selecting an execution lane for a real run, read [configuration](references/configuration.md) and resolve the effective settings with its deterministic script. Defaults are `gpt-5.6-terra` with `ultra` thinking for substantive implementation, `gpt-5.6-sol` with `xhigh` thinking for a generated release task, and `auto` for bounded collaboration helpers. Current-invocation flags override the optional user config, which overrides these defaults.

Model and thinking settings are preferences, not evidence or authority. Runtime availability may require a disclosed fallback. Task isolation, the PR/release authority boundary, exact-candidate verification, and production proof are invariants and are not configurable.

State the resolved implementation lane, model/thinking, collaboration policy, and requested release continuation in one concise commentary update before dispatch. Never describe a collaboration subagent as an independent Codex task or silently substitute one execution kind for another.

## Select the stage

1. Default to `pr` when no subcommand or current production-delivery imperative is supplied: resolve the approved artifact, implement it, verify it, and stop at an open unmerged PR.
2. Select `ship` when the current invocation explicitly uses `ship`, `--then-release`, or directly and unambiguously orders implementation followed by merge/deploy/release/go-live. Do not infer it from a future wish, question, hypothetical, quoted example, prior chat, “do all,” or negated release request.
3. Select `release` only when the current invocation explicitly uses `release` or `promote` and identifies an existing PR/candidate.
4. Treat `ship` as authority to create and run one fresh user-visible release task, never a subagent or fork, after `pr_ready`; it is not authority for the PR controller to mutate production. The generated task begins with an explicit `$auto-pilot release <PR>` command and rebinds live candidate state.

## Minimize contexts

1. Handle tiny, localized work directly in the active controller when a handoff would cost more than the change.
2. For substantive implementation, default to one user-visible independent task in an isolated worktree using the resolved implementation model and thinking settings, then return once to the same controller.
3. The active owner may use the minimum useful collaboration subagents for concrete, bounded, independently verifiable work that benefits from parallel execution. They are helpers, not separate planning, status, reviewer, or repair stages, and must not have overlapping write ownership.
4. Share truth through the approved artifact, Git SHAs, diff, test artifacts, and the handoff contract—not copied conversation history or hidden reasoning.
5. Use at most one implementer-to-controller handoff. Never bounce review findings between tasks.

## PR stage

1. Refresh only the repository truth needed to choose the direct or one-implementer route. Avoid deeply reading the implementation surface twice.
2. Batch deterministic inventory, status, and verification work. For substantive implementation, follow [delegated implementation](references/delegated-implementation.md).
3. After the single handoff, let the controller inspect the complete diff once, patch all findings directly, run exact-candidate gates, clean task-owned resources, commit, push, and create the final PR/MR.
4. Stop PR work at `pr_ready`. Do not merge, deploy, migrate, rotate secrets, or mutate production in this session.
5. For `ship`, dispatch one fresh release task or reuse the exact existing task for the exact PR head by following [automatic promotion](references/automatic-promotion.md). End this session after the task is created; do not wait in a second controller loop.

## Release stage

1. Start from the live existing PR, not a remembered branch. Bind its exact base SHA, head SHA, current checks, reviews, mergeability, and release scope.
2. Reuse unchanged deterministic evidence by hash. Re-run only repository-required candidate and release gates; do not repeat implementation or create another implementer.
3. Keep one controller as release owner. A release task generated by `ship` uses the resolved release model and thinking preference. Use repository harnesses for dry-runs and evidence; do not delegate release authority to a subagent or add a preparation/status stage.
4. Merge through the normal protected path, then use the repository release owner for approved migrations, backfills, deploys, recovery, rollback decisions, and real post-release verification.
5. If no deployment mechanism exists, stop at `merged_main`; otherwise stop only at `released`. Follow [release promotion](references/release-promotion.md).

## Prove completion

Use repository-defined deterministic evidence first. Do not invent checks, reviews, deployments, migrations, or observations. A production deployment is not a released capability until the exact affected actor, credential, scope, entry point, runtime principal, representative data case, and terminal outcome are proven against the deployed candidate. Production canaries are impact-selected release evidence, never per-edit or per-commit checks.

Create a temporary v5 completion receipt and validate it:

```bash
python3 <skill-dir>/scripts/validate_receipt.py <receipt.json>
```

Keep the validated file until the local history hook copies it. Append this hidden marker to the final answer:

```text
<!-- auto-pilot-receipt: /absolute/path/to/receipt.json -->
```

Immediately before the receipt marker, append one single-line routing marker so private history can audit declared execution separately from delivery evidence:

```text
<!-- auto-pilot-routing: {"implementation":{"lane":"independent_task","task_ref":"<THREAD OR CLIENT THREAD ID>","worktree":true,"model":"gpt-5.6-terra","thinking":"ultra","reason":null},"continuation":{"lane":"not_requested","task_ref":null,"worktree":null,"model":null,"thinking":null,"reason":null}} -->
```

Use `direct`, `collaboration_subagent`, or `not_applicable` for other implementation lanes. Use `fresh_release_task`, `reused_release_task`, `fallback_command`, `not_requested`, or `current_release_task` for continuation. Include a short `reason` for a direct implementation, configured primary subagent, reused task, runtime fallback, or unavailable task mechanism. When a user-visible task was created, also emit `::created-thread{threadId="<REF>"}` (or `clientThreadId`) and use the same task reference in the routing marker; every such directive must map to one declared lane. A missing or inconsistent routing marker makes orchestration conformance `unknown` or `deviation`; it does not change a valid delivery receipt.

Report exactly one terminal state: `pr_ready`, `merged_main`, `released`, or `blocked`. Do not commit agent-control artifacts unless the repository explicitly requires them.

For an automatic continuation, record the created/reused release task and exact candidate head as normal evidenced checks in the `pr_ready` receipt. If the runtime cannot create a new task, return the exact `$auto-pilot release <PR>` fallback command without performing release work in the PR session.
