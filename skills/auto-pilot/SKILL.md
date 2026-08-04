---
name: auto-pilot
description: "Turn one complete, already approved software goal, plan, design spec, or contract into a delivered result. Invoke explicitly as $auto-pilot. Default to a production-ready PR; merge or release only when the same invocation explicitly requests it. Let the active Sol agent choose implementation, tooling, decomposition, subagents, verification, and review from repository truth."
---

# Auto Pilot

Deliver one already approved software artifact end to end. This skill defines the outcome and authority boundary; it does not prescribe an orchestration framework.

```text
$auto-pilot /path/to/approved-plan.md
$auto-pilot /path/to/approved-plan.md release
```

Read [receipt schema](references/receipt-schema.md) before declaring a terminal result.

## Execute

1. Resolve the explicit artifact, or the uniquely most recently approved artifact, and read it completely. Ask only when a material product decision, authority, credential, or irreversible data action is genuinely missing.
2. Default to `pr`. Select `release` only when the same invocation explicitly requests release, auto ship, deployment, or equivalent production delivery. Never inherit release authority from earlier messages, quoted text, examples, or hypotheticals.
3. Refresh repository truth: applicable instructions, Git state, user-owned changes, tests, CI, migrations, backfills, release mechanisms, and protection rules. Preserve unrelated work and absorb non-material drift without reopening the approved plan.
4. Let the active Sol agent choose the simplest reliable execution approach. It may implement directly or use available tools and subagents when they materially help. Do not create role teams, model routing, parallel waves, mandatory reviewers, review loops, ticket graphs, or worktree fleets merely because this skill was invoked.
5. Implement the complete approved scope, fix directly causal defects, verify the real integration in proportion to risk, clean up task-owned resources, commit scoped changes, push the delivery branch, and create a production-ready PR/MR.
6. In `pr` mode, stop at an open, unmerged `pr_ready` result with no production mutation.
7. In `release` mode, merge through the repository's normal protected path. If a release mechanism exists, use it, perform approved migrations/backfills safely, and verify the real post-release surface. If none exists, stop at `merged_main`.

## Prove completion

Use repository-defined deterministic evidence first. Do not invent checks, reviews, deployments, migrations, or observations. A model review is optional unless the repository or approved plan requires one.

Create a temporary completion receipt and validate it:

```bash
python3 <skill-dir>/scripts/validate_receipt.py <receipt.json>
```

Report exactly one terminal state: `pr_ready`, `merged_main`, `released`, or `blocked`. Do not commit agent-control artifacts unless the repository explicitly requires them.
