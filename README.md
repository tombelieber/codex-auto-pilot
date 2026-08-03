# codex-auto-pilot

Turn an approved Codex plan or design spec into audited Git pull requests.

`codex-auto-pilot` is for **Codex**. Give it an approved, concrete plan, then explicitly invoke `$auto-pilot`. It creates isolated worktrees, keeps an audit record in the PR, and defaults to delivery through a pull request.

```text
$auto-pilot implement the approved plan in docs/approved-plan.md
```

## What it does

1. Treats your approved plan/design spec as the input—not a vague feature request.
2. Uses up to five concurrent writers in isolated worktrees. The default implementer tier is Terra at medium reasoning for cost-effective execution.
3. Asks independent Sol reviewers at xhigh reasoning to review the resulting changes.
4. Opens a PR by default, including the work and audit trail. Nothing is automatically released or shipped by this default mode.

Use an explicit release/auto-ship instruction only when you want an approved PR merged and the repository's release mechanism invoked. Auto-merge means GitHub merges the passing PR; auto-release means the repository's configured release workflow is triggered after that merge. It does not invent a deploy mechanism.

## Install

Choose one installation level. All examples pin the immutable `v0.1.0` release.

### Plugin install: skill only

Install the plugin when Codex only needs the `$auto-pilot` skill. This does **not** add the four custom agent profiles. The skill uses its direct-spawn fallback when those profiles are absent.

```bash
codex plugin marketplace add tombelieber/tomstack
codex plugin add codex-auto-pilot@tomstack
```

The `tomstack` marketplace entry pins the plugin to the `v0.1.0` Git ref.

### Full CLI install: skill plus four agent profiles

Use the CLI installer when you also want the four custom agent profiles installed locally.

```bash
npx github:tombelieber/codex-auto-pilot#v0.1.0 install
```

Or use the pinned installer:

```bash
curl -fsSL https://raw.githubusercontent.com/tombelieber/codex-auto-pilot/v0.1.0/install.sh | sh
```

Preview an install before it changes anything:

```bash
npx github:tombelieber/codex-auto-pilot#v0.1.0 install --dry-run
```

Useful installer controls:

```bash
# Replace an existing Auto Pilot installation (a backup is made first).
npx github:tombelieber/codex-auto-pilot#v0.1.0 install --force

# Check the installed skill, profiles, and command wiring.
npx github:tombelieber/codex-auto-pilot#v0.1.0 doctor
```

The installer does not modify Codex concurrency settings. If you want more session capacity and understand the resource cost, add this optional setting yourself:

```toml
[agents]
max_concurrent_threads_per_session = 20
```

## Use it

1. Write and approve a bounded implementation plan or design spec.
2. Start Codex in the target Git repository.
3. Invoke `$auto-pilot` and point to the approved artifact.
4. Review the PR, its checks, and its audit record before merging.

PR mode is the default. Ask explicitly for auto-merge or release only after you are comfortable with the plan, repository checks, and release consequences.

## Privacy and safety

- No telemetry is collected.
- No plan, code, repository data, or other user data is uploaded by this project.
- No credentials are included; provide required repository credentials through your normal local/GitHub setup.
- The public GitHub handle `tombelieber` is intentionally present. Personal names, email addresses, private filesystem paths, and internal strategy are not part of this distribution.

`npm run check` includes a public-safety check that rejects common credential material, private home paths, non-noreply email addresses, `.env` files, private keys, and symlinks in the distributable tree.

## Limits

- This delivers software through Git and GitHub PRs; it does not perform non-software operational work.
- Plan approval authorizes intent, not stale repository truth. Reviewers and deterministic checks must still validate current code, tests, and constraints.
- Migrations and backfills use the target repository's mechanism; Auto Pilot does not create a universal data-change runner.
- If a repository has no deploy/release mechanism, an explicit release request ends at a merged `main` branch.
- Model availability and supported reasoning tiers vary by account and runtime.
- Deterministic repository checks outrank model review.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for a focused contribution path and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE) © tombelieber
