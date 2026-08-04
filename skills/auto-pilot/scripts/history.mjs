import {createHash} from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {homedir} from 'node:os'
import {basename, dirname, join} from 'node:path'
import {createInterface} from 'node:readline'

export const AUTO_PILOT_VERSION = '0.3.0'
export const HISTORY_SCHEMA_VERSION = 1
export const DEFAULT_RAW_RETENTION_DAYS = 90

const TOKEN_FIELDS = [
  'input_tokens',
  'cached_input_tokens',
  'cache_write_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'total_tokens',
]
const TERMINAL_STATES = ['pr_ready', 'merged_main', 'released', 'blocked']
const SELECTED_SKILL = /\[\$auto-pilot\]\([^\r\n)]*[/\\]auto-pilot[/\\]SKILL\.md(?:#[^\r\n)]*)?\)/i
const LEADING_SKILL = /^\s*\$auto-pilot(?:\s|$)/i
const TAIL_BYTES = 4 * 1024 * 1024

export function resolveHistoryRoot(env = process.env) {
  return env.CODEX_AUTO_PILOT_DATA || join(homedir(), '.codex-auto-pilot', 'history')
}

export function isAutoPilotInvocation(prompt) {
  if (typeof prompt !== 'string') return false
  return SELECTED_SKILL.test(prompt) || LEADING_SKILL.test(prompt)
}

export async function handleHookEvent(event, options = {}) {
  if (!event || typeof event !== 'object') return {handled: false, reason: 'invalid_event'}
  const dataRoot = options.dataRoot || resolveHistoryRoot(options.env)
  const now = options.now || (() => new Date())

  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      if (!isAutoPilotInvocation(event.prompt)) return {handled: false, reason: 'not_auto_pilot'}
      return startRun(event, {dataRoot, now})
    case 'SubagentStop':
      return archiveSubagent(event, {dataRoot, now})
    case 'Stop':
      return finalizeTurn(event, {dataRoot, now, reason: 'turn_stop'})
    case 'SessionEnd':
      return finalizeSession(event, {dataRoot, now})
    default:
      return {handled: false, reason: 'unsupported_event'}
  }
}

function startRun(event, {dataRoot, now}) {
  requireIds(event)
  ensurePrivateDirectory(dataRoot)
  pruneExpiredRaw(dataRoot, now())
  const directory = runDirectory(dataRoot, event.session_id, event.turn_id)
  ensurePrivateDirectory(directory)
  const transcript = transcriptSnapshot(event.transcript_path)
  const manifest = {
    schema_version: HISTORY_SCHEMA_VERSION,
    auto_pilot_version: AUTO_PILOT_VERSION,
    collector_version: HISTORY_SCHEMA_VERSION,
    skill_sha256: installedSkillHash(),
    run_id: runKey(event.session_id, event.turn_id),
    session_id: event.session_id,
    turn_id: event.turn_id,
    status: 'running',
    terminal_state: null,
    started_at: now().toISOString(),
    ended_at: null,
    cwd: stringOrNull(event.cwd),
    model: stringOrNull(event.model),
    effort: null,
    permission_mode: stringOrNull(event.permission_mode),
    invocation_prompt_sha256: sha256Text(event.prompt),
    transcript_source: stringOrNull(event.transcript_path),
    transcript_start_bytes: transcript.bytes,
    baseline_token_usage: transcript.token_usage,
    raw_retention_days: historyConfig(dataRoot).raw_retention_days,
    raw_pruned_at: null,
  }
  writePrivateJson(join(directory, 'manifest.json'), manifest)
  return {handled: true, action: 'started', run_id: manifest.run_id, directory}
}

