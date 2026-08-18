# PR-stage delegated implementation

Use one controller-implementer relay for substantive implementation. Keep the active Sol task responsible for repository truth, final quality, and PR delivery.

```text
approved artifact
  -> Sol controller: minimal truth refresh and dispatch
  -> one fresh Terra task: implement and hand off once
  -> Sol controller: review once, patch, verify, and open the PR
  -> terminal pr_ready; no merge or production mutation
```

## Choose the lane

Implement directly when the work is tiny, localized, and faster to verify than to hand off, such as a typo, one-line configuration fix, or narrow test expectation. Treat these as examples, not numeric thresholds.

Delegate when the approved scope contains meaningful code implementation whose repeated tool loop would cost more than one compact handoff. Use one user-visible independent Codex task when the product supports it, not an in-turn subagent. The explicit `$auto-pilot` invocation authorizes this single implementation task as part of the PR stage.

Do not delegate documentation-only work, routine cleanup, or a small causal follow-up merely to satisfy the pattern. Do not add Luna helpers, preparation agents, status agents, separate reviewers, or repair agents. Never split the scope into agent waves unless the approved artifact itself requires independently owned packets and the user explicitly requests that split.

## Prepare the implementer

1. Fetch remote truth and resolve the exact latest default-branch SHA without pre-reading the full implementation surface in the controller.
2. Start the implementer from a new isolated worktree and task branch at that SHA. Never reuse a dirty checkout, stale branch, or another task's worktree.
3. Prefer `gpt-5.6-terra` with `high` reasoning. Use `ultra` only when the approved scope is genuinely cross-cutting or difficult enough to justify it. If unavailable, use the best single implementation model available or implement directly; do not compensate with a larger agent team.
4. Give the implementer the complete approved artifact, repository path, base SHA, owned branch or files, relevant instructions, and required focused verification.
5. Preflight filesystem and network access when implementation requires them. Capability does not grant merge, release, production, secret, billing, or destructive-data authority.

## Bound implementation authority

Tell the implementer to:

- implement the complete approved scope and directly causal fixes;
- preserve unrelated work and follow repository instructions;
- run focused local verification;
- commit scoped changes and push only its task branch when repository policy permits; and
- return the base SHA, branch, head SHA, changed paths, checks, failures, and blockers.

The implementer must not change the approved product contract, open or merge the final PR, release, deploy, migrate production data, rotate secrets, or clean resources owned by another task.

Return exactly one compact handoff. Treat the repository and Git objects as shared immutable truth; do not copy the controller conversation, implementation reasoning, or full command logs.

```json
{
  "plan": {"source": "path", "sha256": "..."},
  "git": {"base_sha": "...", "branch": "...", "head_sha": "..."},
  "changed_paths": ["..."],
  "checks": [{"name": "...", "status": "passed", "evidence": "..."}],
  "failures": [],
  "open_risks": [],
  "blockers": []
}
```

## Wait, then take over once

Let the implementation task run to a terminal handoff. Use one terminal notification or bounded wait mechanism; do not poll through repeated model turns. Do not review partial diffs, repeatedly redirect it, or bounce fixes between tasks. Intervene only for a genuine product decision, authority boundary, blocker, or clear scope violation.

After handoff, the Sol controller must:

1. Verify the reported branch and head against the expected base.
2. Inspect the complete diff and integration wiring.
3. Perform one consolidated review for correctness, readability, architecture, security, performance, and test quality.
4. Patch all findings directly instead of starting a review loop with the implementer.
5. Run exact-candidate gates, create the PR, validate a `pr_ready` receipt, and stop without merging or mutating production.

If the implementer fails or stops incomplete, pick up its usable branch and finish in the controller task. Do not start a replacement wave by default.
