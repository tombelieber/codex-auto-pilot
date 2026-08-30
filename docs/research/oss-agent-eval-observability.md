# OSS options for Auto Pilot run history and evaluation

_Checked 2026-08-04 against first-party documentation and repositories._

## Decision

Keep a **thin, local-first Auto Pilot collector as the canonical record**, then add an **OTLP/OpenInference export adapter**. Do not make a tracing platform a required runtime dependency yet.

The mature projects solve trace storage, search, dashboards, datasets, and evaluators. None of them currently identifies a `$auto-pilot` invocation, clones the original Codex transcript, understands Auto Pilot's `pr_ready` / `released` / `blocked` contract, or proves Git/PR/release outcomes without an Auto Pilot-specific adapter. Codex already emits opt-in OpenTelemetry logs and metrics for API, token, turn, hook, and tool activity, but its documented export is not a lossless replacement for the persisted session transcript.[^codex-otel]

Recommended boundary:

1. Auto Pilot hooks detect start/finish and preserve the source transcript plus a small versioned manifest locally.
2. Deterministic parsing computes tokens, duration, cache ratio, tools, subagents, compactions, outcome, and repository evidence without an LLM.
3. A later `history export --format otlp` maps each invocation to one trace, model calls/tools/subagents to child spans, and quality results to scores/assessments.
4. Raw transcript stays local by default; exporters send only allow-listed fields unless the user explicitly opts into content export.
5. Semantic or judge-based evaluation remains manual/batched so collection itself costs zero model tokens.

## Comparison