async function archiveSubagent(event, {dataRoot, now}) {
  if (!event.session_id || !event.turn_id || !event.agent_id) return {handled: false, reason: 'missing_ids'}
  const directory = runDirectory(dataRoot, event.session_id, event.turn_id)
  if (!existsSync(join(directory, 'manifest.json'))) return {handled: false, reason: 'run_not_active'}
  if (!regularFile(event.agent_transcript_path)) return {handled: false, reason: 'missing_transcript'}

  const agents = join(directory, 'agents')
  ensurePrivateDirectory(agents)
  const key = safeSegment(event.agent_id)
  const destination = join(agents, `${key}.jsonl`)
  copyPrivateFile(event.agent_transcript_path, destination)
  const metadata = {
    schema_version: HISTORY_SCHEMA_VERSION,
    agent_id: event.agent_id,
    agent_type: stringOrNull(event.agent_type),
    archived_at: now().toISOString(),
    transcript_bytes: statSync(destination).size,
    transcript_sha256: await sha256File(destination),
  }
  writePrivateJson(join(agents, `${key}.json`), metadata)
  return {handled: true, action: 'subagent_archived', agent_id: event.agent_id}
}

async function finalizeTurn(event, context) {
  if (!event.session_id || !event.turn_id) return {handled: false, reason: 'missing_ids'}
  const directory = runDirectory(context.dataRoot, event.session_id, event.turn_id)
  if (!existsSync(join(directory, 'manifest.json'))) return {handled: false, reason: 'run_not_active'}
  return finalizeRun(directory, event, context)
}

async function finalizeSession(event, context) {
  if (!event.session_id || !existsSync(runsRoot(context.dataRoot))) return {handled: false, reason: 'run_not_active'}
  const results = []
  for (const directory of runDirectories(context.dataRoot)) {
    const manifest = readJson(join(directory, 'manifest.json'))
    if (manifest?.session_id !== event.session_id || manifest.status !== 'running') continue
    results.push(await finalizeRun(directory, event, {...context, reason: 'session_end'}))
  }
  return results.length ? {handled: true, action: 'session_recovered', runs: results.length} : {handled: false, reason: 'run_not_active'}
}

async function finalizeRun(directory, event, {now, reason}) {
  const manifestPath = join(directory, 'manifest.json')
  const manifest = readJson(manifestPath)
  if (!manifest) return {handled: false, reason: 'missing_manifest'}
  if (manifest.status === 'finished' && reason !== 'session_end') return {handled: true, action: 'already_finished', run_id: manifest.run_id}

  const transcriptPath = regularFile(event.transcript_path) ? event.transcript_path : manifest.transcript_source
  let archived = null
  let parsed = emptyParsedMetrics()
  if (regularFile(transcriptPath)) {
    const destination = join(directory, 'transcript.jsonl')
    copyPrivateFile(transcriptPath, destination)
    archived = {
      bytes: statSync(destination).size,
      sha256: await sha256File(destination),
    }
    parsed = await parseTranscriptSegment(destination, manifest.transcript_start_bytes || 0, manifest.turn_id)
  }

  const endedAt = now()
  const tokenUsage = subtractTokenUsage(parsed.latest_total_token_usage, manifest.baseline_token_usage)
  const agentMetadata = listAgentMetadata(directory)
  const terminalState = detectTerminalState(event.last_assistant_message)
  const metrics = {
    schema_version: HISTORY_SCHEMA_VERSION,
    run_id: manifest.run_id,
    duration_ms: Math.max(0, endedAt.getTime() - Date.parse(manifest.started_at)),
    model: parsed.model || manifest.model,
    effort: parsed.effort || manifest.effort,
    collection_complete: Boolean(archived && parsed.token_usage_observed),
    token_usage_observed: parsed.token_usage_observed,
    token_counter_reset: tokenCounterReset(parsed.latest_total_token_usage, manifest.baseline_token_usage),
    token_usage: {
      ...tokenUsage,
      uncached_input_tokens: Math.max(0, (tokenUsage.input_tokens || 0) - (tokenUsage.cached_input_tokens || 0)),
    },
    tool_calls: parsed.tool_calls,
    tools: parsed.tools,
    compactions: parsed.compactions,
    parse_errors: parsed.parse_errors,
    subagents: agentMetadata.length,
    subagent_types: countValues(agentMetadata.map((item) => item.agent_type).filter(Boolean)),
    transcript_bytes: archived?.bytes || 0,
    transcript_sha256: archived?.sha256 || null,
  }
  writePrivateJson(join(directory, 'metrics.json'), metrics)

  const outcome = {
    schema_version: HISTORY_SCHEMA_VERSION,
    run_id: manifest.run_id,
    terminal_state: terminalState,
    collection_reason: reason,
    ended_at: endedAt.toISOString(),
    last_assistant_message_sha256: sha256Text(event.last_assistant_message),
  }
  writePrivateJson(join(directory, 'outcome.json'), outcome)
  writePrivateJson(manifestPath, {
    ...manifest,
    status: 'finished',
    terminal_state: terminalState,
    ended_at: endedAt.toISOString(),
    model: metrics.model,
    effort: metrics.effort,
  })
  return {handled: true, action: 'finished', run_id: manifest.run_id, terminal_state: terminalState}
}

