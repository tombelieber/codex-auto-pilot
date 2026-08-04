# Telemetry collection patterns for a local Codex skill

_Checked 2026-08-04 against first-party repositories and documentation only._

## Verdict

For a single-user, local-first Codex skill, keep the raw Codex transcript as canonical evidence but move expensive collection work out of synchronous lifecycle hooks. The smallest robust design is:

1. `UserPromptSubmit`, `SubagentStop`, `Stop`, and `SessionEnd` append one small, private marker containing stable IDs and transcript paths.
2. `history list`, `history report`, or one optional periodic job incrementally scans only bytes added since the last saved offset.
3. The scanner copies or hashes raw evidence and materializes metrics atomically; remote OTLP export remains a separate explicit action.

A **pure periodic scanner** has the lowest turn latency but loses the exact lifecycle boundary supplied by hooks and makes subagent association harder. The **thin-marker hybrid** keeps those boundaries while removing transcript copy, hashing, pruning, and parsing from Codex's critical path. This is an inference from Codex's current synchronous command-hook semantics and the collector's current work inside each hook.[^codex-hooks][^current-hooks][^current-history]

## Do the reference projects collect usage automatically?

| Project | Automatic telemetry? | Actual collection pattern |
|---|---|---|
| **mattpocock/skills** | **No per-invocation collection.** | The tracked package is a skill library with release tooling, and its plugin manifest declares skills but no lifecycle hook or telemetry runtime. A repository search at the checked commit found no telemetry, analytics, OTel, PostHog, or Sentry implementation.[^matt-package][^matt-plugin] |
| **obra/superpowers** | **Yes, but only optional visual-companion version telemetry.** | When the optional brainstorming companion renders, it loads a remote logo with the Superpowers version in the query string. The README says it sends no project, prompt, agent, or click detail and documents three opt-out environment variables. This is not per-skill invocation or token telemetry. Its current Codex manifest explicitly declares `hooks: {}`.[^superpowers-readme][^superpowers-server][^superpowers-codex] |
| **Pi coding agent, local `earendil-works/pi` fork** | **Usage is captured locally; a separate install/update ping is automatic by default.** | Pi stores sessions as append-only JSONL trees; assistant messages carry provider token usage and calculated cost, and post-hoc scripts aggregate those files. Its eval reporter separately appends completed run usage/timing to `runs.jsonl`. The install telemetry path sends a fire-and-forget version/update ping and provider attribution when enabled; its observability event bus is still a design note, not the source of the JSONL usage record.[^pi-session][^pi-stats][^pi-evals][^pi-telemetry][^pi-attribution][^pi-observability] |
| **AgentPulse** | **Yes, full hook-event collection.** | Its official repository describes Codex/Claude hooks forwarding lifecycle events to a local Bun/SQLite service and optional remote relay. It says hooks use `async: true`, but current Codex documentation says asynchronous command hooks are parsed but not supported, so that no-latency claim does not currently hold for Codex.[^agentpulse][^codex-hooks] |
| **Codex itself** | **Yes for anonymous product metrics; OTel export is opt-in.** | Codex says anonymous usage/health metrics are enabled by default and independently disableable under `[analytics]`. User-configured OTel log/trace export is disabled by default, redacts prompts unless explicitly enabled, and uses the OTel provider/exporter path. It captures normalized run, API, token, hook, and tool observations, not a lossless Auto Pilot transcript or `$auto-pilot` invocation boundary.[^codex-otel][^codex-otel-source] |

## Four common architectures

