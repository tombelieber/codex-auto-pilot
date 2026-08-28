import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import {collectCompletionReceipt} from '../skills/auto-pilot/scripts/history-receipt.mjs'

const validator = resolve(fileURLToPath(new URL('../skills/auto-pilot/scripts/validate_receipt.py', import.meta.url)))
const contractSha = execFileSync('python3', [validator, '--contract-sha256'], {encoding: 'utf8'}).trim()
const headSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)
const mergeSha = 'c'.repeat(40)
const notesUrl = 'https://github.com/owner/repo/releases/tag/v1'
const releaseMessage = `### Release

**v1** — Released

- User-visible change: Replies now reach the intended provider target.
- Verification: A production canary returned the provider reply identifier.
- Distribution: GitHub Release complete.
- Release notes: [v1](${notesUrl})`

function prReadyReceipt() {
  return {
    schema_version: 7,
    mode: 'pr',
    terminal_state: 'pr_ready',
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'Implemented and verified the approved plan.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: [headSha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'Exact acceptance path passed'}],
    checks: [{name: 'exact-candidate', status: 'passed', evidence: 'Promotable exact-candidate PASS for the live head'}],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: 'open', merged: false, merge_sha: null},
    release: {status: 'not_requested', url: null, notes_url: null, message: null, evidence: 'PR stage; production was not changed'},
    blockers: [],
  }
}

function releasedReceipt(sourceReceipt, sourceReceiptSha) {
  return {
    schema_version: 7,
    mode: 'release',
    terminal_state: 'released',
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'Released and verified the approved plan.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: [headSha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'Exact acceptance path passed'}],
    checks: [
      {name: 'post-release E2E', status: 'passed', evidence: 'Production canary artifact'},
      {
        name: 'release-contract-binding',
        status: 'passed',
        contract_sha256: contractSha,
        source_receipt_sha256: sourceReceiptSha,
        candidate_head_sha: headSha,
        single_use: true,
        evidence: 'Recomputed before mutation from the installed contract and exact source receipt',
      },
      {
        name: 'release-control-budget',
        status: 'passed',
        budget_seconds: 600,
        live_pr_bound_at: '2026-08-28T09:00:00+08:00',
        ended_at: '2026-08-28T09:08:30+08:00',
        end_kind: 'terminal',
        elapsed_seconds: 510,
        outcome: 'passed',
        evidence: 'Measured from live PR binding through the complete release task',
      },
    ],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: 'merged', merged: true, merge_sha: mergeSha},
    release: {
      status: 'passed', url: notesUrl, notes_url: notesUrl, message: releaseMessage,
      evidence: 'Production deployment and post-release E2E passed',
    },
    promotion: {
      source: 'pr_ready_receipt', source_receipt: sourceReceipt, candidate_base_sha: baseSha,
      candidate_head_sha: headSha,
      authority_evidence: 'Explicit current invocation: $auto-pilot release PR #1',
    },
    cleanup: {
      status: 'passed',
      worktree: 'removed',
      local_branch: 'deleted',
      remote_branch: 'deleted',
      evidence: 'Clean merged task worktree removed; metadata pruned; branches absent',
    },
    capability_reachability: {
      deployed_candidate_sha: mergeSha,
      scope_evidence: 'Release impact selected the changed reply capability.',
      cases: [{
        id: 'reply-comment',
        actor: 'authenticated external caller',
        credential_class: 'personal access token',
        resource_scope: 'runtime-supplied canary workspace and connected account',
        entrypoint: 'public reply apply endpoint',
        runtime_principal: 'production edge runtime database role',
        representative_data_case: 'legacy blank author identity and valid reply target',
        expected_terminal_outcome: 'provider reply identifier observed',
        deterministic: {status: 'passed', evidence: 'Isolated provider E2E passed'},
        production: {status: 'passed', evidence: 'Production canary reached provider reply'},
        authorization_changed: false,
      }],
    },
    blockers: [],
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'history-receipt-'))
  const archive = join(root, 'archive')
  const receipt = join(root, 'receipt.json')
  const sourceReceipt = join(root, 'pr-ready-receipt.json')
  mkdirSync(archive)
  const sourceBytes = JSON.stringify(prReadyReceipt())
  writeFileSync(sourceReceipt, sourceBytes)
  const sourceReceiptSha = createHash('sha256').update(sourceBytes).digest('hex')
  writeFileSync(receipt, JSON.stringify(releasedReceipt(sourceReceipt, sourceReceiptSha)))
  return {root, archive, receipt}
}

test('accepts a released receipt when its exact message is the final visible content', () => {
  const f = fixture()
  try {
    const result = collectCompletionReceipt(
      `Released successfully.\n\n${releaseMessage}\n<!-- auto-pilot-routing: {"implementation":{"lane":"not_applicable"},"continuation":{"lane":"current_release_task"}} -->\n<!-- auto-pilot-receipt: ${f.receipt} -->`,
      'release',
      f.archive,
    )
    assert.equal(result.terminal_state, 'released')
    assert.equal(result.evidence.status, 'valid')
  } finally {
    rmSync(f.root, {recursive: true, force: true})
  }
})

test('rejects a released receipt when the exact release message is not appended', () => {
  const f = fixture()
  try {
    const result = collectCompletionReceipt(
      `Released successfully.\n<!-- auto-pilot-receipt: ${f.receipt} -->`,
      'release',
      f.archive,
    )
    assert.equal(result.terminal_state, 'unknown')
    assert.equal(result.evidence.status, 'release_message_mismatch')
  } finally {
    rmSync(f.root, {recursive: true, force: true})
  }
})

test('rejects trailing visible text after the release message', () => {
  const f = fixture()
  try {
    const result = collectCompletionReceipt(
      `${releaseMessage}\n\nExtra visible footer.\n<!-- auto-pilot-receipt: ${f.receipt} -->`,
      'release',
      f.archive,
    )
    assert.equal(result.terminal_state, 'unknown')
    assert.equal(result.evidence.status, 'release_message_mismatch')
  } finally {
    rmSync(f.root, {recursive: true, force: true})
  }
})