export function historyConfig(dataRoot = resolveHistoryRoot()) {
  const configured = readJson(join(dataRoot, 'config.json'))
  return {
    schema_version: HISTORY_SCHEMA_VERSION,
    raw_retention_days: configured?.raw_retention_days === null
      ? null
      : positiveInteger(configured?.raw_retention_days) || DEFAULT_RAW_RETENTION_DAYS,
  }
}

export function setRawRetention(value, dataRoot = resolveHistoryRoot()) {
  const days = value === 'forever' || value === null ? null : positiveInteger(Number(value))
  if (days === undefined) throw new Error('retention must be a positive day count or forever')
  ensurePrivateDirectory(dataRoot)
  const config = {schema_version: HISTORY_SCHEMA_VERSION, raw_retention_days: days}
  writePrivateJson(join(dataRoot, 'config.json'), config)
  return config
}

export function pruneExpiredRaw(dataRoot = resolveHistoryRoot(), now = new Date()) {
  const retention = historyConfig(dataRoot).raw_retention_days
  if (retention === null || !existsSync(runsRoot(dataRoot))) return {pruned_runs: 0, pruned_files: 0}
  const cutoff = now.getTime() - retention * 24 * 60 * 60 * 1000
  let prunedRuns = 0
  let prunedFiles = 0
  for (const directory of runDirectories(dataRoot)) {
    const manifestPath = join(directory, 'manifest.json')
    const manifest = readJson(manifestPath)
    const reference = Date.parse(manifest?.ended_at || manifest?.started_at || '')
    if (!Number.isFinite(reference) || reference >= cutoff || manifest?.raw_pruned_at) continue
    for (const path of rawTranscriptPaths(directory)) {
      rmSync(path, {force: true})
      prunedFiles += 1
    }
    writePrivateJson(manifestPath, {...manifest, raw_pruned_at: now.toISOString()})
    prunedRuns += 1
  }
  return {pruned_runs: prunedRuns, pruned_files: prunedFiles}
}

export function historyStatus(dataRoot = resolveHistoryRoot()) {
  const runs = loadRuns(dataRoot)
  const rawBytes = runs.reduce((sum, run) => sum + rawTranscriptPaths(run.directory).reduce((size, path) => size + statSync(path).size, 0), 0)
  return {
    data_root: dataRoot,
    retention: historyConfig(dataRoot).raw_retention_days,
    runs: runs.length,
    running: runs.filter((run) => run.manifest.status === 'running').length,
    finished: runs.filter((run) => run.manifest.status === 'finished').length,
    raw_bytes: rawBytes,
  }
}

export function historyRuns({dataRoot = resolveHistoryRoot(), sinceDays = null} = {}) {
  const cutoff = sinceDays ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : null
  return loadRuns(dataRoot)
    .filter((run) => !cutoff || Date.parse(run.manifest.started_at) >= cutoff)
    .map((run) => ({
      run_id: run.manifest.run_id,
      started_at: run.manifest.started_at,
      duration_ms: run.metrics?.duration_ms ?? null,
      model: run.metrics?.model ?? run.manifest.model,
      effort: run.metrics?.effort ?? run.manifest.effort,
      terminal_state: run.manifest.terminal_state,
      total_tokens: run.metrics?.token_usage_observed === false ? null : (run.metrics?.token_usage?.total_tokens ?? null),
      cached_input_tokens: run.metrics?.token_usage?.cached_input_tokens ?? null,
      tool_calls: run.metrics?.tool_calls ?? null,
      subagents: run.metrics?.subagents ?? null,
    }))
    .sort((left, right) => left.started_at.localeCompare(right.started_at))
}

