# Mole release management and worktree cleanup

_Checked 2026-08-21 against first-party repositories and documentation only. Mole source was pinned to [`b5c6ecc`](https://github.com/tw93/Mole/commit/b5c6eccb24f4727da850a1a454aa0df45bb51216), the `V1.51.0` release commit._

## Scope and identification

“Mole” is not a unique repository name. This note assumes the user means [`tw93/Mole`](https://github.com/tw93/Mole), the terminal-first macOS cleanup utility, because the local clean-room reference checkout resolves to that public origin. If another Mole project was intended, the release comparison must be rerun against its repository.

## Decision for Auto Pilot

1. **Mole does not automatically delete a local worktree merely because its PR merged or its release shipped.** GitHub can delete a merged PR’s remote head branch when that repository setting is enabled, but that is a remote-branch operation, not local-worktree disposal.[^github-branch-delete] Git itself says a linked worktree is removed with `git worktree remove`; `prune` only removes administrative records for worktree directories that are already missing.[^git-worktree] Mole adopts an even stricter product rule: worktree staleness is not safely decidable, so it removes only whitelisted rebuildable artifacts inside a worktree and never the whole worktree.[^mole-worktree] **Auto Pilot intentionally differs by user decision:** after a verified merge, it automatically removes only its own clean, unlocked, pushed, remote-reachable worktree and fails closed instead of force-removing an uncertain one.
2. **Treat the release note as part of release completion, not optional copy.** Mole’s tag workflow creates a stable release with `generate_release_notes: false`; curated notes are a required follow-up using `gh release edit`.[^mole-workflow-release][^mole-notes-publish] For Auto Pilot, a run should not report `released` until the repository’s release note exists, the release URL is known, and the final response ends with a compact release message linking to it.
3. **Keep artifact publication, release qualification, and announcement as separate gates.** Mole verifies assets, checksums, and a real previous-version self-update before publishing notes or announcing the release; Homebrew remains a separately verified downstream channel.[^mole-post-release]

## What Mole actually does

### Release and version mechanics

- A commit on `main` is immediately available through Mole’s Nightly channel, but it is not a stable release. Stable GitHub and Homebrew distribution begins only when a capital-`V` tag is pushed.[^mole-channels]
- Pre-flight checks bind the release to source truth: the version in `mole`, the version/date in `SECURITY_AUDIT.md`, a controlled Git diff, formatting/full tests, Go tests, and a build must all pass.[^mole-preflight]
- The stable tag format is `V<version>`, for example `V1.51.0`; lowercase `v` does not trigger the workflow. The tag workflow builds amd64 and arm64 artifacts, generates `SHA256SUMS`, creates provenance attestations, publishes the GitHub Release, and opens or updates the Homebrew Core formula PR.[^mole-tag][^mole-workflow-build][^mole-workflow-homebrew]
- The release workflow intentionally creates the GitHub Release without generated notes. After the workflow finishes, the operator must verify both architecture artifacts plus `SHA256SUMS`, run a previous-stable-to-candidate update smoke, and then edit the existing release rather than creating a second one.[^mole-post-release][^mole-notes-publish]
- Mole’s release job creates a temporary Homebrew checkout on a GitHub-hosted runner, not in the maintainer’s local checkout.[^mole-workflow-homebrew] GitHub decommissions a hosted runner VM after its job finishes, so this runner-local directory disappearing is unrelated to cleanup of a developer’s local worktree.[^github-hosted-runner]

### Release-note format

Mole’s live source of truth is the latest stable release body, not a generic auto-generated changelog. [`V1.51.0 Deliberate 🎯`](https://github.com/tw93/Mole/releases/tag/V1.51.0) demonstrates the current shape:

1. Title: `V<version> <Codename> <emoji>`.
2. Branded `Mole` header and one-line product statement.
3. `### Changelog`: numbered English items, ordered by user impact rather than commit time.
4. `### 更新日志`: the same numbered items in Chinese and in the same order.
5. `### Thanks`: issue reporters and PR contributors for that release cycle.
6. `### Mole Mac App`: short cross-link, with no trailing generic repository footer.

The authoring contract also requires reading the latest stable body before drafting, checking the full release commit range and user-visible boundary changes, keeping PR references and handles out of individual items, and verifying every named command exists in `HEAD`.[^mole-notes-inputs][^mole-notes-format]

## Recommended Auto Pilot contract

### Worktree lifecycle

Use these Auto Pilot states. This deliberately adopts a narrower, provenance-
checked automatic cleanup policy than Mole:

| State | Worktree action |
|---|---|
| PR open or release incomplete | Keep it. |
| PR merged / release shipped | Automatically remove only the task-owned worktree after proving it clean, unlocked, pushed, and reachable from the remote base; otherwise report `blocked`. |
| Cleanup eligible | Persist evidence outside the target, run from the primary checkout, use `git worktree remove <path>` rather than raw filesystem deletion, prune metadata, and safe-delete branches.[^git-worktree][^mole-worktree] |
| Directory is already missing | `git worktree prune` may remove stale administrative metadata; it is not the command for deciding or deleting a live worktree.[^git-worktree] |

This still separates two facts—**delivery reached production** and **local
workspace cleanup passed**—but Auto Pilot requires both before its terminal
result can be `released`. If cleanup fails after production is live, the run is
`blocked` and must report both truths.

### Release completion gates

An Auto Pilot run should report `released` only after all applicable items are true:

1. The exact release commit is merged and tagged through the repository’s normal mechanism.
2. Required artifacts and integrity files exist at the release URL.
3. Post-release verification passes on the real update/install/runtime path.
4. The repository release note is published in its established format.
5. The final AI response ends with the compact release block below.

If the repository has no release mechanism, report `merged_main`; if a release exists but its note or post-release proof is missing, report `blocked` or the repository’s equivalent unqualified state, not `released`.

### Mandatory final-response suffix after a release

Append this as the final section of the agent response whenever the terminal state is `released`:

```markdown
### Release

**V<version> <name>** — Released

- User-visible change: <highest-impact outcome in one sentence>
- Verification: <exact post-release proof>
- Distribution: <channels completed; any downstream channel still pending>
- Release notes: [V<version>](<release-url>)
```

The one-line release message is the title plus the first bullet: `Released V<version>: <highest-impact outcome>.` Keep the full changelog on the release page; the response suffix is a scan-friendly receipt, not a second independent changelog. This adapts Mole’s impact-first notes and channel separation without copying its project-specific bilingual or branding requirements into every repository.[^mole-channels][^mole-notes-format]

## Primary sources

[^github-branch-delete]: GitHub Docs, [Managing the automatic deletion of branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches).
[^git-worktree]: Git, [`git-worktree` documentation](https://git-scm.com/docs/git-worktree), especially `remove`, `prune`, and the linked-worktree lifecycle.
[^mole-worktree]: tw93/Mole, [worktree safety rule at the checked release commit](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/AGENTS.md#L114-L115). The project’s closed [worktree-removal proposal](https://github.com/tw93/Mole/discussions/1274) records the maintainer’s final decision to retain only artifact cleanup.
[^mole-channels]: tw93/Mole, [release channels and triggers](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-flow/SKILL.md#L8-L18).
[^mole-preflight]: tw93/Mole, [release pre-flight checklist](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-flow/SKILL.md#L20-L27).
[^mole-tag]: tw93/Mole, [capital-`V` tag-and-publish commands](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-flow/SKILL.md#L29-L37).
[^mole-post-release]: tw93/Mole, [asset verification and script self-update smoke](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-flow/SKILL.md#L37-L47).
[^mole-workflow-build]: tw93/Mole, [tag trigger, architecture builds, checksums, provenance, and release publication](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.github/workflows/release.yml#L1-L107).
[^mole-workflow-release]: tw93/Mole, [release publication with generated notes disabled](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.github/workflows/release.yml#L99-L107).
[^mole-workflow-homebrew]: tw93/Mole, [Homebrew Core update job and temporary checkout](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.github/workflows/release.yml#L109-L183) and [result verification](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.github/workflows/release.yml#L246-L266).
[^mole-notes-inputs]: tw93/Mole, [release-note inputs and release-existence check](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-notes/SKILL.md#L11-L20).
[^mole-notes-format]: tw93/Mole, [release-note structure and format rules](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-notes/SKILL.md#L34-L80).
[^mole-notes-publish]: tw93/Mole, [`gh release edit` publication and post-publish checks](https://github.com/tw93/Mole/blob/b5c6eccb24f4727da850a1a454aa0df45bb51216/.claude/skills/release-notes/SKILL.md#L82-L107).
[^github-hosted-runner]: GitHub Docs, [Using GitHub-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners), which states that GitHub provisions a VM for a job and decommissions it when the job finishes.
