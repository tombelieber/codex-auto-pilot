# Tokscale session analysis patterns for Auto Pilot telemetry

_Audited 2026-08-21 against the local fork and upstream commit `ab5b5095f216321b689a8b4eef8d1bd5d82b9e00`._

## Verdict

Tokscale supports the proposed **thin-marker hybrid**, but it should be an implementation reference rather than an Auto Pilot runtime dependency.

The real outcome is not “port Tokscale.” It is:

> Preserve the few Auto Pilot facts that cannot be reconstructed later, then deterministically rebuild invocation, topology, token, timing, and outcome metrics from local Codex JSONL without slowing the agent turn.

Tokscale already demonstrates the difficult post-hoc half: safe append-only resume, stateful Codex token parsing, fork/replay deduplication, explicit unknown states, and derived-cache invalidation. Auto Pilot still needs its own thin markers because Tokscale does not know an `$auto-pilot` invocation boundary, skill/config bundle, fresh-stage lineage, routing marker, or receipt-backed terminal outcome.

## Audited source and licence

- `tombelieber/tokscale` is a GitHub fork of `junhoyeo/tokscale`. Local `main`, `origin/main`, and `upstream/main` all resolved to [`ab5b5095`](https://github.com/junhoyeo/tokscale/commit/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00) during the audit.
- Tokscale is MIT licensed. Use, modification, and distribution are permitted, but copied code or substantial portions must retain Junho Yeo's copyright and MIT permission notice.[^license]
- The audited client registry contains 49 local sources at this commit, spanning JSON, JSONL/NDJSON, logs/CSV, and SQLite. It includes OpenCode, Claude Code, Codex, Cursor, Gemini, Amp, Droid, OpenClaw, Pi, Kimi, Qwen, Roo Code, Kilo Code, Mux, Kilo, Crush, Hermes, Copilot, Goose, Codebuff, Antigravity, Zed, Kiro, Trae, Warp, Cline, Gajae-Code, Grok, Jcode, Command Code, MiMo Code, Antigravity CLI, Junie, ZCode, OpenCodeReview, CodeBuddy, WorkBuddy, Devin CLI/Desktop, Senpi, Augment, Kimchi, Reasonix, Prime Agent, Freebuff, Cherry Studio, DSH, MiniMax Code, and fx.[^clients]

Only the Codex lane is directly relevant to Auto Pilot today. Do not port the exhaustive client registry.

## Patterns worth reusing

| Pattern | Tokscale evidence | Direct Auto Pilot use |
|---|---|---|
| **Stateful append parsing** | `CodexParseState` travels with `consumed_offset`, parse status, and unresolved-model status; the parser seeks directly to the saved byte offset.[^codex-state][^codex-incremental] | Keep the parser state-shaped and versioned. Add a persisted checkpoint only if repeated post-terminal cold scans become a measured cost; one terminal scan per parser version does not need that cache yet. |
| **Prove a prefix before resuming** | Resume state stores the offset, complete-newline flag, and prefix SHA-256. A file must have grown and its old prefix must still match; otherwise Tokscale cold-parses it.[^prefix-cache][^resume-gate] | If Auto Pilot later adds warm resume, accept it only at a complete line with an identical prefix; shrink, rewrite, or mismatch must trigger a full rebuild. |
| **Cache only trustworthy derivations** | A parse may return partial messages, but failed parsing or unresolved model attribution is deliberately not cached.[^trusted-cache] | A report may surface `partial` or `unverified`, but an incomplete scan must not advance the durable checkpoint or enter the benchmark cohort. |
| **Semantic dedup, not path dedup** | Tokscale scans both active and archived Codex directories, then scopes token-event dedup to the upstream session/fork identity and cumulative token vector.[^codex-discovery][^codex-dedup] | Use canonical paths only to avoid duplicate IO. Use session/event identity to prevent active/archive duplicates and parent history replayed into leaf transcripts from inflating lifecycle cost. |
| **Version each derived layer** | The serialized cache format and each client parser version are separate, so a Codex parser correction need not invalidate unrelated caches.[^parser-version] | Keep separate `marker_schema_version`, `codex_parser_version`, and `materializer_version`. Raw markers and Codex JSONL remain canonical; derived metrics can be rebuilt. |

### Token accounting rules to carry over

Tokscale's Codex parser is materially safer than Auto Pilot's current “final cumulative total minus starting cumulative total” calculation in [`history.mjs`](../../skills/auto-pilot/scripts/history.mjs):

1. Treat `last_token_usage` as the primary per-event increment. Cumulative `total_token_usage` is mutable across resume and compaction, so Tokscale uses it for duplicate and monotonicity checks rather than blindly treating it as the delta.[^token-deltas]
2. Ignore exact repeated totals and stale small regressions; handle genuine resets explicitly. Zero snapshots do not advance the baseline.[^token-deltas]
3. Clamp malformed negative buckets. `cached_input_tokens` overlaps input, and Codex `reasoning_output_tokens` is a subset of output, so both must be split rather than added twice.[^token-buckets]
4. Preserve separate input, output, cache-read, cache-write, and reasoning buckets and use saturating aggregation.[^breakdown]
5. Keep raw model and effort evidence. Normalized grouping labels are a derived presentation field and must not overwrite source identity.[^model-identity]

For Auto Pilot, the important consequence is that a compaction should not make an invocation look artificially cheap, expensive, or incomplete merely because the cumulative counter reset.

### Lineage and replay rules to carry over

Tokscale reads `forked_from_id` and Codex's `source.subagent.thread_spawn.parent_thread_id`, skips inherited parent history until the child reaches its own turn, and creates a dedup scope shared by replayed fork events.[^fork-lineage][^fork-skip]

That allows Auto Pilot to reconstruct ordinary collaboration-subagent ancestry from raw Codex sessions without adding tool-by-tool telemetry hooks. One gap remains: a separately created fresh owner task is not necessarily a Codex fork. A tiny explicit `goal_id`/`parent_run_id` breadcrumb is still required when Auto Pilot creates that fresh stage. Native compaction remains the same session and needs no new stage marker.

## Minimal thin-marker design after this audit

```text
synchronous Codex hooks
  -> append one private marker line
       event + observed_at
       session_id + turn_id + optional agent_id
       transcript path + source byte size
       only irreducible Auto Pilot facts

history materialize / list / report
  -> validate marker journal
  -> discover referenced Codex active/archive sources
  -> parse once through the recorded terminal byte boundary
  -> derive tokens, topology, lineage, routing, and outcome
  -> atomically replace derived run metrics
```

Keep the existing hook set in [`hooks/hooks.json`](../../hooks/hooks.json), but reduce the work performed by each event:

| Hook | Synchronous work that remains | Move to post-hoc materialization |
|---|---|---|
| `UserPromptSubmit` | Append invocation boundary, IDs/path/size, prompt hash, config identity, and the exact small skill-bundle identity that would otherwise disappear on upgrade. | Transcript tail scan, pruning, and token baseline parsing. |
| `SubagentStop` | Append parent IDs, agent ID/type, transcript path, and end size. | Transcript copy/hash/parse and model/token/tool aggregation. |
| `Stop` | Append end boundary and final-message hash; copy the small receipt source if its temporary path may disappear. | Receipt validation, root transcript hash/parse, routing audit, metrics, and retention work. |
| `SessionEnd` | Append recovery boundary only. | Find and recover unfinished runs. |

The receipt eligibility contract remains the materialized output. Schema v4 stopped duplicating new Codex transcripts; current schema v5 also preserves immutable invocation-schema identity and same-task release routing. Thin markers and independently versioned derived files evolve the existing [history schema](../../skills/auto-pilot/references/history-schema.md); they are not a second telemetry system.

## What not to port

1. **No TUI, frontend, server, auth, submission, leaderboard, or remote telemetry path.** Those are Tokscale product surfaces, not passive local Auto Pilot collection.
2. **No 49-client abstraction yet.** Hooks already identify the exact Codex transcript. Add another client only when Auto Pilot actually supports another runtime.
3. **No Rayon/SIMD/Rust bridge or 256-shard binary cache in the first patch.** Tokscale optimizes a broad multi-client scanner; Auto Pilot can start with a small versioned JSON checkpoint and atomic writes.
4. **No pricing downloader or alias table in canonical records.** Store raw model/effort and token buckets; apply a versioned price snapshot during later comparison.
5. **No LLM session summarizer or Tokscale parser-throughput benchmark as an architecture score.** Tokscale's benchmark runner measures CLI wall time and memory, while its synthetic generator uses unseeded randomness. Auto Pilot needs receipt-qualified goal outcomes, tokens, wall time, repairs, and topology—not parser throughput.[^tokscale-benchmark][^synthetic-generator]

Tokscale can be a test oracle during development, but Auto Pilot should not shell out to it in normal collection. Its report boundaries are sessions/models, not Auto Pilot invocations/goals, and a runtime dependency would make the small local skill harder to install and debug.

## Focused test contracts for the patch

If a future parser adds warm checkpoints or collaboration-token dedup, group its tests by correctness boundary rather than mirroring Tokscale's large suite:

1. **Incremental parity:** cold full scan equals checkpoint plus appended scan, including preserved turn/model/effort state.[^incremental-parity]
2. **Unsafe resume fallback:** append succeeds; a non-newline boundary, shrink, middle rewrite, or same-tail rewrite rejects the checkpoint and rebuilds from zero.[^resume-tests]
3. **Incomplete evidence:** malformed JSON/IO and unresolved model evidence remain visible but do not advance a trusted checkpoint or become benchmark-eligible.[^trusted-cache]
4. **Token correctness:** duplicate totals, compaction/reset, cached-input overlap, reasoning subset, negative/missing fields, and zero snapshots cannot double count.
5. **Topology correctness:** active/archive duplicates, parent replay in leaf transcripts, sibling fork replay, and incremental child-state continuation produce the same total as one clean semantic scan.[^fork-tests]

For this documentation-only audit, no Tokscale or Auto Pilot test suite was run. The smallest sufficient verification is Markdown/static diff validation; implementation tests belong in the telemetry patch.

## Implementation decision

Reuse the **contracts**, not the product:

- thin private markers on the synchronous path;
- one Codex-only post-hoc scan through the terminal byte boundary;
- `last_token_usage` increments with cumulative duplicate/reset evidence;
- independently versioned marker, parser, and materializer layers; and
- fail-open reporting but fail-closed benchmark eligibility. Current schema v5 keeps collaboration-agent token totals unverified and outside cost cohorts until semantic replay dedup is implemented and proven, and requires passed routing plus one exact bundle for strict comparisons.

If substantial Tokscale code is copied rather than independently reimplemented in JavaScript, add the required Tokscale MIT attribution before release.[^license]

## Primary sources

[^license]: Tokscale, [`LICENSE`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/LICENSE#L1-L20).
[^clients]: Tokscale, exhaustive client registry in [`clients.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/clients.rs#L403-L987), local path `crates/tokscale-core/src/clients.rs`.
[^codex-state]: Tokscale, Codex persisted parser state and result in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L219-L273), local path `crates/tokscale-core/src/sessions/codex.rs`.
[^codex-incremental]: Tokscale, offset-seeking incremental entry point in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L1065-L1099).
[^prefix-cache]: Tokscale, incremental cache fields and construction in [`message_cache.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/message_cache.rs#L754-L760) and [`message_cache.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/message_cache.rs#L2307-L2347), local path `crates/tokscale-core/src/message_cache.rs`.
[^resume-gate]: Tokscale, append-only resume and cold-parse fallback in [`lib.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/lib.rs#L1493-L1601), local path `crates/tokscale-core/src/lib.rs`.
[^trusted-cache]: Tokscale, partial parse output but no cache for failed or unresolved parsing in [`lib.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/lib.rs#L804-L852).
[^codex-discovery]: Tokscale, active, archived, and headless Codex discovery in [`scanner.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/scanner.rs#L1686-L1721), local path `crates/tokscale-core/src/scanner.rs`.
[^codex-dedup]: Tokscale, fork-scoped message keys in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L652-L671) and cumulative-total key construction in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L920-L970).
[^parser-version]: Tokscale, cache-format versus parser-version separation in [`message_cache.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/message_cache.rs#L15-L40) and the Codex parser version in [`message_cache.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/message_cache.rs#L945-L955).
[^token-deltas]: Tokscale, cumulative/reset handling and `last_token_usage` increments in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L518-L611).
[^token-buckets]: Tokscale, cached-input and reasoning/output overlap correction in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L120-L216).
[^breakdown]: Tokscale, complete saturating token breakdown in [`lib.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/lib.rs#L248-L285).
[^model-identity]: Tokscale, canonical identity versus presentation-only grouping aliases in [`lib.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/lib.rs#L74-L128) and [`model_alias.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/model_alias.rs#L1-L21), local path `crates/tokscale-core/src/model_alias.rs`.
[^fork-lineage]: Tokscale, Codex fork fields and parent extraction in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L35-L71) and [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L777-L788).
[^fork-skip]: Tokscale, inherited-history gate and child-turn detection in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L356-L471) and [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L790-L878).
[^tokscale-benchmark]: Tokscale, parser benchmark scope, repeated runs, and statistics in [`packages/benchmarks/README.md`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/packages/benchmarks/README.md#L1-L24) and [`runner.ts`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/packages/benchmarks/runner.ts#L256-L280), local path `packages/benchmarks/runner.ts`.
[^synthetic-generator]: Tokscale, unseeded `Math.random`/`randomUUID` fixture generation in [`generate.ts`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/packages/benchmarks/generate.ts#L108-L138), local path `packages/benchmarks/generate.ts`.
[^incremental-parity]: Tokscale, incremental versus full parse tests in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L1427-L1461) and [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L1502-L1560).
[^resume-tests]: Tokscale, append acceptance in [`message_cache.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/message_cache.rs#L2668-L2706) and unsafe-prefix rejection in [`message_cache.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/message_cache.rs#L3739-L3784).
[^fork-tests]: Tokscale, fork replay regression tests in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L2089-L2195) and incremental fork-state parity in [`codex.rs`](https://github.com/junhoyeo/tokscale/blob/ab5b5095f216321b689a8b4eef8d1bd5d82b9e00/crates/tokscale-core/src/sessions/codex.rs#L2545-L2583).
