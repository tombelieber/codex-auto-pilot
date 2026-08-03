---
name: auto-pilot
description: "Execute one complete, already approved software plan or design contract end to end with a strong dynamic commander, elastic low-cost implementers, independent frontier-model review, and evidence-backed delivery. Invoke explicitly as $auto-pilot. Default to effort=auto and a production-ready PR; release only when the same invocation explicitly asks to release or auto ship."
---

# Auto Pilot

Turn one complete approved implementation plan, design spec, or design contract into one terminal result while the user waits: a production-ready PR by default, or an auto-merged and verified release when explicitly requested.

```text
$auto-pilot /absolute/path/to/approved-spec.md
$auto-pilot /absolute/path/to/approved-spec.md effort=ultra
$auto-pilot /absolute/path/to/approved-spec.md auto ship
```

Explicit invocation asserts that the input is complete and approved and authorizes implementation through the selected delivery mode. Do not invoke an upstream planning skill, repeat discovery questions, or redesign the product. Create only an ephemeral execution graph needed to implement the supplied contract.

Read [execution contract](references/execution-contract.md) before changing Git state or delegating work. Read [receipt schema](references/receipt-schema.md) before declaring a terminal result.

## Resolve the run

1. Resolve the explicit spec path or URL, or the uniquely most recently approved artifact. Read it completely, including linked acceptance criteria and constraints. Ask one short question only when no unique artifact exists or a material product decision is genuinely absent.
2. Select `pr` by default. Select `release` only when this invocation explicitly says `release`, `auto release`, `auto ship`, `deploy to prod`, or an equivalent imperative. Never inherit release authority from an earlier invocation.
3. Select `effort=auto` by default. Accept `low`, `medium`, `high`, `xhigh`, or `ultra` as explicit overrides. Resolve `auto` from change risk, dependency shape, proof strength, uncertainty, runtime capacity, and integration cost; record the rationale in the receipt.
4. Refresh repository truth: nearest `AGENTS.md`, Git state and remotes, default branch, CI, build/test/deploy paths, migrations/backfills, protection rules, and delivery conventions. Absorb ordinary drift; return only for a material behavior, architecture, authority, data-safety, or release-target conflict.
5. Preserve the original checkout. Use an isolated coordinator worktree and isolated writer worktrees; never stash, reset, or overwrite user work.

## Run the dynamic workflow

1. Use a strong Sol commander (`gpt-5.6-sol`) for orchestration. Prefer `auto-pilot-commander` at its xhigh default; direct-spawn Sol with the resolved effort when an override is supported or `ultra` is selected. The commander owns execution decisions and integration, not product redesign or final approval.
2. Normalize the approved spec into a live dependency DAG. Each ticket has acceptance criteria, blocking edges, owned paths/contracts, risk, and deterministic proof. Identify the critical path and the current ready frontier.
3. Fill all useful runtime capacity with low-cost `gpt-5.6-terra` implementers. Do not impose a skill-level writer cap. Compute useful parallelism from runtime capacity, dependency-free tickets, non-overlapping ownership, machine/test resources, and integration throughput. Apply backpressure instead of spawning work that will collide or queue uselessly.
4. Keep scheduling asynchronous and work-conserving. When a writer finishes, integrate its scoped commit, run affected deterministic checks, update the DAG, and immediately refill newly ready capacity without waiting for a fixed wave barrier. Reuse a long-lived domain writer only for follow-up tickets in the same ownership/worktree.
5. Writers implement one ticket at a time and return SHA, paths, raw command results, assumptions, and blockers. They never integrate other branches, push the delivery branch, create or merge a PR, release, or approve their own work.
6. Trigger mid-run strong review only for high-risk changes, material drift, unsafe integration, a failing deterministic gate, or repeated root-cause uncertainty. After three focused failures at the same root cause, use the Sol fixer. Do not spend a Sol review after every ordinary integration.

## Pass one final review phase

After all tickets are integrated and full repository verification passes, run two fresh read-only Sol reviewers in parallel:

- Goal reviewer: plan fidelity, missing or partial criteria, wrong behavior, and scope creep.
- Release reviewer: correctness, security, regressions, test sufficiency, operational wiring, migrations/backfills, rollback, and delivery proof.

The commander cannot fill either reviewer role. Both reviewers must pass, use distinct identities, and cite raw evidence. Route blockers to the smallest causal repair, rerun affected deterministic checks, then repeat the final review phase with fresh reviewers. Deterministic evidence outranks model judgment.

## Deliver and prove

Always create a ready-for-review PR/MR with plan mapping, verification, review, rollout/rollback, and orchestration evidence.

- In `pr` mode, stop at `pr_ready`; never merge or mutate production.
- In `release` mode, complete PR mode first, merge through the normal protected path, use the discovered deployment and data-operation mechanisms, and prove the real post-release surface. If no deploy mechanism exists, `merged_main` is terminal.

Create and validate a temporary version 2 receipt:

```bash
python3 <skill-dir>/scripts/validate_receipt.py <receipt.json>
```

Do not declare success unless validation passes. Report exactly one terminal state: `pr_ready`, `merged_main`, `released`, or `blocked`. Do not commit agent-control artifacts unless the target repository explicitly requires them.
