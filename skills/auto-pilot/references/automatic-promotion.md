# Automatic release continuation

Use this only when the current Auto Pilot invocation explicitly selects `ship` or clearly orders implementation followed by production delivery. This authority permits one fresh release task after `pr_ready`; it never permits production mutation inside the PR controller.

## Normalize the intent

Prefer the unambiguous command:

```text
$auto-pilot ship /path/to/approved-plan.md
```

Also accept a direct current imperative such as “finish this and release it,” “merge and deploy after the PR is ready,” or an equivalent Chinese/Cantonese instruction. Do not select automatic continuation from discussion, a future wish, a question, a quoted example, earlier chat, or any instruction that says not to release.

## Dispatch once after PR readiness

1. Finish the complete PR stage and bind the live PR URL plus its full head SHA. Never create the release task before the PR is open, unmerged, and ready.
2. Form the deterministic title `Auto Pilot Release — <owner/repo>#<PR> @ <12-char-head>`.
3. When thread tools exist, list projects and select the matching repository project. List recent tasks and inspect any exact-title match. Reuse an existing task bound to the same PR and head instead of creating a duplicate.
4. If no exact task exists, create one fresh task—never a fork—using the release model/effort policy. A Git repository should use an isolated worktree unless the user explicitly requested its saved checkout.
5. Start the task with this compact prompt, filled from live evidence:

```text
$auto-pilot release <PR URL>
This fresh task is the one authorized continuation of the current user's explicit ship request.
Expected pre-merge candidate head: <FULL HEAD SHA>.
Resolve the live PR and follow the Auto Pilot release contract. Revalidate any changed head; return material new scope to a PR stage. Source pr_ready receipt: <PATH OR IMMUTABLE ID>.
```

6. Record the task reference and exact candidate head as evidenced checks in the `pr_ready` receipt. Emit the app's created-task directive so the user can open it. End the PR controller; the release task owns merge, deployment, recovery, and production proof.

## Fail closed

- If release intent is ambiguous, use PR-only mode.
- If PR readiness fails, do not dispatch a release task.
- If an exact continuation already exists, reuse it; never create a second release task for the same PR head.
- If fresh-task creation is unavailable, return the exact `$auto-pilot release <PR URL>` command. Never release in the PR controller as a fallback.
- Do not repeat resolved design questions. The release task may still stop for a genuine authority, credential, billing, destructive-data, compatibility, or changed-scope blocker.
