---
name: auto-pilot
description: "Execute an already approved software plan or design spec end to end with isolated parallel implementers, independent frontier-model review, and evidence-backed delivery. Invoke explicitly as $auto-pilot. Default to a production-ready PR; use release mode only when the same invocation explicitly asks to release or auto ship."
---

# Auto Pilot

Turn one approved plan into one terminal result while the user waits: a production-ready PR by default, or an auto-merged and verified release when explicitly requested.

Invoke only after approval:

```text
$auto-pilot /absolute/path/to/approved-plan.md
$auto-pilot /absolute/path/to/approved-plan.md auto ship
```

The first form selects `pr`; the second selects `release`. This skill never starts implicitly.

Read [execution contract](references/execution-contract.md) before changing Git state or delegating work. Read [receipt schema](references/receipt-schema.md) before declaring a terminal result.

## Resolve and isolate

1. Resolve an explicit plan path or URL, or the uniquely most recently approved plan. Read its complete source and linked acceptance criteria. If none is unique, ask one short question and do not implement.
2. Select `pr` by default. Select `release` only when this invocation explicitly says `release`, `auto release`, `auto ship`, `deploy to prod`, or an equivalent imperative. Do not take release authority from a previous invocation; ask when signals conflict.
3. Refresh repository truth: nearest `AGENTS.md`, Git state/remotes/default branch, CI, build/test and deployment configuration, migrations/backfills, branch protection, and delivery conventions. Re-approve only material changes to behavior, architecture, authority, risk, or release target.
4. Preserve the original checkout. Use an isolated coordinator worktree and one isolated worktree/branch per writer; never stash, reset, or overwrite user work. Infer the base branch and merge strategy, sync safely, and respect protection.

## Build, integrate, and review

1. Normalize the approved plan into independent vertical tickets with acceptance criteria, blocking edges, owned paths, risk, and proof. Work only the ready frontier; run at most five writers when ownership does not overlap.
2. Use the installed named profiles when available: `auto-pilot-implementer`, `auto-pilot-fixer`, `auto-pilot-goal-reviewer`, and `auto-pilot-release-reviewer`. Their TOML templates are bundled under [templates](../../templates/agents/), but plugin installation alone does not activate them.
3. Without named profiles, spawn equivalent roles directly: normal writers use `gpt-5.6-terra` at `medium`, `workspace-write`; the fixer and both reviewers use `gpt-5.6-sol` at `xhigh`; fixer is `workspace-write`, reviewers are `read-only`. Use the matching template instructions as the role prompt.
4. Writers commit only scoped changes and return SHA, paths, command results, assumptions, and blockers. The coordinator integrates one commit at a time, runs affected deterministic checks, then recomputes the frontier. Writers never integrate, push the delivery branch, create or merge a PR, or release.
5. Send every integrated wave to a fresh goal reviewer; review high-risk tickets individually. Route findings to fresh writers. After three focused attempts at the same root failure, use the stronger fixer. No agent approves its own work.

## Final gates and delivery

After full repository verification passes, run independent, read-only final reviews in parallel:

- Goal reviewer: plan fidelity, missing or partial criteria, wrong behavior, and scope creep.
- Release reviewer: correctness, security, regressions, test sufficiency, migrations/backfills, rollback, and delivery proof.

Both must pass. Deterministic evidence outranks judgment; reviewers cannot waive a failing discovered gate. Always create a ready-for-review PR/MR with plan mapping, verification, review, and rollout/rollback evidence.

- In `pr` mode, stop only at `pr_ready`; never merge or mutate production.
- In `release` mode, complete PR mode first, then use the normal protected merge path. If deployment exists, deploy through it, perform approved data operations safely, and prove the real post-release surface. If no deployment exists, `merged_main` is terminal.

Create a temporary JSON receipt matching [receipt schema](references/receipt-schema.md), then validate it before declaring success:

```bash
python3 skills/auto-pilot/scripts/validate_receipt.py <receipt.json>
```

Do not commit agent-control artifacts unless the repository explicitly requires them. Report exactly one terminal state: `pr_ready`, `merged_main`, `released`, or `blocked`, with the compact human-readable receipt.
