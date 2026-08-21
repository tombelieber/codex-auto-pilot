import assert from 'node:assert/strict'
import {appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {parseCodexTranscript} from '../skills/auto-pilot/scripts/history-materialize.mjs'
import {
  handleHookEvent,
  historyReport,
  historyGoals,
  historyRuns,
  isAutoPilotInvocation,
  parseAutoPilotInvocation,
  materializeHistory,
  pruneExpiredRaw,
  setRawRetention,
} from '../skills/auto-pilot/scripts/history.mjs'

function jsonl(...events) { return `${events.map((event) => JSON.stringify(event)).join('\n')}\n` }
function tokens(input, cached, output, reasoning, total) {
  return {type: 'event_msg', payload: {type: 'token_count', info: {total_token_usage: {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: total,
  }}}}
}

function assistantMessage(text) {
  return {type: 'response_item', payload: {type: 'message', role: 'assistant', content: [{type: 'output_text', text}]}}
}

function validPrReceipt() {
  return {
    schema_version: 7,
    mode: 'pr',
    terminal_state: 'pr_ready',
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'Implemented and verified the approved scope.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: ['a'.repeat(40)]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'Exact acceptance path passed'}],
    checks: [{name: 'test', status: 'passed', evidence: 'Bounded command artifact'}],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: 'open', merged: false, merge_sha: null},
    release: {status: 'not_requested', url: null, notes_url: null, message: null, evidence: 'PR stage; production was not changed'},
    blockers: [],
  }
}

function routingMarker(implementation, continuation) {
  return `<!-- auto-pilot-routing: ${JSON.stringify({implementation, continuation})} -->`
}

function independentImplementation(taskRef = 'implementation-task') {
  return {
    lane: 'independent_task', task_ref: taskRef, worktree: true,
    model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null,
  }
}

test('invocation detection accepts selected or leading skills without matching discussion', () => {
  assert.equal(isAutoPilotInvocation('[$auto-pilot](/opt/skills/auto-pilot/SKILL.md) pr docs/plan.md'), true)
  assert.equal(isAutoPilotInvocation('$auto-pilot pr docs/plan.md'), true)
  assert.equal(parseAutoPilotInvocation('$auto-pilot release PR #42').mode, 'release')
  assert.equal(parseAutoPilotInvocation('$auto-pilot release PR #42').continuation, null)
  assert.deepEqual(parseAutoPilotInvocation('$auto-pilot ship docs/plan.md'), {
    mode: 'pr', continuation: 'release', invocation_source: 'leading_command', explicit_subcommand: 'ship', goal_id: null,
  })
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md <!-- auto-pilot-goal: apg_123456789abc -->').goal_id, 'apg_123456789abc')
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md --then-release').continuation, 'release')
  assert.equal(parseAutoPilotInvocation('$auto-pilot docs/plan.md. Finish it and release it to production.').continuation, 'release')
  assert.equal(parseAutoPilotInvocation('$auto-pilot docs/plan.md，完成之後直接上線').continuation, 'release')
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md. Do not release or deploy.').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md. When can we release?').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md. We may release this later.').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md. "Finish and release it" is an example.').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md 完成之後可唔可以上線').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md 完成後是否可以發佈').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md 完成後上線？').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md “完成後上線”只係例子').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md 完成之後希望上線').continuation, null)
  assert.equal(parseAutoPilotInvocation('$auto-pilot docs/plan.md?template=1. Finish and release it.').continuation, 'release')
  assert.equal(parseAutoPilotInvocation('$auto-pilot ship docs/plan.md?template=1').continuation, 'release')
  assert.equal(isAutoPilotInvocation('Can $auto-pilot collect history automatically?'), false)
  assert.equal(isAutoPilotInvocation('Can we improve [$auto-pilot](/opt/skills/auto-pilot/SKILL.md) token usage?'), false)
  assert.equal(isAutoPilotInvocation('[$auto-pilot](/opt/skills/auto-pilot/SKILL.md) do not start; only confirm readiness'), false)
  assert.equal(isAutoPilotInvocation('[$auto-pilot](/opt/skills/auto-pilot/SKILL.md) 我想優化這個 skill'), false)
})