| Architecture | Examples | Latency | Privacy | Durability |
|---|---|---|---|---|
| **Inline synchronous hook** | Current Auto Pilot command hooks perform start/finalize work before returning; Codex launches matching hooks concurrently, but does not yet support async command hooks.[^current-hooks][^current-history][^codex-hooks] | Adds the slowest matching hook to the lifecycle boundary. Full transcript copy/hash/parse makes `Stop` the risky point. | Excellent when all writes stay local. | Strong immediate boundary capture, but a timeout or process exit can leave a partial run; `SessionEnd` has at most three seconds.[^codex-hooks] |
| **In-process async buffer and batch export** | Codex OTel, MLflow, Langfuse, and standard OTel batch processors buffer ended spans and export in background batches.[^codex-otel-source][^mlflow-async][^langfuse-background][^otel-batch] | Lowest request-path overhead. | Content can leave the machine unless allow-listed or sent to a local collector. | Memory queues can lose tail data on a crash; short-lived processes must flush. MLflow documents bounded queues, retry timeouts, and dropping new traces when full; Langfuse documents explicit flush for short-lived jobs.[^mlflow-async][^langfuse-background] |
| **Local append-only journal** | Pi's session JSONL and eval `runs.jsonl`; Auto Pilot's preserved Codex JSONL is the analogous canonical evidence.[^pi-session][^pi-evals][^current-history] | One append is cheap and predictable. | Best local-first default, though raw prompts/tool output remain highly sensitive. | Best crash recovery and reprocessing story: a valid prefix survives, and derived schemas can be rebuilt later. Pi explicitly models sessions as append-only trees.[^pi-session] |
| **Post-hoc incremental scan** | Pi's usage scripts scan saved JSONL after execution; the proposed Auto Pilot scanner would resume from a byte offset rather than re-read every file.[^pi-stats] | Zero agent-turn latency when scheduled or run on report. | Processing stays local; only later explicit exports need redaction. | Naturally retries after interruption, but needs checkpoints, deduplication, atomic derived-file writes, and retention-aware missing-source states. |

Phoenix, MLflow, Langfuse, and AgentOps are trace platforms rather than canonical transcript archives. Phoenix accepts OTLP into a local SQLite-backed server; MLflow and Langfuse default to background/batched SDK export; AgentOps automatically builds OTel trace/span hierarchies and defaults to a hosted OTLP endpoint unless configured otherwise.[^phoenix][^mlflow-async][^langfuse-background][^agentops]

OpenTelemetry's GenAI conventions are useful as an **export schema**, with operations such as `invoke_agent`, `invoke_workflow`, and `execute_tool`, plus input/output/cache/reasoning token attributes. The conventions remain under active evolution, so they should not replace raw evidence or become Auto Pilot's internal storage contract.[^otel-genai][^otel-release]

## Recommendation for Auto Pilot

1. **Keep hooks, but make them markers only.** Append one JSONL record with `event`, `session_id`, `turn_id`, `agent_id`, transcript path, timestamp, and source byte size; return `{}` immediately.
2. **Materialize post-hoc.** On `history list/report`—and optionally a user-installed periodic job—resume from saved offsets, copy the relevant transcript segment, compute hashes/metrics, then atomically replace derived JSON.
3. **Keep raw local and versioned.** Preserve the current private permissions, retention policy, parse-error visibility, and `collection_complete`/counter-reset states.[^current-history-schema]
4. **Do not add a server or remote telemetry dependency.** A single user gains little from Phoenix, MLflow, Langfuse, or AgentOps in the collection path; add explicit OTLP/OpenInference export only when a trace UI or team analysis is actually needed.

Therefore: **periodic incremental scanning beats the current heavy synchronous hooks on latency and recovery, but not as a pure replacement. The fastest practical implementation is a thin synchronous append-only marker plus post-hoc incremental reconciliation.**

## Primary sources

