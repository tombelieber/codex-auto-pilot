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

`manifest.json` identifies the run mode, collector and skill versions, the installed `SKILL.md` hash, the complete skill-bundle hash and per-file hashes, start/end times, model, effort, source offset, and retention state. It stores only a hash of the invocation prompt; the original prompt remains in the archived transcript.

The first run of each complete bundle is also archived under `~/.codex-auto-pilot/history/versions/<bundle-sha256>/`. This preserves the exact skill, references, scripts, tests, and agent metadata needed to explain a later version comparison. A semantic version associated with multiple bundle hashes is reported as version drift.

`metrics.json` contains deterministic measurements:

- Token totals and uncached input derived from the Codex cumulative usage delta.
- Duration, model, effort, tool calls, tool names, subagent count, subagent model/effort metadata when the hook exposes it, and compactions.
- Transcript byte count and SHA-256 for integrity and reprocessing.
- Parse errors, which must remain visible instead of silently dropping unsupported records.
- Collection-complete and token-counter-reset flags so missing or incompatible usage evidence is never presented as a real zero-token run.

`outcome.json` accepts a terminal state only from a validated v4 receipt referenced by the hidden final-response marker. The hook copies that receipt to `receipt.json` and records its SHA-256 plus a hash of the source path. It never infers success from prose. Missing, invalid, oversized, or mode-mismatched evidence produces `unknown` and is excluded from the benchmark cohort.

Reports retain legacy totals for continuity but calculate a separate benchmark cohort from receipt-verified runs only. Compare model or skill versions using that cohort and task-local quality evidence, never raw mixed historical totals.

The original JSONL is canonical evidence. Derived schemas are versioned because Codex transcript fields may change. Raw root and subagent transcripts expire after 90 days by default; manifests, metrics, outcomes, and subagent metadata remain.

All collection is local, deterministic, and model-free. Do not commit or upload this archive.
