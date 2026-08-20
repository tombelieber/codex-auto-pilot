import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {collectCompletionReceipt} from '../skills/auto-pilot/scripts/history-receipt.mjs'

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

function releasedReceipt() {
  return {
    schema_version: 7,
    mode: 'release',
    terminal_state: 'released',
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'Released and verified the approved plan.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: [headSha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'Exact acceptance path passed'}],
    checks: [{name: 'post-release E2E', status: 'passed', evidence: 'Production canary artifact'}],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: 'merged', merged: true, merge_sha: mergeSha},
    release: {
      status: 'passed', url: notesUrl, notes_url: notesUrl, message: releaseMessage,
      evidence: 'Production deployment and post-release E2E passed',
    },
    promotion: {
      source: 'live_pr', source_receipt: null, candidate_base_sha: baseSha,
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
  mkdirSync(archive)
  writeFileSync(receipt, JSON.stringify(releasedReceipt()))
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