| Option | Maturity and license | Local/self-host and privacy | Agent metrics and evaluation | Codex hook integration | Verdict |
|---|---|---|---|---|---|
| **Arize Phoenix** | Established agent-observability project with tracing, datasets, experiments, and evals; however the current server license is **Elastic License 2.0**, not an OSI-approved open-source license.[^phoenix-repo][^phoenix-license] OpenInference libraries are Apache-2.0.[^openinference] | Best single-user setup here: one local process/container with SQLite by default; PostgreSQL is optional. Self-hosted application data stays in the deployment, UI telemetry can be disabled, and air-gapped mode is documented.[^phoenix-selfhost][^phoenix-privacy] | Traces model LLM, agent, and tool spans; Phoenix derives cost from prompt/completion/cache/reasoning token attributes. It supports deterministic, LLM, and human evaluations plus datasets/experiments.[^phoenix-overview][^phoenix-cost][^phoenix-evals] | **Low-medium** after our collector exists: emit OTLP/HTTP with OpenInference attributes. Phoenix accepts OTLP and has Python/TS clients. It still cannot ingest Codex JSONL losslessly without our converter. | **Best optional local UI/eval backend** if ELv2 is acceptable. Pilot it after the canonical collector, not inside core installation. |
| **MLflow GenAI** | Most institutionally mature option; Linux Foundation ecosystem and Apache-2.0 repository.[^mlflow-repo] | Fully local mode is first-class. A local server uses SQLite and local artifact storage by default; the server is optional for direct local use.[^mlflow-local][^mlflow-architecture] | Captures nested inputs/outputs, latency, token usage, and cost; supports trace search, feedback, datasets, experiments, deterministic/custom scorers, LLM judges, and reusable evaluation of stored production traces. Agent scorers include plan and tool-calling quality, though some scorer APIs are marked experimental.[^mlflow-tracing][^mlflow-token][^mlflow-eval][^mlflow-scorers] | **Medium**: MLflow 3.6+ ingests OTLP/HTTP, but its GenAI stack is Python-heavy and its schema is broader than this small Node CLI needs.[^mlflow-otlp] Preserve raw JSONL as an artifact and send normalized spans separately. | **Best mature Apache-2.0 evaluation platform**, especially if Auto Pilot later becomes a multi-project benchmark program. Too much dependency surface for v1 collection. |
| **Langfuse** | Very mature LLM engineering platform. Core repository code is mostly MIT, with separate enterprise-licensed directories: it is open-core rather than uniformly MIT.[^langfuse-license] | Self-hosting keeps trace content under user control, and its own aggregated deployment telemetry can be disabled. Current self-hosting is operationally heavy: ClickHouse is mandatory, alongside application/worker and supporting services. OSS self-host retention is indefinite by default; the built-in retention feature is enterprise-only.[^langfuse-telemetry][^langfuse-clickhouse][^langfuse-retention] | Strong nested agent/tool/generation traces, arbitrary token categories including cache, cost/latency dashboards, sessions, scores, datasets, experiments, code evaluators, LLM judges, and human annotation.[^langfuse-tracing][^langfuse-token][^langfuse-eval] | **Medium**: good OTLP/API destination and a relevant first-party Claude observability plugin exists, but there is no Codex/Auto Pilot adapter. Full deployment is disproportionate for one local skill.[^langfuse-repo] | **Do not adopt now**. Revisit for team/cloud analytics or if Langfuse is already running elsewhere. |
| **OpenTelemetry + OpenInference / OpenLLMetry** | OTel and OpenInference are Apache-2.0 standards/tooling; OpenLLMetry is a mature Apache-2.0 instrumentation collection.[^otel][^openinference][^openllmetry] | Vendor-neutral and can send to a local collector/backend. OTel provides processors for filtering, hashing, and redaction, but implementers remain responsible for sensitive-data policy. The file-export specification is still development and the collector's file exporter is alpha.[^otel-privacy][^otel-file][^otel-exporters] | Excellent transport and semantic layer, not a history UI or evaluation product. OpenInference covers agent/tool/retrieval/LLM spans. OpenLLMetry instruments supported SDKs but cannot instrument Codex's internal run from an external skill.[^openinference][^openllmetry-privacy] | **Low** for normalized export because Codex already supports user-level OTel configuration and Auto Pilot can emit OTLP. **Insufficient alone** for exact invocation detection, terminal outcome, or original transcript cloning.[^codex-otel] | **Adopt the interface, not the stack**: make OTLP/OpenInference the first export contract while retaining a simpler canonical archive. |
| **AgentPulse** | Closest direct functional match, MIT, but presently very young (the official repo explicitly labels its AI layer experimental).[^agentpulse] | One-command local install uses Bun + SQLite and configures Codex/Claude hooks; observability-only mode is available. Remote relay is optional.[^agentpulse] | Live Codex sessions, prompt/history timeline, tool counts, search, and orchestration. It lacks a mature offline evaluation/dataset system; its AI watcher is experimental and would add model cost.[^agentpulse] | **Lowest** integration effort for general Codex monitoring: it already configures ten Codex lifecycle events asynchronously. It does not scope to `$auto-pilot`, preserve the canonical source JSONL, or evaluate delivery receipts.[^agentpulse] | **Learn from it; do not depend on it yet.** It validates the hook + local SQLite design, but is not mature skill-eval infrastructure. |

## What to adopt now

Adopt three proven ideas, without adopting a server:

- **OTLP-compatible normalized events** for portability. Use stable custom attributes such as `skill.name`, `skill.version`, `skill.invocation_id`, `delivery.mode`, and `delivery.terminal_state`; version the mapping because GenAI conventions continue to evolve.
- **OpenInference-style hierarchy**: one invocation trace, child spans for model/tool/subagent phases, plus explicit token usage and cached/reasoning breakdowns.
- **Evaluation separation**: deterministic collection on every invocation; scheduled cohort analysis and judge scoring only after enough comparable runs exist.

For the first real cohort, store 15-20 runs locally and validate that classification, token accounting, interruption recovery, and terminal-state extraction are accurate. Then build one read-only Phoenix adapter first: Phoenix's SQLite local deployment is the fastest way to gain a trace UI and evaluation experiments. Keep an MLflow adapter as the stronger Apache-2.0 path if the project grows into formal benchmark datasets and regression gates.

Do **not** replace the raw local archive with OTLP. Trace systems optimize normalized observations; the original Codex JSONL is the replay/audit evidence needed when a parser or metric definition changes.

## Source notes

