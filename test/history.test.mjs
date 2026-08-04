import assert from 'node:assert/strict'
import {appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {
  handleHookEvent,
  historyReport,
  historyRuns,
  isAutoPilotInvocation,
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

test('invocation detection accepts selected or leading skills without matching discussion', () => {
  assert.equal(isAutoPilotInvocation('[$auto-pilot](/opt/skills/auto-pilot/SKILL.md) docs/plan.md'), true)
  assert.equal(isAutoPilotInvocation('$auto-pilot docs/plan.md'), true)
  assert.equal(isAutoPilotInvocation('Can $auto-pilot collect history automatically?'), false)
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
  try {
    writeFileSync(transcript, jsonl(tokens(100, 80, 10, 5, 110)))
    await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: session, turn_id: turn,
      prompt: '[$auto-pilot](/opt/skills/auto-pilot/SKILL.md) docs/plan.md',
      transcript_path: transcript, cwd: '/repo', model: 'gpt-5.6-sol', permission_mode: 'dontAsk',
    }, {dataRoot, now: () => start})

    appendFileSync(transcript, jsonl(
      {type: 'turn_context', payload: {turn_id: turn, model: 'gpt-5.6-sol', effort: 'high'}},
      {type: 'response_item', payload: {type: 'function_call', name: 'exec_command'}},
      {type: 'response_item', payload: {type: 'custom_tool_call', name: 'exec'}},
      {type: 'event_msg', payload: {type: 'context_compacted'}},
      tokens(250, 180, 30, 15, 280),
    ))
    writeFileSync(agentTranscript, jsonl({type: 'response_item', payload: {type: 'message', role: 'assistant'}}))
    await handleHookEvent({
      hook_event_name: 'SubagentStop', session_id: session, turn_id: turn,
      agent_id: 'agent-1', agent_type: 'worker', agent_transcript_path: agentTranscript,
    }, {dataRoot, now: () => finish})
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: session, turn_id: turn,
      transcript_path: transcript, last_assistant_message: 'Terminal state: released',
    }, {dataRoot, now: () => finish})

    const run = join(dataRoot, 'runs', `${session}--${turn}`)
    const manifest = JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8'))
    const metrics = JSON.parse(readFileSync(join(run, 'metrics.json'), 'utf8'))
    assert.equal(manifest.status, 'finished')
    assert.equal(manifest.terminal_state, 'released')
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
    assert.equal(metrics.effort, 'high')
    assert.equal(readFileSync(join(run, 'transcript.jsonl'), 'utf8'), readFileSync(transcript, 'utf8'))
    if (process.platform !== 'win32') {
      assert.equal(statSync(run).mode & 0o777, 0o700)
      assert.equal(statSync(join(run, 'transcript.jsonl')).mode & 0o777, 0o600)
    }
    assert.equal(historyRuns({dataRoot}).length, 1)
    assert.equal(historyReport({dataRoot}).total_tokens, 170)
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
    assert.equal(JSON.parse(readFileSync(join(run, 'outcome.json'), 'utf8')).collection_reason, 'session_end')
    setRawRetention(1, dataRoot)
    const result = pruneExpiredRaw(dataRoot, new Date('2026-01-03T00:00:00.000Z'))
    assert.deepEqual(result, {pruned_runs: 1, pruned_files: 1})
    assert.equal(readFileSync(join(run, 'metrics.json'), 'utf8').includes('total_tokens'), true)
    assert.equal(JSON.parse(readFileSync(join(run, 'manifest.json'), 'utf8')).raw_pruned_at, '2026-01-03T00:00:00.000Z')
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
