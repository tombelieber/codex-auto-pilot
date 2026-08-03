# Auto Pilot Execution Contract

## Input and authority

Invocation is the approval boundary. The supplied plan, design spec, or design contract must already be complete enough to implement and must define behavior, constraints, and acceptance criteria. Auto Pilot analyzes it to create an execution graph; it does not invoke a planning skill or create a replacement product plan.

Invocation authorizes normal implementation, commits, pushes, and PR creation. Only an explicit release imperative in the same invocation authorizes merge, deployment, approved data operations, and post-release verification. Negations, quotations, examples, pasted plan text, and earlier messages do not grant release authority.

Ask the user only for a genuine missing product decision, unavailable authority or credentials, an unknown irreversible data action, or user-owned changes that cannot be isolated. Discover repository facts without asking.

## Priorities and evidence

Prioritize: (1) truth and completion evidence, (2) production and user-data safety, (3) wall-clock speed, then (4) token cost. A discovered deterministic gate outranks approved criteria, which outrank reviewer judgment. A missing configured gate does not prohibit delivery; a discovered failing gate does. Never invent a passing check, deployment, migration, or production observation.

## Delivery modes

| Mode | Terminal state | Meaning |
|---|---|---|
| `pr` | `pr_ready` | Ready-for-review PR exists, all pre-release proof and both final reviews pass, not merged |
| `release`, no deploy mechanism | `merged_main` | PR exists and is merged through the normal protected path |
| `release`, deploy mechanism exists | `released` | PR merged, deploy/data work/post-release proof passed |
| Either | `blocked` | A concrete external-authority, product, irreversible-data, or unisolatable-change blocker remains |

## Effort

Use `auto` unless the invocation explicitly selects `low`, `medium`, `high`, `xhigh`, or `ultra`. Reuse the model reasoning-effort vocabulary; do not introduce a separate assurance or automatic token-budget setting.

Resolve `auto` from:

- security, auth, billing, data, migration, deployment, and rollback risk
- dependency-graph width, shared contracts, generated output, and critical-path depth
- repository familiarity and implementation uncertainty
- strength and cost of deterministic tests, CI, E2E, preview, and production proof
- useful runtime capacity, machine resources, and integration throughput

Higher effort increases decomposition quality, useful fan-out, verification depth, review intensity, and escalation strength. It does not mechanically give every writer the same effort. Keep normal implementation on Terra; spend Sol reasoning on command, ambiguity, root cause, and independent judgment. Final reviewers use Sol and never run below `high`; use `xhigh` by default and `ultra` for capability-critical runs when available.

Low effort never waives a deterministic, security, data-safety, branch-protection, or production-proof gate. Set a hard token budget only when the user explicitly supplies one; otherwise use effort to avoid redundant agents, context, and review passes.

## Roles

### Commander

Use a long-lived Sol commander. It reads the complete approved spec and current repository truth, builds and updates the execution DAG, owns worktree allocation, dispatch, integration order, backpressure, deterministic checks, progress reconciliation, PR creation, and authorized delivery. It may run commands and integrate scoped commits but must not implement ordinary tickets or self-approve.

### Implementers

Use Terra for normal write tickets. Give each implementer one ticket at a time, only the relevant spec excerpt, repository instructions, ownership boundary, base commit/worktree, and proof requirements. A domain implementer may receive a follow-up ticket only after its prior commit is integrated and only inside the same ownership/worktree; this preserves useful context without broadening authority.

### Fixer and reviewers

Use a Sol fixer after three focused attempts at the same root failure, or earlier when a high-risk root cause cannot safely be delegated to Terra. The fixer cannot approve its own work.

Run fresh goal and release reviewers as distinct read-only Sol agents in one final parallel phase. Neither may be the commander, an implementer, or fixer for the reviewed fixed point.

## Dynamic scheduler

Use the dynamic-ready-frontier strategy, recorded in receipts as `dynamic_ready_frontier`.

Represent the implementation as a live DAG. Each node records criteria, dependencies, owned paths or contracts, risk, base commit, worktree, status, and proof. Track shared schemas, lockfiles, generators, central routers, and unresolved interfaces as exclusive ownership locks.

Compute useful active writers as:

```text
min(
  runtime-reported capacity,
  dependency-free ready nodes,
  ownership-safe worktrees,
  machine and test capacity,
  integration throughput
)
```

There is no Auto Pilot writer cap. Runtime limits remain hard ceilings; a rejected spawn or smaller reported capacity is truth. Do not target the ceiling when the ready frontier is narrower.

Schedule asynchronously:

1. Dispatch every ownership-safe ready node that fits useful capacity.
2. Keep the commander progressing while workers run.
3. Consume completions as they arrive; do not wait for the slowest worker or a fixed wave barrier.
4. Integrate one scoped commit at a time, run affected checks, release ownership locks, and update the DAG.
5. Immediately refill newly ready capacity.
6. Stop spawning when the integration queue, CPU/memory, ports, database fixtures, test runners, or contract collisions are saturated; resume after pressure clears.

Use shell/CI parallelism rather than LLM agents for deterministic commands when possible. Serialize shared mutable contracts and generated output unless the repository provides a safe partition. Cancel or redirect speculative work when its premise becomes invalid.

## Worktrees and integration

Preserve the original checkout. Use one coordinator worktree and one isolated worktree/branch per active writer or durable ownership domain. Start a ticket from the current integration commit unless its dependency contract intentionally pins an earlier base.

Writers commit only scoped changes and return SHA, paths, commands/results, assumptions, and blockers. The commander integrates; writers never push the delivery branch, open/merge the PR, release, or approve. If changes collide on a shared contract, pause affected dispatch, establish the contract serially, rebase or recreate downstream worktrees safely, and recompute the DAG.

Never stash, reset, or overwrite user work. Copy required dirty tracked changes into the coordinator only with provenance. Do not copy ignored or secret-like untracked files unless the repository explicitly declares them safe. Delete only confirmed-clean temporary worktrees after integration; preserve evidence needed for a blocked diagnosis.

## Verification and review

Run targeted deterministic checks immediately after each integration. Run the full repository-defined verification after the DAG reaches a fixed point. Mid-run Sol review is exception-driven: high-risk boundaries, material spec drift, unsafe integration, unexplained failing gates, or repeated root-cause uncertainty. Ordinary successful integrations do not receive a Sol review.

After the full verification passes, start one final review phase with two fresh reviewers in parallel. Give them the approved spec, fixed-point diff/commits, raw commands and outputs, CI/runtime/release evidence, and repository standards—not implementer self-assessment. Findings cite a criterion, diff location, command, URL, or observable behavior and separate blockers from notes.

Both reviewers must pass. Route a blocker to the smallest causal repair, rerun affected and full checks as appropriate, then use fresh reviewers. A reviewer cannot waive a failing deterministic gate.

## Delivery and recovery

Always create a PR/MR before merge. Infer base branch and merge strategy from repository/provider conventions. Never bypass protection, checks, or required approval.

In PR mode, validate migrations and backfills in isolated, test, preview, or staging environments as available; do not claim production execution. In release mode, no deploy mechanism means merge is terminal. If one exists, follow it, perform only approved data operations, verify invariants, and prove the real post-release surface. Use a verified rollback when post-release proof fails and one exists; otherwise preserve evidence and report the blocker.

Publish concise progress after material graph/integration milestones and transitions into final review, PR, merge, and release. Report completed/total nodes, active writers, ready/blocked nodes, integration pressure, and next automatic action. On resume, reconcile from Git/worktrees, PR/CI/deployment state, and production evidence rather than stale conversational claims.