[^codex-otel]: OpenAI, [Codex advanced configuration: observability and telemetry](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry). Codex documents opt-in structured run/tool logs plus token, turn, hook, and tool metrics; prompt content is redacted unless explicitly enabled.
[^phoenix-repo]: Arize AI, [Phoenix repository](https://github.com/Arize-ai/phoenix).
[^phoenix-license]: Arize AI, [Phoenix Elastic License 2.0](https://github.com/Arize-ai/phoenix/blob/main/LICENSE).
[^phoenix-selfhost]: Arize AI, [Phoenix self-hosting](https://arize.com/docs/phoenix/self-hosting/deploying-phoenix).
[^phoenix-privacy]: Arize AI, [Phoenix self-hosted privacy](https://arize.com/docs/phoenix/self-hosting/security/privacy).
[^phoenix-overview]: Arize AI, [What is Phoenix?](https://arize.com/docs/phoenix).
[^phoenix-cost]: Arize AI, [Phoenix cost tracking](https://arize.com/docs/phoenix/tracing/how-to-tracing/cost-tracking).
[^phoenix-evals]: Arize AI, [Phoenix evaluation](https://arize.com/docs/phoenix/evaluation/llm-evals/evaluator-traces).
[^openinference]: Arize AI, [OpenInference repository and specification](https://github.com/Arize-ai/openinference).
[^mlflow-repo]: MLflow, [MLflow repository](https://github.com/mlflow/mlflow).
[^mlflow-local]: MLflow, [Self-hosting overview](https://mlflow.org/docs/latest/self-hosting/index.html).
[^mlflow-architecture]: MLflow, [Architecture overview](https://mlflow.org/docs/latest/self-hosting/architecture/overview/).
[^mlflow-tracing]: MLflow, [LLM tracing and agent observability](https://mlflow.org/docs/latest/genai/tracing).
[^mlflow-token]: MLflow, [Token usage and cost tracking](https://mlflow.org/docs/latest/genai/tracing/token-usage-cost/).
[^mlflow-eval]: MLflow, [Evaluating production traces](https://www.mlflow.org/docs/latest/genai/eval-monitor/running-evaluation/traces/).
[^mlflow-scorers]: MLflow, [GenAI scorer API](https://mlflow.org/docs/latest/api_reference/python_api/mlflow.genai.html).
[^mlflow-otlp]: MLflow, [OTLP trace ingestion](https://mlflow.org/docs/latest/genai/tracing/opentelemetry/ingest-shared/).
[^langfuse-license]: Langfuse, [repository license](https://github.com/langfuse/langfuse/blob/main/LICENSE).
[^langfuse-telemetry]: Langfuse, [self-hosted telemetry](https://langfuse.com/self-hosting/security/telemetry).
[^langfuse-clickhouse]: Langfuse, [self-hosted ClickHouse requirement](https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse).
[^langfuse-retention]: Langfuse, [data retention](https://langfuse.com/docs/administration/data-retention).
[^langfuse-tracing]: Langfuse, [observability and tracing](https://langfuse.com/docs/observability/overview).
[^langfuse-token]: Langfuse, [token and cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking).
[^langfuse-eval]: Langfuse, [evaluation concepts](https://langfuse.com/docs/evaluation/core-concepts).
[^langfuse-repo]: Langfuse, [repository and first-party Claude observability plugin listing](https://github.com/orgs/langfuse/repositories).
[^otel]: OpenTelemetry, [documentation](https://opentelemetry.io/docs/) and [Apache-2.0 specification license](https://github.com/open-telemetry/opentelemetry-specification/blob/main/LICENSE).
[^otel-privacy]: OpenTelemetry, [handling sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/).
[^otel-file]: OpenTelemetry, [OTLP file exporter specification](https://opentelemetry.io/docs/specs/otel/protocol/file-exporter/).
[^otel-exporters]: OpenTelemetry, [Collector exporter stability](https://opentelemetry.io/docs/collector/components/exporter/).
[^openllmetry]: Traceloop, [OpenLLMetry repository](https://github.com/traceloop/openllmetry).
[^openllmetry-privacy]: Traceloop, [OpenLLMetry trace content controls](https://docs.traceloop.com/docs/openllmetry/privacy/traces).
[^agentpulse]: AgentPulse, [official repository, architecture, install modes, hooks, maturity labels, and license](https://github.com/jstuart0/agentpulse).
