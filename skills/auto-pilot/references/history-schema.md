# Local Run History Schema

Automatic history collection writes one private directory per explicit Auto Pilot invocation:

```text
~/.codex-auto-pilot/history/runs/<session-id>--<turn-id>/
├── manifest.json
├── transcript.jsonl
├── agents/
│   ├── <agent-id>.json
│   └── <agent-id>.jsonl
├── metrics.json
├── receipt.json              # verified terminal runs only
└── outcome.json
```

Only a leading `$auto-pilot ...` command or leading Auto Pilot skill selection starts a run. Inline mentions, design discussions, optimization requests, and explicit “do not start” prompts are excluded.

`manifest.json` identifies the run mode, requested release continuation, collector and skill versions, the installed `SKILL.md` hash, the complete skill-bundle hash and per-file hashes, start/end times, model, effort, resolved Auto Pilot preferences, source offset, and retention state. Resolved preferences include their optional user-config source, explicit invocation overrides, and non-fatal collection warnings. `ship`, `--then-release`, and an unambiguous current implementation-then-release imperative record `continuation: release`; this is observational metadata, not standalone production authority. The manifest stores only a hash of the invocation prompt; the original prompt remains in the archived transcript.

The first run of each complete bundle is also archived under `~/.codex-auto-pilot/history/versions/<bundle-sha256>/`. This preserves the exact skill, references, scripts, tests, and agent metadata needed to explain a later version comparison. A semantic version associated with multiple bundle hashes is reported as version drift.

`metrics.json` contains deterministic measurements:

- Token totals and uncached input derived from the Codex cumulative usage delta.
- Duration, model, effort, tool calls, tool names, subagent count, subagent model/effort metadata when the hook exposes it, and compactions.
- A separate routing audit derived from the final `auto-pilot-routing` marker, `::created-thread{threadId|clientThreadId="..."}` directives, resolved preferences, and archived subagent count. Its status is `passed`, `fallback`, `deviation`, or `unknown`.
- Transcript byte count and SHA-256 for integrity and reprocessing.
- Parse errors, which must remain visible instead of silently dropping unsupported records.
- Collection-complete and token-counter-reset flags so missing or incompatible usage evidence is never presented as a real zero-token run.

`outcome.json` accepts a terminal state only from a fully validated v6 receipt referenced by the hidden final-response marker. The hook invokes the same validator used by the controller, copies that receipt to `receipt.json`, and records its SHA-256 plus a hash of the source path. For `released`, it also verifies that the final visible response ends with the exact `release.message` stored in the receipt; the hidden routing and receipt markers may follow it. It never infers success from prose or from a shallow mode/state object. Missing, invalid, oversized, mode-mismatched, or release-message-mismatched evidence produces `unknown` and is excluded from the benchmark cohort.

Routing audit never changes a valid completion receipt. Delivery and release authority are outcome facts; model choice and execution topology are operational facts. A missing routing marker therefore yields `orchestration_status: unknown`, while an impossible lane, an undisclosed model fallback, a primary subagent without explicit configuration, a newly created task reference without a matching `::created-thread` directive, an extra `::created-thread` directive, or contradictory routing markers yields `deviation`. An exact reused release task instead requires its existing task reference and a reason. An intentional tiny direct lane can pass; a disclosed task-creation or model fallback yields `fallback`.

Reports retain legacy totals for continuity, count requested continuations and orchestration statuses, and calculate a separate benchmark cohort from receipt-verified runs only. Compare model or skill versions using that cohort and task-local quality evidence, never raw mixed historical totals. Treat routing conformance as a separate analysis dimension rather than a delivery-success gate.

Runs written before schema v3 have no routing audit inferred retroactively; reports label them `legacy_unobserved` while preserving their existing totals and receipt eligibility.

The original JSONL is canonical evidence. Derived schemas are versioned because Codex transcript fields may change. Raw root and subagent transcripts expire after 90 days by default; manifests, metrics, outcomes, and subagent metadata remain.

All collection is local, deterministic, and model-free. Do not commit or upload this archive.