export function historyReport(options = {}) {
  const runs = historyRuns(options).filter((run) => Number.isFinite(run.total_tokens))
  const totals = runs.map((run) => run.total_tokens).sort((a, b) => a - b)
  const medianTokens = percentile(totals, 0.5)
  const threshold = medianTokens === null ? null : medianTokens * 2
  return {
    runs: runs.length,
    terminal_states: countValues(runs.map((run) => run.terminal_state || 'unknown')),
    total_tokens: totals.reduce((sum, value) => sum + value, 0),
    median_tokens: medianTokens,
    p95_tokens: percentile(totals, 0.95),
    max_tokens: totals.length ? totals.at(-1) : null,
    median_duration_ms: percentile(runs.map((run) => run.duration_ms).filter(Number.isFinite).sort((a, b) => a - b), 0.5),
    outliers: threshold === null ? [] : runs.filter((run) => run.total_tokens > threshold).map((run) => run.run_id),
  }
}

function loadRuns(dataRoot) {
  return runDirectories(dataRoot).map((directory) => ({
    directory,
    manifest: readJson(join(directory, 'manifest.json')),
    metrics: readJson(join(directory, 'metrics.json')),
  })).filter((run) => run.manifest)
}

async function parseTranscriptSegment(path, requestedStart, turnId) {
  const parsed = emptyParsedMetrics()
  const size = statSync(path).size
  const start = Number.isFinite(requestedStart) && requestedStart >= 0 && requestedStart <= size ? requestedStart : 0
  const stream = createReadStream(path, {encoding: 'utf8', start})
  const lines = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of lines) {
    if (!line.trim()) continue
    let event
    try { event = JSON.parse(line) } catch { parsed.parse_errors += 1; continue }
    if (event.type === 'event_msg' && event.payload?.type === 'token_count') {
      parsed.latest_total_token_usage = normalizeTokenUsage(event.payload.info?.total_token_usage)
      parsed.token_usage_observed = true
    }
    if (event.type === 'turn_context' && (!turnId || event.payload?.turn_id === turnId)) {
      parsed.model = stringOrNull(event.payload?.model) || parsed.model
      parsed.effort = stringOrNull(event.payload?.effort) || parsed.effort
    }
    if (event.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(event.payload?.type)) {
      parsed.tool_calls += 1
      const name = event.payload?.name || event.payload?.namespace || 'unknown'
      parsed.tools[name] = (parsed.tools[name] || 0) + 1
    }
    if (event.type === 'event_msg' && event.payload?.type === 'context_compacted') parsed.compactions += 1
  }
  return parsed
}

function transcriptSnapshot(path) {
  if (!regularFile(path)) return {bytes: 0, token_usage: zeroTokenUsage()}
  const stats = statSync(path)
  const bytesToRead = Math.min(stats.size, TAIL_BYTES)
  const start = stats.size - bytesToRead
  const descriptor = openSync(path, 'r')
  const buffer = Buffer.alloc(bytesToRead)
  try { readSync(descriptor, buffer, 0, bytesToRead, start) } finally { closeSync(descriptor) }
  const text = buffer.toString('utf8')
  const lines = text.split(/\r?\n/)
  if (start > 0) lines.shift()
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const event = JSON.parse(lines[index])
      if (event.type === 'event_msg' && event.payload?.type === 'token_count') {
        return {bytes: stats.size, token_usage: normalizeTokenUsage(event.payload.info?.total_token_usage)}
      }
    } catch {}
  }
  return {bytes: stats.size, token_usage: zeroTokenUsage()}
}

function detectTerminalState(message) {
  if (typeof message !== 'string') return 'unknown'
  for (const state of TERMINAL_STATES) {
    if (new RegExp(`(?:^|[^a-z_])${state}(?:$|[^a-z_])`, 'i').test(message)) return state
  }
  return 'unknown'
}

