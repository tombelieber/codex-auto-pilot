# Codex Auto Pilot

The reusable skill's canonical source is
[Tomstack](https://github.com/tombelieber/tomstack). This repository maintains
the standalone Codex plugin, installer and legacy compatibility tools.

Thin guidance for two delivery actions with the same quality bar:

- **`pr` → `PR_READY`:** a fully verified, shippable candidate. All release
  prerequisites are complete; only merge and production release actions,
  including their post-release checks, remain. The PR stays unmerged.
- **`ship` → `SHIPPED`:** reach that same readiness, then merge, release,
  verify the exact candidate in production and finish scoped closeout.

```text
$auto-pilot pr <goal, spec, plan, or PR>
$auto-pilot ship <goal, spec, plan, or PR>
```

`release`, `promote` and `deploy` remain aliases for `ship`.

Both modes complete the applicable tests/CI, integration and production
compatibility checks, migration rehearsals, release preflight, required inputs,
rollback/recovery and production proof preparation. A PR that still needs
readiness work is not `PR_READY`; deployment without affected capability proof
is not `SHIPPED`.

The agent finds repository facts itself. When consequential decisions are
missing, it uses the bundled `batch-grill-me` to pin down the goal/spec and
confirm shared understanding before implementation. Confirmed decisions and
valid evidence are reused. Repairs and waits stay in the same accountable task.

## Guidance, not a harness

The active [skill](skills/auto-pilot/SKILL.md) is self-contained. It uses the
repository's existing workflow and ordinary evidence summaries. It requires no
receipt generator, validator, configuration resolver, routing markers, status
files or history hooks. Useful product tests and repository-required release
artifacts still apply.

Auto Pilot is explicit-only. Routine questions, planning and coding do not
activate a release workflow automatically. PR mode changes the final action,
not the verification standard.

## Install

From this checkout:

```bash
node bin/codex-auto-pilot.mjs install --dry-run
node bin/codex-auto-pilot.mjs install
node bin/codex-auto-pilot.mjs doctor
```

The installer copies Auto Pilot and Batch Grill Me to `~/.agents/skills/`.
Existing different content requires `--force`, which backs it up before
replacement. Set `CODEX_AUTO_PILOT_HOME` for an isolated installation. Installing
this checkout is separate from publishing a version or updating Tomstack.

Published versions are distributed through GitHub tags:

```text
npx --yes --allow-git=all github:tombelieber/codex-auto-pilot#<release-tag> install
```

The plugin exposes only `skills/`; it registers no lifecycle hooks. Normal CLI
installs also enable no hooks. Do not replace an installed contract during an
active bound release attempt; finish or reconcile that attempt first.

## Legacy compatibility

[Legacy receipt/history tools](legacy/README.md) remain separate from skill
instructions so existing records stay readable with their original semantics.
The existing `history status|path|materialize|list|goals|report` and `history
retention` commands remain available. Their receipt-based metrics do not prove
completion of the current prose-only workflow.

`install --with-local-history` explicitly installs the legacy runtime and hooks.
An upgrade detects previously opted-in user hooks, preserves their opt-in and
redirects them to `~/.codex-auto-pilot/legacy/auto-pilot/`. It backs up replaced
files and leaves history/active-goal data intact. This compatibility option is
not required or recommended for the guidance workflow. Existing user-wide or
repository instructions may still impose additional release requirements;
installing a skill does not rewrite those instructions.

## Development

Run `npm run check` for package, install/upgrade, legacy compatibility and public
safety checks. The legacy contract snapshot is frozen; new guidance belongs in
`skills/auto-pilot/SKILL.md`. Research under `docs/research/` describes earlier
versions and is not part of the current agent workflow.