test('post-hoc parser uses last-token increments and survives duplicates and compaction resets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-parser-'))
  const transcript = join(root, 'run.jsonl')
  try {
    writeFileSync(transcript, jsonl({
      type: 'event_msg', payload: {type: 'token_count', info: {
        total_token_usage: {input_tokens: 100, cached_input_tokens: 80, output_tokens: 10},
        last_token_usage: {input_tokens: 100, cached_input_tokens: 80, output_tokens: 10},
      }},
    }))
    const startBytes = statSync(transcript).size
    appendFileSync(transcript, jsonl(
      {type: 'event_msg', payload: {type: 'token_count', info: {
        total_token_usage: {input_tokens: 110, cached_input_tokens: 85, output_tokens: 12},
        last_token_usage: {input_tokens: 10, cached_input_tokens: 5, output_tokens: 2},
      }}},
      {type: 'event_msg', payload: {type: 'token_count', info: {
        total_token_usage: {input_tokens: 110, cached_input_tokens: 85, output_tokens: 12},
        last_token_usage: {input_tokens: 10, cached_input_tokens: 5, output_tokens: 2},
      }}},
      {type: 'compacted', payload: {}},
      {type: 'event_msg', payload: {type: 'token_count', info: {
        total_token_usage: {input_tokens: 5, cached_input_tokens: 2, output_tokens: 1},
        last_token_usage: {input_tokens: 5, cached_input_tokens: 2, output_tokens: 1},
      }}},
      {type: 'event_msg', payload: {type: 'token_count', info: {
        total_token_usage: {input_tokens: 0, output_tokens: 0, total_tokens: 99},
        last_token_usage: {input_tokens: 0, output_tokens: 0, total_tokens: 99},
      }}},
    ))
    const parsed = await parseCodexTranscript(transcript, {startBytes})
    assert.deepEqual(parsed.token_usage, {
      input_tokens: 15, cached_input_tokens: 7, cache_write_input_tokens: 0,
      output_tokens: 3, reasoning_output_tokens: 0, total_tokens: 18,
    })
    assert.equal(parsed.compactions, 1)
    assert.equal(parsed.token_counter_reset, true)
    assert.equal(parsed.parse_errors, 0)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('materializer follows a Codex transcript moved to archived_sessions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-archived-'))
  const dataRoot = join(root, 'data')
  const sessions = join(root, '.codex', 'sessions', '2026', '08', '21')
  const archived = join(root, '.codex', 'archived_sessions')
  const transcript = join(sessions, 'rollout-test.jsonl')
  try {
    mkdirSync(sessions, {recursive: true})
    mkdirSync(archived, {recursive: true})
    writeFileSync(transcript, jsonl(tokens(10, 0, 1, 0, 11)))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'archived-session', turn_id: 'archived-turn',
      prompt: '$auto-pilot pr docs/plan.md', transcript_path: transcript,
    }, {dataRoot})
    const message = 'No receipt for this parser fixture.'
    appendFileSync(transcript, jsonl(tokens(20, 0, 2, 0, 22), assistantMessage(message)))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'archived-session', turn_id: 'archived-turn',
      transcript_path: transcript, last_assistant_message: message,
    }, {dataRoot})
    renameSync(transcript, join(archived, 'rollout-test.jsonl'))
    await materializeHistory({dataRoot})
    const metrics = JSON.parse(readFileSync(join(dataRoot, 'runs', 'archived-session--archived-turn', 'metrics.json'), 'utf8'))
    assert.equal(metrics.transcript_source_location, 'archived_sibling')
    assert.equal(metrics.token_usage.total_tokens, 11)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('hooks archive one complete root and subagent run with deterministic metrics', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-'))
  const dataRoot = join(root, 'data')
  const transcript = join(root, 'root.jsonl')
  const agentTranscript = join(root, 'agent.jsonl')
  const session = 'session-1'
  const turn = 'turn-1'
  const start = new Date('2026-08-04T00:00:00.000Z')
  const finish = new Date('2026-08-04T00:02:00.000Z')
  const env = {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing-config.json')}
  try {
    writeFileSync(transcript, jsonl(tokens(100, 80, 10, 5, 110)))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: session, turn_id: turn,
      prompt: '[$auto-pilot](/opt/skills/auto-pilot/SKILL.md) ship docs/plan.md',
      transcript_path: transcript, cwd: '/repo', model: 'gpt-5.6-sol', permission_mode: 'dontAsk',
    }, {dataRoot, env, now: () => start})

    appendFileSync(transcript, jsonl(
      {type: 'turn_context', payload: {turn_id: turn, model: 'gpt-5.6-sol', effort: 'high'}},
      {type: 'response_item', payload: {type: 'function_call', name: 'exec_command'}},
      {type: 'response_item', payload: {type: 'custom_tool_call', name: 'exec'}},
      {type: 'event_msg', payload: {type: 'context_compacted'}},
      tokens(250, 180, 30, 15, 280),
    ))
    writeFileSync(agentTranscript, jsonl(
      {type: 'turn_context', payload: {model: 'gpt-5.6-luna', effort: 'max'}},
      tokens(80, 50, 10, 5, 90),
    ))
    await handleHookEvent({
      hook_event_name: 'SubagentStop', session_id: session, turn_id: turn,
      agent_id: 'agent-1', agent_type: 'worker', agent_transcript_path: agentTranscript,
    }, {dataRoot, now: () => finish})
    const receipt = join(root, 'receipt.json')
    writeFileSync(receipt, JSON.stringify(validPrReceipt()))
    const finalMessage = `Complete.
::created-thread{threadId="implementation-task"}
::created-thread{threadId="release-task"}
${routingMarker(independentImplementation(), {
  lane: 'fresh_release_task', task_ref: 'release-task', worktree: true,
  model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null,
})}
<!-- auto-pilot-receipt: ${receipt} -->`
    appendFileSync(transcript, jsonl(assistantMessage(finalMessage)))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: session, turn_id: turn,
      transcript_path: transcript,
      last_assistant_message: finalMessage,
    }, {dataRoot, now: () => finish})

    const run = join(dataRoot, 'runs', `${session}--${turn}`)
    const pending = JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8'))
    assert.equal(pending.status, 'pending_materialization')
    assert.equal(existsSync(join(run, 'metrics.json')), false)
    await materializeHistory({dataRoot})
    const manifest = JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8'))
    const metrics = JSON.parse(readFileSync(join(run, 'metrics.json'), 'utf8'))
    assert.equal(manifest.status, 'finished')
    assert.equal(manifest.schema_version, 4)
    assert.equal(manifest.terminal_state, 'pr_ready')
    assert.equal(manifest.mode, 'pr')
    assert.equal(manifest.continuation, 'release')
    assert.deepEqual(manifest.routing_config.implementation, {
      substantive_executor: 'auto', model: 'gpt-5.6-sol', thinking: 'xhigh',
    })
    assert.match(manifest.skill_bundle_sha256, /^[a-f0-9]{64}$/)
    assert.ok(Object.keys(manifest.skill_bundle_files).includes('SKILL.md'))
    assert.equal(existsSync(join(dataRoot, 'versions', manifest.skill_bundle_sha256, 'bundle', 'SKILL.md')), true)
    assert.equal(metrics.duration_ms, 120000)
    assert.equal(metrics.collection_complete, true)
    assert.equal(metrics.token_usage_observed, true)
    assert.equal(metrics.token_counter_reset, false)
    assert.deepEqual(metrics.token_usage, {
      input_tokens: 150, cached_input_tokens: 100, cache_write_input_tokens: 0,
      output_tokens: 20, reasoning_output_tokens: 10, total_tokens: 170, uncached_input_tokens: 50,
    })
    assert.equal(metrics.tool_calls, 2)
    assert.deepEqual(metrics.tools, {exec_command: 1, exec: 1})
    assert.equal(metrics.compactions, 1)
    assert.equal(metrics.subagents, 1)
    assert.deepEqual(metrics.subagent_models, {'gpt-5.6-luna': 1})
    assert.deepEqual(metrics.subagent_efforts, {max: 1})
    assert.equal(metrics.effort, 'high')
    assert.equal(metrics.routing.status, 'passed')
    assert.equal(metrics.routing.schema_version, 2)
    assert.match(metrics.routing.unverified.join('\n'), /parent-child delegation depth/)
    assert.equal(existsSync(join(run, 'transcript.jsonl')), false)
    assert.equal(existsSync(join(run, 'agents', 'agent-1.marker.json')), true)
    if (process.platform !== 'win32') {
      assert.equal(statSync(run).mode & 0o777, 0o700)
      assert.equal(statSync(join(run, 'terminal.json')).mode & 0o777, 0o600)
    }
    assert.equal((await historyRuns({dataRoot})).length, 1)
    assert.equal((await historyReport({dataRoot})).total_tokens, 170)
    assert.equal((await historyReport({dataRoot})).benchmark_runs, 0)
    assert.deepEqual((await historyReport({dataRoot})).continuations, {release: 1})
    assert.deepEqual((await historyReport({dataRoot})).orchestration_statuses, {passed: 1})
    assert.equal((await historyGoals({dataRoot}))[0].lineage_status, 'single_run')
    assert.equal(JSON.parse(readFileSync(join(run, 'outcome.json'), 'utf8')).completion_receipt.status, 'valid')
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('a valid v7 receipt remains valid when routing metadata is missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-routing-unknown-'))
  const dataRoot = join(root, 'data')
  const transcript = join(root, 'root.jsonl')
  const receipt = join(root, 'receipt.json')
  try {
    writeFileSync(transcript, jsonl(tokens(10, 0, 1, 0, 11)))
    writeFileSync(receipt, JSON.stringify(validPrReceipt()))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-routing-unknown', turn_id: 'turn-routing-unknown',
      prompt: '$auto-pilot pr docs/plan.md', transcript_path: transcript,
    }, {dataRoot, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing-config.json')}})
    const message = `<!-- auto-pilot-receipt: ${receipt} -->`
    appendFileSync(transcript, jsonl(assistantMessage(message)))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'session-routing-unknown', turn_id: 'turn-routing-unknown',
      transcript_path: transcript, last_assistant_message: message,
    }, {dataRoot})
    await materializeHistory({dataRoot})
    const run = join(dataRoot, 'runs', 'session-routing-unknown--turn-routing-unknown')
    const outcome = JSON.parse(readFileSync(join(run, 'outcome.json'), 'utf8'))
    const metrics = JSON.parse(readFileSync(join(run, 'metrics.json'), 'utf8'))
    assert.equal(outcome.completion_receipt.status, 'valid')
    assert.equal(outcome.terminal_state, 'pr_ready')
    assert.equal(metrics.routing.status, 'unknown')
    assert.equal((await historyRuns({dataRoot}))[0].orchestration_status, 'unknown')
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('schema-v2 history remains reportable after the v4 materializer upgrade', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-v2-'))
  const dataRoot = join(root, 'data')
  const run = join(dataRoot, 'runs', 'legacy-session--legacy-turn')
  try {
    mkdirSync(run, {recursive: true})
    writeFileSync(join(run, 'manifest.json'), JSON.stringify({
      schema_version: 2,
      run_id: 'legacy-session--legacy-turn',
      status: 'finished',
      started_at: '2026-08-01T00:00:00.000Z',
      auto_pilot_version: '0.7.0',
      mode: 'pr',
      continuation: null,
      terminal_state: 'pr_ready',
    }))
    writeFileSync(join(run, 'metrics.json'), JSON.stringify({
      schema_version: 2,
      duration_ms: 10,
      token_usage_observed: true,
      token_usage: {total_tokens: 12, cached_input_tokens: 4},
      tool_calls: 1,
      subagents: 0,
    }))
    writeFileSync(join(run, 'outcome.json'), JSON.stringify({completion_receipt: {status: 'valid'}}))
    const runs = await historyRuns({dataRoot})
    assert.equal(runs.length, 1)
    assert.equal(runs[0].total_tokens, 12)
    assert.equal(runs[0].orchestration_status, 'legacy_unobserved')
    assert.deepEqual((await historyReport({dataRoot})).orchestration_statuses, {legacy_unobserved: 1})
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('goal aggregation links only two-sided fresh-stage breadcrumbs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-goals-'))
  const dataRoot = join(root, 'data')
  const goalId = 'apg_123456789abc'
  try {
    for (const [index, source] of ['routing_marker', 'invocation_marker'].entries()) {
      const runId = `session-${index}--turn-${index}`
      const run = join(dataRoot, 'runs', runId)
      mkdirSync(run, {recursive: true})
      writeFileSync(join(run, 'manifest.json'), JSON.stringify({
        schema_version: 4, run_id: runId, status: 'finished',
        started_at: `2026-08-01T00:0${index}:00.000Z`,
        ended_at: `2026-08-01T00:0${index + 1}:00.000Z`,
        goal_id: goalId, goal_id_source: source, goal_id_sources: [source],
        terminal_state: 'pr_ready', mode: 'pr',
      }))
      writeFileSync(join(run, 'metrics.json'), JSON.stringify({
        duration_ms: 60000, token_usage_observed: true, collection_complete: true,
        token_usage: {total_tokens: 100 + index, cached_input_tokens: 10},
        tool_calls: 2, compactions: index, subagents: 0,
        topology: {max_observed_depth: 0}, routing: {status: 'passed'},
      }))
      writeFileSync(join(run, 'outcome.json'), JSON.stringify({completion_receipt: {status: 'valid'}}))
    }
    const goals = await historyGoals({dataRoot})
    assert.equal(goals.length, 1)
    assert.equal(goals[0].lineage_status, 'linked')
    assert.equal(goals[0].total_tokens, 201)
    assert.equal(goals[0].active_duration_ms, 120000)
    assert.equal(goals[0].benchmark_eligible, true)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('session end recovers an unfinished invocation and retention removes only raw history', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-recovery-'))
  const dataRoot = join(root, 'data')
  const transcript = join(root, 'root.jsonl')
  const start = new Date('2026-01-01T00:00:00.000Z')
  const finish = new Date('2026-01-01T00:01:00.000Z')
  try {
    writeFileSync(transcript, jsonl(tokens(10, 0, 1, 0, 11), tokens(20, 0, 2, 0, 22)))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-2', turn_id: 'turn-2',
      prompt: '$auto-pilot docs/plan.md', transcript_path: transcript,
    }, {dataRoot, now: () => start})
    appendFileSync(transcript, jsonl(tokens(30, 0, 3, 0, 33)))
    await handleHookEvent({hook_event_name: 'SessionEnd', session_id: 'session-2', transcript_path: transcript}, {dataRoot, now: () => finish})
    const run = join(dataRoot, 'runs', 'session-2--turn-2')
    await materializeHistory({dataRoot, now: () => finish})
    assert.equal(JSON.parse(readFileSync(join(run, 'outcome.json'), 'utf8')).collection_reason, 'session_end')
    setRawRetention(1, dataRoot)
    const result = pruneExpiredRaw(dataRoot, new Date('2026-01-03T00:00:00.000Z'))
    assert.deepEqual(result, {pruned_runs: 1, pruned_files: 0})
    assert.equal(readFileSync(join(run, 'metrics.json'), 'utf8').includes('total_tokens'), true)
    assert.equal(JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8')).raw_pruned_at, '2026-01-03T00:00:00.000Z')
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('final-message keywords cannot create a verified terminal state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-keywords-'))
  const dataRoot = join(root, 'data')
  const transcript = join(root, 'root.jsonl')
  try {
    writeFileSync(transcript, jsonl(tokens(10, 0, 1, 0, 11)))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-keywords', turn_id: 'turn-keywords',
      prompt: '$auto-pilot release PR #42', transcript_path: transcript,
    }, {dataRoot})
    const message = 'Discussion only: released, pr_ready, blocked.'
    appendFileSync(transcript, jsonl(assistantMessage(message)))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'session-keywords', turn_id: 'turn-keywords',
      transcript_path: transcript, last_assistant_message: message,
    }, {dataRoot})
    const run = join(dataRoot, 'runs', 'session-keywords--turn-keywords')
    await materializeHistory({dataRoot})
    assert.equal(JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8')).terminal_state, 'unknown')
    assert.equal(JSON.parse(readFileSync(join(run, 'outcome.json'), 'utf8')).completion_receipt.status, 'missing')
    assert.equal((await historyReport({dataRoot})).benchmark_runs, 0)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('receipt mode must match the invocation stage', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-mode-'))
  const dataRoot = join(root, 'data')
  const transcript = join(root, 'root.jsonl')
  const receipt = join(root, 'receipt.json')
  try {
    writeFileSync(transcript, jsonl(tokens(10, 0, 1, 0, 11)))
    writeFileSync(receipt, JSON.stringify(validPrReceipt()))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-mode', turn_id: 'turn-mode',
      prompt: '$auto-pilot release PR #42', transcript_path: transcript,
    }, {dataRoot})
    const message = `<!-- auto-pilot-receipt: ${receipt} -->`
    appendFileSync(transcript, jsonl(assistantMessage(message)))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'session-mode', turn_id: 'turn-mode',
      transcript_path: transcript, last_assistant_message: message,
    }, {dataRoot})
    const run = join(dataRoot, 'runs', 'session-mode--turn-mode')
    await materializeHistory({dataRoot})
    assert.equal(JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8')).terminal_state, 'unknown')
    assert.equal(JSON.parse(readFileSync(join(run, 'outcome.json'), 'utf8')).completion_receipt.status, 'mode_mismatch')
    assert.equal(existsSync(join(run, 'receipt.json')), false)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('history rejects a shallow receipt that bypasses the full validator', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-shallow-'))
  const dataRoot = join(root, 'data')
  const transcript = join(root, 'root.jsonl')
  const receipt = join(root, 'receipt.json')
  try {
    writeFileSync(transcript, jsonl(tokens(10, 0, 1, 0, 11)))
    writeFileSync(receipt, JSON.stringify({schema_version: 7, mode: 'pr', terminal_state: 'pr_ready'}))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-shallow', turn_id: 'turn-shallow',
      prompt: '$auto-pilot pr docs/plan.md', transcript_path: transcript,
    }, {dataRoot})
    const message = `<!-- auto-pilot-receipt: ${receipt} -->`
    appendFileSync(transcript, jsonl(assistantMessage(message)))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'session-shallow', turn_id: 'turn-shallow',
      transcript_path: transcript, last_assistant_message: message,
    }, {dataRoot})
    await materializeHistory({dataRoot})
    const outcome = JSON.parse(
      readFileSync(join(dataRoot, 'runs', 'session-shallow--turn-shallow', 'outcome.json'), 'utf8'),
    )
    assert.equal(outcome.completion_receipt.status, 'invalid_receipt')
    assert.equal(outcome.terminal_state, 'unknown')
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test('collector refuses a symlinked history root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-symlink-'))
  const outside = join(root, 'outside')
  const dataRoot = join(root, 'data')
  try {
    mkdirSync(outside)
    symlinkSync(outside, dataRoot)
    await assert.rejects(handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-3', turn_id: 'turn-3',
      prompt: '$auto-pilot docs/plan.md', transcript_path: null,
    }, {dataRoot}), /unsafe history directory/)
    assert.deepEqual(readdirSync(outside), [])
  } finally { rmSync(root, {recursive: true, force: true}) }
})
