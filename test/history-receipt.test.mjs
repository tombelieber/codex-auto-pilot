import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {collectCompletionReceipt} from '../skills/auto-pilot/scripts/history-receipt.mjs'
import {attemptId, goalId, incompleteReceipt, releaseMessage, shippedReceipt} from './v10-fixture.mjs'

function fixture(value = shippedReceipt()) {
  const root = mkdtempSync(join(tmpdir(), 'history-receipt-v10-'))
  const archive = join(root, 'archive')
  const receipt = join(root, 'receipt.json')
  mkdirSync(archive)
  writeFileSync(receipt, JSON.stringify(value))
  return {root, archive, receipt}
}

test('accepts SHIPPED only when its exact release message is final visible content', () => {
  const f = fixture()
  try {
    const result = collectCompletionReceipt(
      `Shipped successfully.\n\n${releaseMessage}\n<!-- auto-pilot-routing: {"implementation":{"lane":"direct"},"continuation":{"lane":"current_ship_task"}} -->\n<!-- auto-pilot-receipt: ${f.receipt} -->`,
      'ship', f.archive, {expectedGoalId: goalId},
    )
    assert.equal(result.attempt_result, 'achieved')
    assert.equal(result.goal_outcome, 'SHIPPED')
    assert.equal(result.terminal_state, null)
    assert.equal(result.evidence.status, 'valid')
  } finally { rmSync(f.root, {recursive: true, force: true}) }
})

test('rejects missing or trailing visible text around the canonical SHIPPED message', () => {
  for (const message of [
    `Shipped.\n<!-- auto-pilot-receipt: __RECEIPT__ -->`,
    `${releaseMessage}\n\nExtra follow-up.\n<!-- auto-pilot-receipt: __RECEIPT__ -->`,
  ]) {
    const f = fixture()
    try {
      const result = collectCompletionReceipt(message.replace('__RECEIPT__', f.receipt), 'ship', f.archive, {expectedGoalId: goalId})
      assert.equal(result.goal_outcome, null)
      assert.equal(result.evidence.status, 'release_message_mismatch')
    } finally { rmSync(f.root, {recursive: true, force: true}) }
  }
})

test('keeps a valid incomplete attempt resumable with no achieved goal outcome', () => {
  const f = fixture(incompleteReceipt())
  try {
    const result = collectCompletionReceipt(`Waiting for credential.\n<!-- auto-pilot-receipt: ${f.receipt} -->`, 'ship', f.archive, {expectedGoalId: goalId})
    assert.equal(result.attempt_result, 'incomplete')
    assert.equal(result.goal_outcome, null)
    assert.equal(result.evidence.status, 'valid')
  } finally { rmSync(f.root, {recursive: true, force: true}) }
})

test('rejects receipts from another active goal', () => {
  const f = fixture()
  try {
    const result = collectCompletionReceipt(`${releaseMessage}\n<!-- auto-pilot-receipt: ${f.receipt} -->`, 'ship', f.archive, {expectedGoalId: 'apg_anothergoal12345'})
    assert.equal(result.evidence.status, 'goal_mismatch')
  } finally { rmSync(f.root, {recursive: true, force: true}) }
})

test('enforces real prior-receipt lineage and unique attempt IDs when history supplies context', () => {
  const prior = 'd'.repeat(64)
  const nextAttempt = 'apa_fedcba0987654321'
  const value = shippedReceipt()
  value.attempt = {
    id: nextAttempt, result: 'achieved', basis: 'repair', previous_receipt_sha256: prior,
    change_artifact_ref: 'repair:verified', change_evidence: 'The scoped repair changed before this linked attempt.',
  }
  value.checks.find(item => item.name === 'release-contract-binding').attempt_id = nextAttempt
  const f = fixture(value)
  try {
    const message = `${releaseMessage}\n<!-- auto-pilot-receipt: ${f.receipt} -->`
    const valid = collectCompletionReceipt(message, 'ship', f.archive, {
      expectedGoalId: goalId,
      expectedLineage: {previous_receipt_sha256: prior, attempt_ids: [attemptId]},
    })
    assert.equal(valid.evidence.status, 'valid')
    assert.equal(valid.attempt_id, nextAttempt)
    assert.equal(valid.previous_receipt_sha256, prior)

    const fabricated = collectCompletionReceipt(message, 'ship', f.archive, {
      expectedGoalId: goalId,
      expectedLineage: {previous_receipt_sha256: 'e'.repeat(64), attempt_ids: [attemptId]},
    })
    assert.equal(fabricated.evidence.status, 'lineage_mismatch')

    const duplicate = collectCompletionReceipt(message, 'ship', f.archive, {
      expectedGoalId: goalId,
      expectedLineage: {previous_receipt_sha256: prior, attempt_ids: [nextAttempt]},
    })
    assert.equal(duplicate.evidence.status, 'duplicate_attempt')

    const shrunkScope = collectCompletionReceipt(message, 'ship', f.archive, {
      expectedGoalId: goalId,
      expectedLineage: {
        previous_receipt_sha256: prior,
        attempt_ids: [attemptId],
        completion_scope: {
          criteria_ids: ['AC-1', 'AC-2'], production_case_ids: ['reply-comment'], release_notes: 'required',
        },
      },
    })
    assert.equal(shrunkScope.evidence.status, 'scope_mismatch')
  } finally { rmSync(f.root, {recursive: true, force: true}) }
})
