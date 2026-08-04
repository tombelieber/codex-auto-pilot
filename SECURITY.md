# Security policy

Report suspected vulnerabilities through this repository's [GitHub issues](https://github.com/tombelieber/codex-auto-pilot/issues). Do not include credentials, private repository URLs, or private user data in a report.

For a sensitive report, use GitHub private vulnerability reporting when it is enabled for this repository. If private reporting is unavailable, open a minimal public issue that identifies the affected version and impact without publishing exploit details or secrets; maintainers can coordinate the next safe step in GitHub.

Supported releases are the current tagged release and the default branch. Reports should include a minimal reproduction, expected versus actual behavior, and the version or commit tested.

## Local run history

Automatic history collection is local-only and opt-in. It stores full Codex root and subagent transcripts under `~/.codex-auto-pilot/history` by default with private directory and file permissions. Those transcripts can contain source code, prompts, private paths, personal data, credentials accidentally entered into a conversation, and complete tool output.

- Never commit, attach, or upload a raw run archive without reviewing and redacting it.
- Keep the default 90-day raw retention unless longer retention is intentional.
- Use `CODEX_AUTO_PILOT_DATA` to place the archive on an encrypted local volume when needed.
- Disable the hooks in `/hooks` or remove the Auto Pilot entries from `~/.codex/hooks.json` to stop new collection.

Collection never sends data over the network and never adds transcript content to model context.
