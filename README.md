# Codex Auto Pilot

Auto Pilot keeps one Codex task accountable until one of two real delivery
goals is achieved:

- `PR_READY` — an open PR is fully ready for production release; the only next
  action is protected merge/deploy/distribution.
- `SHIPPED` — the exact candidate is live and proven in production, with zero
  scoped TODOs, follow-ups, actionable warnings, or closeout leftovers.

The maintained reusable source lives in Tomstack. This repository packages the
Codex-compatible skill, local CLI, passive hooks, validator, and history tools.

## Use it

```text
$auto-pilot pr docs/approved-plan.md
$auto-pilot ship docs/approved-plan.md
```

`release`, `promote`, and `deploy` remain compatibility aliases for `ship`
starting from an existing candidate. They do not create a third goal mode.

`pr` never merges or mutates production. `ship` performs everything required:
implementation, review, tests, PR, exact-candidate admission, protected merge,
release/deployment, production proof, applicable notes, and safe cleanup.

Before implementation, Auto Pilot uses the bundled `batch-grill-me` skill when
the plan leaves any user decision open. It resolves repository facts itself,
asks every currently unblocked decision frontier, writes the confirmed result
back into the plan, and starts only after the user confirms shared understanding.

```text
approved goal
   |
   +-- pr ----> implementation + shared release-readiness gate ----> PR_READY
   |
   +-- ship --> implementation + shared release-readiness gate
                    --> attempt-bound admission --> merge --> deploy
                    --> exact production proof --> notes + cleanup --> SHIPPED

waiting / blocked / incomplete = resumable checkpoint in the same task
```

An open PR, merged commit, deploy start, healthy runtime, or deployment without
exact capability proof is not SHIPPED. A PR without verified release path,
preflight, required inputs, current CI, and zero non-production leftovers is not
PR_READY.

## It does not lock the task

The invoking task remains owner through waits, failures, repairs, retries, and
changed external state. Stop, SessionEnd, compaction, an incomplete receipt, or
a final response does not make later turns read-only and does not require a new
session. An ordinary follow-up such as “CI is green now, continue” resumes the
same active goal.

Admission is immutable only for one exact mutation attempt. If base, head, CI,
contract, input, or external state changes before mutation, the task diagnoses
and safely fixes or waits, then creates a new linked attempt. It never blindly
reuses a stale binding. After mutation, it reconciles actual remote state before
repository-defined bounded recovery.

Normal CI, deploy, and observation waits are monitored in the current task.
Only genuine authority, credential, destructive-data, billing, incompatible
migration, safety, or ambiguous-remote-state decisions pause for user input.
Supplying that input resumes the same task.

## Install

From the current tagged GitHub release:

```bash
npx --yes --allow-git=all github:tombelieber/codex-auto-pilot#v0.14.0 install
```

From this checkout:

```bash
node bin/codex-auto-pilot.mjs install
```

Preview without writing:

```bash
node bin/codex-auto-pilot.mjs install --dry-run
```

Replace an older installed copy safely:

```bash
node bin/codex-auto-pilot.mjs install --force
```

The installer writes the Auto Pilot skill and its thin `batch-grill-me` hard
dependency under the selected agent home. It refuses collisions by default and
creates a backup before `--force` replaces an existing copy.

Verify:

```bash
node bin/codex-auto-pilot.mjs doctor
node bin/codex-auto-pilot.mjs skill-path
```

## Evidence contract

Schema v10 separates goal outcome from attempt status and adds mandatory
production regression compatibility:

```text
goal_mode:       pr | ship
goal.target:     PR_READY | SHIPPED
goal.achieved:   PR_READY | SHIPPED | null
attempt.result:  achieved | incomplete
open_items:      [] for achieved; non-empty for incomplete
```

PR_READY includes one passed `exact-candidate` check and one passed
`production-release-ready` check covering the real path, preflight,
credentials, configuration, migrations, recovery, and exact next action.

Every schema-v10 achieved candidate also requires a passed
`production-regression-compatibility` check. It proves affected existing
production capabilities, supported interfaces/configuration, and representative
valid current, legacy, and edge-shaped data remain operable. New or tightened
release gates must accept that valid baseline. Any false positive or compatibility
gap is repaired and requalified before admission; a working production path is
never disabled or valid data stranded merely to make a gate pass.

When migration applies, PR_READY also requires a structured
`production-data-compatibility` check. Representative data from the currently
supported production version must pass the real upgrade path and remain
operable through the exact candidate's reads, applicable writes, critical
workflows, invariants, and rolling-version or hard-cutover boundary. A migration
marker, schema version, backfill count, row count, or retained record alone does
not qualify.

SHIPPED additionally binds goal/attempt/contract/base/head/PR immediately before
mutation, proves the merged identity and every impacted production capability,
and links any migrated-data check to a real production case using a migrated
legacy record through the new system. It also completes applicable release notes
and cleanup. Production-live with failed cleanup or stranded legacy data is
recorded as incomplete and repaired before success. Schema-v9 receipts from
released v0.13.x contracts remain valid under frozen v9 semantics; v10 does not
retroactively impose its new gate on historical receipts.

Validate a receipt:

```bash
python3 skills/auto-pilot/scripts/validate_receipt.py /absolute/path/to/receipt.json
```

Read the full [receipt schema](skills/auto-pilot/references/receipt-schema.md).

## Execution and configuration

The invoking task may work directly or use bounded terminal helpers. Helpers
cannot spawn, fork, create another owner task, delegate, merge, deploy, migrate,
roll back, or own production. Native compaction is the supported continuation
mechanism.

The owner model and effort inherit the invoking session selected by the user.
Optional configuration can prefer another model for substantive implementation
helpers, but the owner decides whether direct, single-helper, or safe parallel
execution is fastest for the actual plan.

Optional settings live at `~/.codex-auto-pilot/config.json`. Invocation flags
override user config, which overrides defaults. Existing `release.*` settings
mean production-phase preferences for ship; the name is retained for config
compatibility only. Legacy executor value `task` cannot transfer ownership under
the current contract.

See [configuration](skills/auto-pilot/references/configuration.md) and
[owner-directed execution](skills/auto-pilot/references/delegated-implementation.md).

## Private local history

Enable passive local collection explicitly:

```bash
node bin/codex-auto-pilot.mjs install --with-local-history
```

Useful commands:

```bash
node bin/codex-auto-pilot.mjs history status
node bin/codex-auto-pilot.mjs history materialize
node bin/codex-auto-pilot.mjs history list
node bin/codex-auto-pilot.mjs history goals
node bin/codex-auto-pilot.mjs history report
node bin/codex-auto-pilot.mjs history retention 90
```

History schema v6 maintains an active goal per task/session. Ordinary follow-up
turns attach automatically until a validated PR_READY or SHIPPED receipt clears
the goal. Stop/SessionEnd ends only a turn checkpoint. Reports separate achieved
goal outcomes, attempt results, and legacy terminal claims; incomplete or legacy
receipts never enter current achieved benchmarks.

Collection is deterministic, local, network-free, and model-free. It records
thin lifecycle markers and derives metrics post-hoc from existing Codex JSONL.
It does not copy hidden reasoning or upload data. Missing archived validators
fail closed rather than letting a new schema reinterpret old receipts.

See [history schema](skills/auto-pilot/references/history-schema.md).

## Development

```bash
npm test
npm run check
```

`npm run check` validates syntax, tests, public-safety rules, and the packed
artifact. This project is MIT licensed.
