# Auto Pilot configuration

Auto Pilot has portable defaults and one optional user-level JSON file. Configuration changes preferences and routing choices; it never grants merge, release, production, secret, billing, or destructive-data authority.

## Resolve settings

Run this once at the start of a real invocation, forwarding only override flags that were explicitly present in the current command:

```bash
node <skill-dir>/scripts/resolve_config.mjs [override flags]
```

Resolution order is:

1. Explicit current-invocation flags.
2. The optional user config.
3. Built-in defaults.

The default config path is `~/.codex-auto-pilot/config.json`. Set `CODEX_AUTO_PILOT_CONFIG` to use another absolute path. The resolver reads configuration but never creates or rewrites it.

## Schema and defaults

```json
{
  "schema_version": 1,
  "implementation": {
    "substantive_executor": "task",
    "model": "gpt-5.6-terra",
    "thinking": "ultra"
  },
  "release": {
    "model": "gpt-5.6-sol",
    "thinking": "xhigh"
  },
  "collaboration": {
    "policy": "auto"
  }
}
```

`substantive_executor` accepts `task`, `direct`, `subagent`, or `auto`. The default `task` still permits direct controller execution for tiny work or a disclosed task-creation fallback. A primary collaboration subagent requires the resolved executor to be explicitly set to `subagent` or `auto` in user config or the current invocation, and also requires collaboration not to be `off`.

`collaboration.policy` accepts `auto` or `off`. `auto` authorizes only the minimum useful bounded helpers with clear ownership. `off` forbids both helper subagents and a primary subagent lane; when the executor is `auto`, it may then choose only an independent task or direct controller execution. Neither setting authorizes a subagent to become the release owner or silently replace an independent implementation task.

## Per-run overrides

Supported flags are:

```text
--implementation-executor task|direct|subagent|auto
--implementation-model MODEL
--implementation-thinking none|minimal|low|medium|high|xhigh|max|ultra
--release-model MODEL
--release-thinking none|minimal|low|medium|high|xhigh|max|ultra
--collaboration auto|off
```

The resolver validates the merged settings. Runtime model availability remains authoritative: disclose any fallback before dispatch and record it in the routing marker. Never turn a model preference failure into a silent execution-kind substitution.

## Fixed boundaries

Configuration cannot change these rules:

- the PR controller never merges or mutates production;
- a generated release continuation is a fresh user-visible task, never a subagent or fork;
- Git write work uses an isolated worktree unless it remains directly in the owning controller's checkout;
- completion receipts prove delivery and authority, not model or orchestration choices; and
- production release requires exact-candidate and capability-reachability evidence.
