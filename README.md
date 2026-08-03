# codex-auto-pilot

Turn one complete approved Codex implementation plan or design contract into an audited production-ready PR or an explicitly requested release.

```text
$auto-pilot /absolute/path/to/approved-spec.md
```

The invocation itself confirms that the artifact is complete and approved. Auto Pilot does not run an upstream planning skill or redesign the product. A strong Sol commander converts the contract into a live execution DAG, continuously fills useful capacity with low-cost Terra implementers, integrates completed work as it arrives, and sends the fixed point through one parallel independent-review phase.

## Execution model

```text
complete approved spec
  -> Sol dynamic commander
  -> elastic Terra worker pool in isolated worktrees
  -> continuous integration and deterministic checks
  -> one final phase: goal reviewer || release reviewer
  -> production-ready PR or explicit release
```

Auto Pilot defaults to `mode=pr` and `effort=auto`.

```text
$auto-pilot /path/to/spec.md effort=high
$auto-pilot /path/to/spec.md auto ship effort=ultra
```

`effort` reuses the model reasoning vocabulary: `auto`, `low`, `medium`, `high`, `xhigh`, or `ultra`. Auto-detection considers risk, dependency width, shared contracts, uncertainty, proof strength, runtime capacity, and integration cost. It adjusts orchestration depth, useful fan-out, model reasoning, review intensity, and escalation without weakening deterministic or production-safety gates.

## Dynamic parallelism

There is no Auto Pilot writer cap. The commander continuously computes:

```text
useful writers = min(
  runtime capacity,
  dependency-free ready tickets,
  ownership-safe worktrees,
  machine/test capacity,
  integration throughput
)
```

A finished ticket is integrated and checked immediately; newly unblocked work is dispatched without waiting for a fixed wave. Backpressure pauses spawning when shared contracts, integration, CPU/memory, ports, databases, or test runners are saturated. This targets maximum useful throughput, not the largest agent count.

Normal implementation uses Terra. Command, ambiguity, high-risk root-cause repair, and independent final judgment use Sol. Ordinary integrations do not pay for a Sol review; high-risk or failing boundaries can trigger an exception review. The final goal and engineering/release reviewers are fresh, distinct, read-only, and run in parallel. The commander cannot approve itself.

## Install

All versioned examples pin immutable `v0.2.0`.

### Plugin: skill only

```bash
codex plugin marketplace add tombelieber/tomstack
codex plugin add codex-auto-pilot@tomstack
```

Plugin installation provides `$auto-pilot`. Named profiles are optional because the skill can direct-spawn equivalent roles when profiles are unavailable.

### Full install: skill plus five profiles

```bash
npx github:tombelieber/codex-auto-pilot#v0.2.0 install
```

Or:

```bash
curl -fsSL https://raw.githubusercontent.com/tombelieber/codex-auto-pilot/v0.2.0/install.sh | sh
```

Preview or verify:

```bash
npx github:tombelieber/codex-auto-pilot#v0.2.0 install --dry-run
npx github:tombelieber/codex-auto-pilot#v0.2.0 doctor
```

Use `install --force` to replace an existing managed installation; every replaced destination is backed up first. The installer never edits `.codex/config.toml`.

Runtime concurrency remains a hard ceiling, not an Auto Pilot target. To allow up to 20 session threads, configure it separately:

```toml
[agents]
max_concurrent_threads_per_session = 20
```

## Delivery modes

- Default PR mode proves everything available before production and stops at a production-ready PR.
- Release mode requires `release`, `auto ship`, `deploy to prod`, or an equivalent imperative in the same invocation.
- Release mode still creates a PR audit record, uses the normal protected merge path, follows the repository's actual deploy/data mechanisms, and verifies the real post-release surface.
- When no deploy mechanism exists, explicit release mode ends at merged `main`.

Every successful run creates a version 2 receipt recording the requested/resolved effort, commander, dynamic scheduling evidence, completed tickets, peak active writers, distinct reviewers, checks, PR, and release evidence.

## Privacy and safety

- No telemetry is collected.
- No plan, code, repository data, or other user data is uploaded by this project.
- No credentials are included; use the target repository's normal local/GitHub authentication.
- The public GitHub handle `tombelieber` is intentional. Personal email, private filesystem paths, and internal plans are excluded.

`npm run check` scans the working tree and reachable Git history for credential material, private home paths, non-noreply email, environment files, private keys, unsafe symlinks, paths, commit/tag metadata, and hidden tagged objects. It also validates the skill, plugin, receipt contract, installer, and exact package allowlist.

## Limits

- Auto Pilot executes a complete approved contract; it is not a requirements interview or planning workflow.
- Dynamic fan-out cannot exceed runtime capacity and cannot make dependent or overlapping writes safely parallel.
- Plan approval authorizes intent, not stale repository truth; material conflicts still require a real decision.
- Model names and supported reasoning tiers vary by account and runtime.
- Deterministic repository and production evidence outrank model review.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [MIT license](LICENSE).
