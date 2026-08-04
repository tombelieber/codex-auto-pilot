# codex-auto-pilot

Turn one approved software goal, plan, or design spec into a delivered pull request or release with Codex.

```text
$auto-pilot docs/approved-plan.md
```

Auto Pilot is deliberately small. It gives the active Sol agent an outcome and authority contract, then lets the model choose the simplest reliable way to implement, verify, and deliver the work from current repository truth.

## What it does

1. Treats a complete, approved artifact as the implementation input.
2. Refreshes repository truth and preserves unrelated user work.
3. Implements and verifies the complete scope using the repository's own conventions.
4. Commits, pushes, and opens a production-ready PR by default.
5. Merges and releases only when the same invocation explicitly authorizes it.

It does **not** prescribe agent teams, model routing, parallel waves, ticket graphs, mandatory reviewers, review loops, or worktree fleets. Codex may still use tools or subagents when they materially help; that is an execution decision, not a skill requirement.

## Install

### Codex plugin

```bash
codex plugin marketplace add tombelieber/tomstack
codex plugin add codex-auto-pilot@tomstack
```

### CLI installer

```bash
npx github:tombelieber/codex-auto-pilot install
```

Or:

```bash
curl -fsSL https://raw.githubusercontent.com/tombelieber/codex-auto-pilot/main/install.sh | sh
```

Preview or verify an installation:

```bash
npx github:tombelieber/codex-auto-pilot install --dry-run
npx github:tombelieber/codex-auto-pilot doctor
```

Use `install --force` only to replace an existing Auto Pilot skill; the installer backs up replaced content first. The default installer copies only the skill. It does not install custom agent profiles, change Codex concurrency, or edit `.codex/config.toml`.

To enable automatic local run history for a standalone skill installation:

```bash
npx github:tombelieber/codex-auto-pilot install --with-local-history
```

This adds four passive user-level Codex lifecycle hooks without changing model context. Existing hook definitions are preserved and backed up before modification. Review and trust newly installed hooks once with `/hooks`.

## Delivery modes

PR mode is the default:

```text
$auto-pilot docs/approved-plan.md
```

It stops with an open, unmerged, production-ready PR and no production mutation.

Release mode requires an explicit imperative in the same invocation:

```text
$auto-pilot docs/approved-plan.md release
```

It completes PR delivery, merges through the repository's normal protected path, uses the discovered release mechanism, handles approved migrations or backfills, and verifies the post-release surface. If the repository has no release mechanism, it stops after merging.

Auto Pilot reports one terminal state: `pr_ready`, `merged_main`, `released`, or `blocked`. Its small completion receipt records plan, Git, criteria, checks, PR/release evidence, and blockers without recording or constraining orchestration choices.

## Local run history

The plugin bundles an optional, local-only collector. After its hooks are trusted, every explicit `$auto-pilot` invocation is captured automatically:

1. `UserPromptSubmit` records the invocation and baseline token totals.
2. `SubagentStop` archives each subagent transcript when one exists.
3. `Stop` archives the root transcript and computes deterministic run metrics.
4. `SessionEnd` recovers a run that ended without a normal turn stop.

Collection uses local Node.js scripts and returns empty hook context. It does not call a model, add orchestration, or upload data. Raw transcripts default to 90-day retention while manifests and aggregate metrics remain available.

```bash
codex-auto-pilot history status
codex-auto-pilot history list --since 30d
codex-auto-pilot history report --since 30d
codex-auto-pilot history retention 30
codex-auto-pilot history retention forever
```

The archive lives at `~/.codex-auto-pilot/history` by default. Override it with `CODEX_AUTO_PILOT_DATA`. See the [history schema](skills/auto-pilot/references/history-schema.md) and the [OSS observability research](https://github.com/tombelieber/codex-auto-pilot/blob/main/docs/research/oss-agent-eval-observability.md).

## Privacy and safety

- No remote telemetry is collected.
- Local run history is enabled only by trusting the plugin hooks or using `install --with-local-history`.
- Full transcripts may contain prompts, source code, tool output, credentials, personal data, and private paths. The archive is private local data and must never be committed or uploaded without review and redaction.
- No plan, code, or repository data is uploaded by this project.
- No credentials are bundled; normal local and repository authentication applies.
- The public GitHub handle `tombelieber` is intentionally present.

`npm run check` scans the distributable tree and Git history for common credentials, private home paths, non-noreply email addresses, environment files, private keys, and symlinks.

## Limits

- The supplied artifact must already contain the product decisions and acceptance criteria needed for implementation.
- Repository instructions, deterministic checks, branch protection, and production safety still apply.
- Auto Pilot does not invent a deployment, migration, backfill, or rollback mechanism when the repository has none.
- Model and tool availability depend on the active Codex runtime.
- Codex transcript JSONL is not a stable public schema. The collector preserves the original file and versions its derived metrics so future parsers can reprocess the evidence.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © tombelieber
