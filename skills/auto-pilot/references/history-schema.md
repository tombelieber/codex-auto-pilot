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
└── outcome.json
```

`manifest.json` identifies the run, collector and skill versions, the installed `SKILL.md` hash, start/end times, model, effort, source offset, and retention state. It stores only a hash of the invocation prompt; the original prompt remains in the archived transcript.

`metrics.json` contains deterministic measurements:

- Token totals and uncached input derived from the Codex cumulative usage delta.
- Duration, model, effort, tool calls, tool names, subagent count, and compactions.
- Transcript byte count and SHA-256 for integrity and reprocessing.
- Parse errors, which must remain visible instead of silently dropping unsupported records.
- Collection-complete and token-counter-reset flags so missing or incompatible usage evidence is never presented as a real zero-token run.

`outcome.json` records the terminal state found in the final assistant message: `pr_ready`, `merged_main`, `released`, `blocked`, or `unknown`. `unknown` is evidence that delivery classification needs review; it is never silently counted as success.

The original JSONL is canonical evidence. Derived schemas are versioned because Codex transcript fields may change. Raw root and subagent transcripts expire after 90 days by default; manifests, metrics, outcomes, and subagent metadata remain.

All collection is local, deterministic, and model-free. Do not commit or upload this archive.
