import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {handleHookEvent, materializeHistory, parseAutoPilotInvocation} from '../skills/auto-pilot/scripts/history.mjs'

const validator = resolve(fileURLToPath(new URL('../skills/auto-pilot/scripts/validate_receipt.py', import.meta.url)))
const contractSha = 'e7a244b9698e36b8f08da520fc404ce89cb451de147d0a68d836954ee29d3c0e'
const headSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)
const mergeSha = 'c'.repeat(40)
const goalId = 'apg_1234567890abcdef'
const attemptId = 'apa_1234567890abcdef'

function prReadyReceipt() {
  return {
    schema_version: 9,
    goal_mode: 'pr',
    invoked_alias: null,
    goal: {id: goalId, target: 'PR_READY', achieved: 'PR_READY'},
    attempt: {
      id: attemptId, result: 'achieved', basis: 'initial', previous_receipt_sha256: null,
      change_artifact_ref: null, change_evidence: 'Initial bounded attempt.',
    },
    completion_scope: {
      criteria_ids: ['AC-1'], production_case_ids: [], release_notes: 'required',
      artifact_ref: 'impact-scope:test', evidence: 'All scoped work is enumerated and complete.',
    },
    open_items: [],
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'The exact open candidate is ready for its production release action.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: [headSha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'Acceptance path passed.'}],
    checks: [
      {
        name: 'exact-candidate', status: 'passed', candidate_base_sha: baseSha,
        candidate_head_sha: headSha, pull_request_url: 'https://github.com/owner/repo/pull/1',
        promotable: true, required_ci_status: 'passed', evidence: 'Live exact candidate passed.',
      },
      {
        name: 'production-release-ready', status: 'passed', production_path_status: 'verified',
        preflight_status: 'passed', credentials_status: 'ready', configuration_status: 'ready',
        migration_status: 'not_applicable', recovery_status: 'ready', next_action: 'production_release',
        evidence: 'Only the protected merge and production action remain.',
      },
    ],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: 'open', merged: false, merge_sha: null},
    release: {status: 'not_requested', url: null, message: null, evidence: 'Production action intentionally remains.'},
  }
}

function shippedReceipt() {
  const value = prReadyReceipt()
  value.goal_mode = 'ship'
  value.goal.target = 'SHIPPED'
  value.goal.achieved = 'SHIPPED'
  value.completion_scope.production_case_ids = ['reply-comment']
  value.pull_request = {url: 'https://github.com/owner/repo/pull/1', status: 'merged', merged: true, merge_sha: mergeSha}
  value.promotion = {
    source: 'live_candidate', source_receipt: null, candidate_base_sha: baseSha,
    candidate_head_sha: headSha, authority_evidence: 'Explicit current invocation: $auto-pilot ship docs/plan.md',
  }
  value.checks.push({
    name: 'release-contract-binding', status: 'passed', contract_sha256: contractSha,
    goal_id: goalId, attempt_id: attemptId, candidate_base_sha: baseSha,
    candidate_head_sha: headSha, pull_request_url: 'https://github.com/owner/repo/pull/1',
    source_receipt_sha256: null, single_use: true,
    evidence: 'This immutable binding applies only to this attempt.',
  })
  value.release = {
    status: 'passed', url: 'https://github.com/owner/repo/releases/tag/v1',
    message: '### Release\n\n**v1** — Shipped\n\n- Production verification passed.',
    evidence: 'The deployed artifact reached production.',
  }
  value.release_notes = {status: 'passed', artifact_ref: 'https://github.com/owner/repo/releases/tag/v1', evidence: 'Published.'}
  value.cleanup = {
    status: 'passed', worktree: 'removed', local_branch: 'deleted', remote_branch: 'deleted',
    evidence: 'All scoped closeout is complete.',
  }
  value.capability_reachability = {
    deployed_candidate_sha: mergeSha,
    scope_evidence: 'Impact selected the changed capability.',
    cases: [{
      id: 'reply-comment', actor: 'authenticated caller', credential_class: 'scoped token',
      resource_scope: 'dedicated production canary', entrypoint: 'public reply endpoint',
      runtime_principal: 'production runtime role', representative_data_case: 'legacy-shaped valid target',
      expected_terminal_outcome: 'provider reply identifier observed',
      observed_terminal_outcome: 'provider reply identifier observed',
      deterministic: {status: 'passed', artifact_ref: 'test:e2e', evidence: 'Deterministic E2E passed.'},
      production: {status: 'passed', artifact_ref: 'prod:canary-1', evidence: 'Production canary passed.'},
      authorization_changed: false,
    }],
  }
  return value
}