[^current-hooks]: codex-auto-pilot, [hook definitions at checked commit](https://github.com/tombelieber/codex-auto-pilot/blob/513131418c65a016c4d74525683c79b8ccd6e599/hooks/hooks.json).
[^current-history]: codex-auto-pilot, [collector and transcript materialization at checked commit](https://github.com/tombelieber/codex-auto-pilot/blob/513131418c65a016c4d74525683c79b8ccd6e599/skills/auto-pilot/scripts/history.mjs).
[^current-history-schema]: codex-auto-pilot, [local history schema](https://github.com/tombelieber/codex-auto-pilot/blob/513131418c65a016c4d74525683c79b8ccd6e599/skills/auto-pilot/references/history-schema.md).
[^matt-package]: mattpocock/skills, [`package.json` at checked commit](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/package.json).
[^matt-plugin]: mattpocock/skills, [Claude plugin manifest at checked commit](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/.claude-plugin/plugin.json).
[^superpowers-readme]: obra/superpowers, [visual companion telemetry disclosure](https://github.com/obra/superpowers/blob/44c9b2d6e889982ac18c27d05a19fefe335194e1/README.md#visual-companion-telemetry).
[^superpowers-server]: obra/superpowers, [version-logo request and opt-outs](https://github.com/obra/superpowers/blob/44c9b2d6e889982ac18c27d05a19fefe335194e1/skills/brainstorming/scripts/server.cjs).
[^superpowers-codex]: obra/superpowers, [Codex plugin manifest with no hooks](https://github.com/obra/superpowers/blob/44c9b2d6e889982ac18c27d05a19fefe335194e1/.codex-plugin/plugin.json).
[^pi-session]: earendil-works/pi, [append-only JSONL `SessionManager`](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/packages/coding-agent/src/core/session-manager.ts).
[^pi-stats]: earendil-works/pi, [post-hoc usage aggregation](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/scripts/stats.ts).
[^pi-evals]: earendil-works/pi, [eval `runs.jsonl` reporter](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/packages/evals/src/vitest-evals/reporter.ts).
[^pi-telemetry]: earendil-works/pi, [install telemetry setting](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/packages/coding-agent/src/core/telemetry.ts) and [version/update ping call site](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/packages/coding-agent/src/modes/interactive/interactive-mode.ts).
[^pi-attribution]: earendil-works/pi, [provider attribution headers](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/packages/coding-agent/src/core/provider-attribution.ts).
[^pi-observability]: earendil-works/pi, [observability design note](https://github.com/earendil-works/pi/blob/a96fb984d8c8b065fc5d193309fc812a882adee0/packages/agent/docs/observability.md).
[^agentpulse]: AgentPulse, [official repository architecture and hook setup](https://github.com/jstuart0/agentpulse).
[^codex-hooks]: OpenAI, [Codex hooks semantics](https://developers.openai.com/codex/hooks/).
[^codex-otel]: OpenAI, [Codex observability, OTel, and analytics settings](https://developers.openai.com/codex/config-advanced/#observability-and-telemetry).
[^codex-otel-source]: OpenAI Codex, [OTel provider implementation at checked commit](https://github.com/openai/codex/blob/dcc4d7b634e0c732e5dab9ab04b6f3b67bfa55f1/codex-rs/otel/src/provider.rs).
[^otel-batch]: OpenTelemetry, [`BatchSpanProcessor` specification](https://opentelemetry.io/docs/specs/otel/trace/sdk/#batching-processor).
[^otel-genai]: OpenTelemetry, [GenAI attributes and operations](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/).
[^otel-release]: OpenTelemetry, [semantic-conventions releases](https://github.com/open-telemetry/semantic-conventions/releases).
[^mlflow-async]: MLflow, [production async tracing, queue, retry, and drop behavior](https://mlflow.org/docs/latest/genai/tracing/prod-tracing/#asynchronous-trace-logging).
[^langfuse-background]: Langfuse, [background batching and short-lived process flush](https://langfuse.com/docs/observability/data-model#background-processing).
[^phoenix]: Arize Phoenix, [local OTLP collector and SQLite configuration](https://arize.com/docs/phoenix/self-hosting/configuration).
[^agentops]: AgentOps, [SDK tracing and default OTLP endpoint](https://docs.agentops.ai/v2/usage/sdk-reference).
