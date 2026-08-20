# PR-stage delegated implementation

Use one controller-implementer relay for substantive implementation. Keep the active controller responsible for repository truth, final quality, and PR delivery.

```text
approved artifact
  -> controller: minimal truth refresh and dispatch
  -> one declared primary lane: implement and hand off once
  -> controller: review once, patch, verify, and open the PR
  -> terminal pr_ready; no merge or production mutation
```

## Choose the lane

Implement directly when the work is tiny, localized, and faster to verify than to hand off, such as a typo, one-line configuration fix, or narrow test expectation. Treat these as examples, not numeric thresholds.

Delegate when the approved scope contains meaningful code implementation whose repeated tool loop would cost more than one compact handoff. The default substantive lane is one user-visible independent Codex task. The explicit `$auto-pilot` invocation authorizes that task as part of the PR stage.

A collaboration subagent is a distinct execution kind, not an equivalent name for an independent task. Use one as the primary implementer only when the resolved `substantive_executor` is `subagent` or `auto`, and declare that lane before dispatch. Use direct controller execution when the resolved executor is `direct`, the work is tiny, or independent task creation fails and the controller can safely finish without changing authority.

The active controller or implementer may use bounded collaboration helpers when the resolved collaboration policy is `auto`, useful work can continue in parallel, the packet is independently verifiable, and write ownership does not overlap. Do not turn helpers into preparation, status, separate reviewer, or repair stages. Never split the primary implementation into waves unless the approved artifact itself requires independently owned packets and the user explicitly requests that split.

## Prepare the implementer

1. Fetch remote truth and resolve the exact latest default-branch SHA without pre-reading the full implementation surface in the controller.
2. Resolve configuration and state the selected primary lane, model/thinking preference, worktree mode, and collaboration policy in one concise commentary update. Do not ask for confirmation.
3. For the default task lane, discover lazy-loaded thread tools before claiming they are unavailable. Use the product's project listing, task creation, and bounded wait tools to start one user-visible task in a new isolated worktree and task branch at the resolved SHA.
4. Use the resolved implementation model and thinking settings; the built-in preference is `gpt-5.6-terra` with `ultra`. If the configured combination is unavailable, disclose the model fallback. If independent task creation itself is unavailable or fails, finish directly in the controller when safe; never silently substitute a collaboration subagent.
5. For an explicitly selected primary subagent lane, use a fresh context and a dedicated worktree for writes. State that it is an in-turn collaboration subagent, not a user-visible Codex task.
6. Give the implementer the complete approved artifact, repository path, base SHA, owned branch or files, relevant instructions, and required focused verification.
7. Preflight filesystem and network access when implementation requires them. Capability does not grant merge, release, production, secret, billing, or destructive-data authority.

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

Let the selected primary implementer run to a terminal handoff. Use one terminal notification or bounded wait mechanism; do not poll through repeated model turns. Do not review partial diffs, repeatedly redirect it, or bounce fixes between tasks. Intervene only for a genuine product decision, authority boundary, blocker, or clear scope violation.

After handoff, the controller must:

1. Verify the reported branch and head against the expected base.
2. Inspect the complete diff and integration wiring.
3. Perform one consolidated review for correctness, readability, architecture, security, performance, and test quality.
4. Patch all findings directly instead of starting a review loop with the implementer.
5. Run exact-candidate gates, create the PR, validate a `pr_ready` receipt, and stop without merging or mutating production.

If the implementer fails or stops incomplete, pick up its usable branch and finish in the controller task. Do not start a replacement wave by default.

At final handoff, emit the created-task directive for every user-visible implementation task and use the same task reference in the Auto Pilot routing marker. For direct or subagent execution, record the real lane and a short reason. The completion receipt remains about the delivered candidate; orchestration is audited separately by private history.
