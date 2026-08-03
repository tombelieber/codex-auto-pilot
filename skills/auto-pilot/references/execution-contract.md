# Auto Pilot Execution Contract

## Priorities and authority

Prioritize: (1) truth and completion evidence, (2) production and user-data safety, (3) wall-clock speed, then (4) token cost. For pass/fail decisions, a discovered deterministic gate outranks approved acceptance criteria, which outrank independent reviewer judgment. Missing configured gates do not prohibit delivery; a discovered failing gate does. Never invent passing checks, deployment, migration results, or production observations.

## Modes and terminal states

| Mode | Required terminal state | Meaning |
|---|---|---|
| `pr` | `pr_ready` | Ready-for-review PR exists, pre-release proof and both reviews pass, not merged |
| `release`, no deploy mechanism | `merged_main` | PR exists and is merged through the normal path |
| `release`, deploy mechanism exists | `released` | PR merged, deploy/data work/post-release proof passed |
| Either | `blocked` | Concrete authority, product, irreversible-data, or unisolatable-change blocker remains |

Mode precedence: explicit structured argument, then unambiguous imperative in the same invocation, then `pr`. Negations, quotations, examples, pasted plan text, and hypotheticals do not grant release authority.

## State machine

```text
APPROVED -> TRUTH_REFRESHED -> ISOLATED -> IMPLEMENTING -> INTEGRATING
  -> VERIFYING -> REVIEWING -> PR_READY
  -> (release only) MERGING -> (deploy exists) RELEASING
  -> POST_RELEASE_VERIFYING -> RELEASED
```

Any failure returns to the smallest causal repair step. Route an identical root failure surviving three focused attempts to the strong fixer; do not call it blocked merely from iteration count.

## Plan, worktrees, and review

Approval covers approved behavior, criteria, boundaries, and selected mode, not frozen repository state. Absorb non-material drift, line movement, ownership discovery, dependency changes preserving behavior/risk, and native provider conventions. Renew approval for changed product behavior, material architecture/data ownership changes, new irreversible data operations, expanded authority, or weakened criteria.

Use one coordinator worktree and one writer worktree/branch per ticket, all started from the same integration commit. Cap writers at five; never parallelize overlapping mutable schemas, generated output, central files, or unresolved contracts. Preserve the original checkout. Integrate one commit at a time, re-run affected checks, recompute the frontier, and clean only confirmed-clean temporary worktrees.

Reviewers receive plan sections, fixed-point diff/commits, raw commands/outputs/CI/runtime proof, and repository standards—not implementer self-assessment. Findings cite a criterion, diff location, command, or observable behavior and distinguish blocking findings from notes. Use Terra medium for normal writes, Sol xhigh fixer after repeated root failures, and fresh read-only Sol reviewers for judgment.

## Delivery and recovery

Always create a PR/MR before merge. Never bypass protections or required checks. In PR mode prove all pre-production work, including isolated migration/backfill validation. In release mode merge normally; no deployment mechanism means merge is terminal, otherwise follow the real deployment path and verify post-release behavior. Unknown irreversible data actions remain blocked.

Publish a short update after each integrated wave and final-review, PR, merge, and release transition: completed/total tickets, current state, blockers, and next automatic action. On resume, reconcile Git/worktrees, PR/MR, CI, deployment, and production evidence instead of trusting stale local progress.