function validate(value) {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-v9-'))
  const path = join(root, 'receipt.json')
  try {
    writeFileSync(path, JSON.stringify(value))
    return spawnSync('python3', [validator, path], {encoding: 'utf8'})
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
}

function appendAssistant(transcript, message) {
  appendFileSync(transcript, `${JSON.stringify({
    type: 'response_item',
    payload: {type: 'message', role: 'assistant', content: [{type: 'output_text', text: message}]},
  })}\n`)
}

test('normalizes release, promote, and deploy aliases to the ship goal', () => {
  for (const alias of ['ship', 'release', 'promote', 'deploy']) {
    const parsed = parseAutoPilotInvocation(`$auto-pilot ${alias} PR #42`)
    assert.equal(parsed.goal_mode, 'ship')
    assert.equal(parsed.invoked_alias, alias === 'ship' ? null : alias)
  }
  assert.equal(parseAutoPilotInvocation('$auto-pilot pr docs/plan.md').goal_mode, 'pr')
})

test('accepts exactly the two achieved goal end states', () => {
  assert.equal(validate(prReadyReceipt()).status, 0)
  assert.equal(validate(shippedReceipt()).status, 0)
})

test('rejects legacy success and blocker terminal states in v9', () => {
  for (const legacy of ['blocked', 'released', 'pr_ready']) {
    const value = prReadyReceipt()
    value.goal.achieved = legacy
    assert.equal(validate(value).status, 1)
  }
})

test('requires full production readiness before PR_READY', () => {
  const value = prReadyReceipt()
  value.checks = value.checks.filter(check => check.name !== 'production-release-ready')
  assert.equal(validate(value).status, 1)
})

test('requires zero scoped leftovers for every achieved goal', () => {
  const value = shippedReceipt()
  value.open_items.push({
    id: 'OW-1', kind: 'follow_up', phase: 'cleanup', category: 'cleanup',
    reason: 'Delete branch later.', evidence: 'Branch remains.', next_safe_action: 'Delete it.',
  })
  assert.equal(validate(value).status, 1)
})

test('records production-live cleanup failure as resumable incomplete, never SHIPPED', () => {
  const value = shippedReceipt()
  value.goal.achieved = null
  value.attempt.result = 'incomplete'
  value.cleanup = {
    status: 'failed', worktree: 'retained', local_branch: 'retained', remote_branch: 'retained',
    evidence: 'Cleanup failed after production proof.',
  }
  value.open_items = [{
    id: 'OW-1', kind: 'failure', phase: 'cleanup', category: 'cleanup',
    reason: 'Closeout is incomplete.', evidence: 'Production is live; cleanup failed.',
    next_safe_action: 'Repair cleanup in this same task.',
  }]
  value.checks.push({
    name: 'remote-state-reconciliation', status: 'passed', artifact_ref: 'reconcile:cleanup-state',
    evidence: 'Remote production and repository state were read back before planning cleanup repair.',
  })
  assert.equal(validate(value).status, 0)
})

test('requires lineage fields for a repair attempt before history resolves the prior digest', () => {
  const value = shippedReceipt()
  value.attempt = {
    id: 'apa_fedcba0987654321', result: 'achieved', basis: 'repair',
    previous_receipt_sha256: 'd'.repeat(64), change_artifact_ref: 'cleanup:repair-2',
    change_evidence: 'The same task repaired the failed cleanup and revalidated the unchanged production state.',
  }
  value.checks.find(check => check.name === 'release-contract-binding').attempt_id = value.attempt.id
  assert.equal(validate(value).status, 0)
  value.attempt.previous_receipt_sha256 = null
  assert.equal(validate(value).status, 1)
})

test('an unfinished turn remains attached to the same active goal in the same task', async () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-active-goal-'))
  try {
    const first = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'same-session', turn_id: 'turn-1',
      prompt: '$auto-pilot ship docs/plan.md',
    }, {dataRoot: root, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'same-session', turn_id: 'turn-1',
      last_assistant_message: 'Still waiting for CI; no completion receipt yet.',
    }, {dataRoot: root})
    const second = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'same-session', turn_id: 'turn-2',
      prompt: 'CI is green now, continue and finish it.',
    }, {dataRoot: root, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    assert.equal(second.action, 'resumed')
    const manifest = JSON.parse(readFileSync(join(second.directory, 'manifest.json'), 'utf8'))
    assert.equal(manifest.goal_id, JSON.parse(readFileSync(join(first.directory, 'manifest.json'), 'utf8')).goal_id)
    assert.equal(manifest.goal_mode, 'ship')
    assert.equal(manifest.invocation_source, 'active_goal_resume')
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('only a validated achieved outcome completes the active goal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-complete-goal-'))
  const receiptPath = join(root, 'receipt.json')
  const transcript = join(root, 'transcript.jsonl')
  try {
    writeFileSync(transcript, '')
    const started = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'complete-session', turn_id: 'turn-1',
      prompt: '$auto-pilot pr docs/plan.md', transcript_path: transcript,
    }, {dataRoot: root, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    const manifest = JSON.parse(readFileSync(join(started.directory, 'manifest.json'), 'utf8'))
    const value = prReadyReceipt()
    value.goal.id = manifest.goal_id
    writeFileSync(receiptPath, JSON.stringify(value))
    const finalMessage = `PR_READY.\n<!-- auto-pilot-receipt: ${receiptPath} -->`
    appendAssistant(transcript, finalMessage)
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'complete-session', turn_id: 'turn-1',
      transcript_path: transcript, last_assistant_message: finalMessage,
    }, {dataRoot: root})
    const next = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'complete-session', turn_id: 'turn-2',
      prompt: 'Ordinary discussion after the completed goal.',
    }, {dataRoot: root, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    assert.deepEqual(next, {handled: false, reason: 'not_auto_pilot'})
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('a synchronous-looking success cannot clear the goal without matching transcript evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-authoritative-materializer-'))
  const receiptPath = join(root, 'receipt.json')
  try {
    const started = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'evidence-session', turn_id: 'turn-1',
      prompt: '$auto-pilot pr docs/plan.md',
    }, {dataRoot: root, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    const manifest = JSON.parse(readFileSync(join(started.directory, 'manifest.json'), 'utf8'))
    const value = prReadyReceipt()
    value.goal.id = manifest.goal_id
    writeFileSync(receiptPath, JSON.stringify(value))
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'evidence-session', turn_id: 'turn-1',
      last_assistant_message: `PR_READY.\n<!-- auto-pilot-receipt: ${receiptPath} -->`,
    }, {dataRoot: root})
    const next = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'evidence-session', turn_id: 'turn-2',
      prompt: 'Continue this goal.',
    }, {dataRoot: root, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    assert.equal(next.action, 'resumed')
    assert.equal(JSON.parse(readFileSync(join(next.directory, 'manifest.json'), 'utf8')).goal_id, manifest.goal_id)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('archived validator and transcript evidence are the sole active-goal completion authority', async () => {
  for (const [name, archivedValidator, receiptFactory, expectedAction] of [
    ['archived-rejects', 'import sys\nsys.exit(1)\n', prReadyReceipt, 'resumed'],
    ['archived-accepts', 'import sys\nsys.exit(0)\n', () => ({
      schema_version: 9, goal_mode: 'pr',
      goal: {id: goalId, target: 'PR_READY', achieved: 'PR_READY'},
      attempt: {id: attemptId, result: 'achieved', basis: 'initial', previous_receipt_sha256: null},
    }), 'not_auto_pilot'],
  ]) {
    const root = mkdtempSync(join(tmpdir(), `auto-pilot-${name}-`))
    const dataRoot = join(root, 'data')
    const receiptPath = join(root, 'receipt.json')
    const transcript = join(root, 'transcript.jsonl')
    try {
      writeFileSync(transcript, '')
      const started = await handleHookEvent({
        hook_event_name: 'UserPromptSubmit', session_id: name, turn_id: 'turn-1',
        prompt: `$auto-pilot pr docs/plan.md <!-- auto-pilot-goal: ${goalId} -->`, transcript_path: transcript,
      }, {dataRoot, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
      const manifest = JSON.parse(readFileSync(join(started.directory, 'manifest.json'), 'utf8'))
      const validatorArchive = join(dataRoot, 'versions', manifest.skill_bundle_sha256, 'bundle', 'scripts', 'validate_receipt.py')
      writeFileSync(validatorArchive, archivedValidator)
      const receipt = receiptFactory()
      receipt.goal.id = manifest.goal_id
      writeFileSync(receiptPath, JSON.stringify(receipt))
      const message = `PR_READY.\n<!-- auto-pilot-receipt: ${receiptPath} -->`
      appendAssistant(transcript, message)
      await handleHookEvent({
        hook_event_name: 'Stop', session_id: name, turn_id: 'turn-1',
        transcript_path: transcript, last_assistant_message: message,
      }, {dataRoot})
      const next = await handleHookEvent({
        hook_event_name: 'UserPromptSubmit', session_id: name, turn_id: 'turn-2', prompt: 'Continue.',
      }, {dataRoot, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
      assert.equal(expectedAction === 'not_auto_pilot' ? next.reason : next.action, expectedAction)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  }
})

test('one goal links an incomplete attempt to a new achieved attempt and then clears', async () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-linked-lifecycle-'))
  const dataRoot = join(root, 'data')
  try {
    const firstTranscript = join(root, 'turn-1.jsonl')
    const firstReceiptPath = join(root, 'receipt-1.json')
    writeFileSync(firstTranscript, '')
    const first = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'linked-session', turn_id: 'turn-1',
      prompt: `$auto-pilot pr docs/plan.md <!-- auto-pilot-goal: ${goalId} -->`, transcript_path: firstTranscript,
    }, {dataRoot, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    const incomplete = prReadyReceipt()
    incomplete.goal.achieved = null
    incomplete.attempt.result = 'incomplete'
    incomplete.checks[0].status = 'failed'
    incomplete.checks[0].promotable = false
    incomplete.checks[0].required_ci_status = 'failed'
    incomplete.open_items = [{
      id: 'OW-1', kind: 'blocker', phase: 'qualification', category: 'ci',
      reason: 'Required CI failed.', evidence: 'The exact candidate check is red.',
      next_safe_action: 'Repair the failing check in this same task.',
    }]
    writeFileSync(firstReceiptPath, JSON.stringify(incomplete))
    const firstMessage = `CI repair required.\n<!-- auto-pilot-receipt: ${firstReceiptPath} -->`
    appendAssistant(firstTranscript, firstMessage)
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'linked-session', turn_id: 'turn-1',
      transcript_path: firstTranscript, last_assistant_message: firstMessage,
    }, {dataRoot})
    await materializeHistory({dataRoot})

    const priorSha = createHash('sha256').update(JSON.stringify(incomplete)).digest('hex')
    const activePath = join(dataRoot, 'active-goals', 'linked-session.json')
    const active = JSON.parse(readFileSync(activePath, 'utf8'))
    assert.equal(active.last_receipt_sha256, priorSha)
    assert.deepEqual(active.attempt_ids, [attemptId])

    const secondTranscript = join(root, 'turn-2.jsonl')
    const secondReceiptPath = join(root, 'receipt-2.json')
    writeFileSync(secondTranscript, '')
    const second = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'linked-session', turn_id: 'turn-2',
      prompt: 'CI is fixed; continue to the requested outcome.', transcript_path: secondTranscript,
    }, {dataRoot, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    const secondManifest = JSON.parse(readFileSync(join(second.directory, 'manifest.json'), 'utf8'))
    assert.equal(second.action, 'resumed')
    assert.equal(secondManifest.expected_previous_receipt_sha256, priorSha)
    const achieved = prReadyReceipt()
    achieved.attempt = {
      id: 'apa_fedcba0987654321', result: 'achieved', basis: 'repair', previous_receipt_sha256: priorSha,
      change_artifact_ref: 'ci:repair-proof', change_evidence: 'The failing required check changed and passed.',
    }
    writeFileSync(secondReceiptPath, JSON.stringify(achieved))
    const secondMessage = `PR_READY.\n<!-- auto-pilot-receipt: ${secondReceiptPath} -->`
    appendAssistant(secondTranscript, secondMessage)
    await handleHookEvent({
      hook_event_name: 'Stop', session_id: 'linked-session', turn_id: 'turn-2',
      transcript_path: secondTranscript, last_assistant_message: secondMessage,
    }, {dataRoot})
    await materializeHistory({dataRoot})
    assert.equal(existsSync(activePath), false)
    const finalManifest = JSON.parse(readFileSync(join(second.directory, 'manifest.json'), 'utf8'))
    assert.equal(finalManifest.goal_outcome, 'PR_READY')
    assert.equal(finalManifest.attempt_id, achieved.attempt.id)
    assert.equal(finalManifest.previous_receipt_sha256, priorSha)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('repeated Stop is idempotent and cannot rewrite an immutable attempt snapshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-stop-idempotence-'))
  const dataRoot = join(root, 'data')
  const receiptPath = join(root, 'receipt.json')
  try {
    const started = await handleHookEvent({
      hook_event_name: 'UserPromptSubmit', session_id: 'stop-session', turn_id: 'turn-1',
      prompt: `$auto-pilot pr docs/plan.md <!-- auto-pilot-goal: ${goalId} -->`,
    }, {dataRoot, env: {CODEX_AUTO_PILOT_CONFIG: join(root, 'missing.json')}})
    const incomplete = prReadyReceipt()
    incomplete.goal.achieved = null
    incomplete.attempt.result = 'incomplete'
    incomplete.open_items = [{id: 'OW-1', kind: 'blocker', phase: 'qualification', category: 'ci', reason: 'CI pending.', evidence: 'Check is not complete.', next_safe_action: 'Wait for CI.'}]
    writeFileSync(receiptPath, JSON.stringify(incomplete))
    const firstMessage = `Waiting.\n<!-- auto-pilot-receipt: ${receiptPath} -->`
    await handleHookEvent({hook_event_name: 'Stop', session_id: 'stop-session', turn_id: 'turn-1', last_assistant_message: firstMessage}, {dataRoot})
    const snapshotPath = join(started.directory, 'receipt-source.json')
    const firstSnapshot = readFileSync(snapshotPath)
    writeFileSync(receiptPath, JSON.stringify(prReadyReceipt()))
    const second = await handleHookEvent({hook_event_name: 'Stop', session_id: 'stop-session', turn_id: 'turn-1', last_assistant_message: `PR_READY.\n<!-- auto-pilot-receipt: ${receiptPath} -->`}, {dataRoot})
    assert.equal(second.action, 'already_marked_terminal')
    assert.deepEqual(readFileSync(snapshotPath), firstSnapshot)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