function listAgentMetadata(directory) {
  const agents = join(directory, 'agents')
  if (!existsSync(agents)) return []
  return readdirSync(agents).filter((name) => name.endsWith('.json')).map((name) => readJson(join(agents, name))).filter(Boolean)
}

function rawTranscriptPaths(directory) {
  const paths = []
  const root = join(directory, 'transcript.jsonl')
  if (regularFile(root)) paths.push(root)
  const agents = join(directory, 'agents')
  if (existsSync(agents) && lstatSync(agents).isDirectory()) {
    for (const name of readdirSync(agents)) {
      const path = join(agents, name)
      if (name.endsWith('.jsonl') && regularFile(path)) paths.push(path)
    }
  }
  return paths
}

function runDirectories(dataRoot) {
  const root = runsRoot(dataRoot)
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return []
  return readdirSync(root).map((name) => join(root, name)).filter((path) => lstatSync(path).isDirectory())
}

function runsRoot(dataRoot) { return join(dataRoot, 'runs') }
function runDirectory(dataRoot, sessionId, turnId) { return join(runsRoot(dataRoot), runKey(sessionId, turnId)) }
function runKey(sessionId, turnId) { return `${safeSegment(sessionId)}--${safeSegment(turnId)}` }
function safeSegment(value) { return String(value || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) }

function requireIds(event) {
  if (!event.session_id || !event.turn_id) throw new Error('hook event is missing session_id or turn_id')
}

function regularFile(path) {
  if (!path || !existsSync(path)) return false
  const stats = lstatSync(path)
  return stats.isFile() && !stats.isSymbolicLink()
}

function ensurePrivateDirectory(path) {
  if (existsSync(path)) {
    const stats = lstatSync(path)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`refusing unsafe history directory: ${path}`)
  } else {
    const parent = dirname(path)
    if (existsSync(parent)) {
      const parentStats = lstatSync(parent)
      if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) throw new Error(`refusing unsafe history parent: ${parent}`)
    }
  }
  mkdirSync(path, {recursive: true, mode: 0o700})
  try { chmodSync(path, 0o700) } catch {}
}

function writePrivateJson(path, value) {
  ensurePrivateDirectory(dirname(path))
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600})
  renameSync(temporary, path)
  try { chmodSync(path, 0o600) } catch {}
}

function copyPrivateFile(source, destination) {
  ensurePrivateDirectory(dirname(destination))
  const temporary = join(dirname(destination), `.${basename(destination)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`)
  copyFileSync(source, temporary)
  try { chmodSync(temporary, 0o600) } catch {}
  renameSync(temporary, destination)
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function sha256Text(value) {
  return typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : null
}

function normalizeTokenUsage(value) {
  const result = {}
  for (const field of TOKEN_FIELDS) result[field] = nonNegativeNumber(value?.[field])
  return result
}

function subtractTokenUsage(latest, baseline) {
  const result = {}
  for (const field of TOKEN_FIELDS) result[field] = Math.max(0, nonNegativeNumber(latest?.[field]) - nonNegativeNumber(baseline?.[field]))
  return result
}

function zeroTokenUsage() { return normalizeTokenUsage(null) }
function nonNegativeNumber(value) { return Number.isFinite(value) && value >= 0 ? value : 0 }
function stringOrNull(value) { return typeof value === 'string' && value ? value : null }
function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : undefined }

function emptyParsedMetrics() {
  return {latest_total_token_usage: zeroTokenUsage(), token_usage_observed: false, model: null, effort: null, tool_calls: 0, tools: {}, compactions: 0, parse_errors: 0}
}

function tokenCounterReset(latest, baseline) {
  return TOKEN_FIELDS.some((field) => nonNegativeNumber(latest?.[field]) < nonNegativeNumber(baseline?.[field]))
}

function installedSkillHash() {
  try { return createHash('sha256').update(readFileSync(new URL('../SKILL.md', import.meta.url))).digest('hex') } catch { return null }
}

function countValues(values) {
  return values.reduce((counts, value) => ({...counts, [value]: (counts[value] || 0) + 1}), {})
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]
}
