import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

const validator = resolve(fileURLToPath(new URL('../skills/auto-pilot/scripts/validate_receipt.py', import.meta.url)))
const headSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)
const mergeSha = 'c'.repeat(40)

function receipt(state = 'pr_ready') {
  const released = state === 'released'
  const merged = state === 'merged_main' || released
  const value = {
    schema_version: 5,
    mode: merged ? 'release' : 'pr',
    terminal_state: state,
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'Implemented and verified the approved plan.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: [headSha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'The exact acceptance path reached its expected terminal state'}],
    checks: [{name: released ? 'post-release E2E' : 'test', status: 'passed', evidence: 'Exact candidate command and bounded artifact reference'}],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: merged ? 'merged' : 'open', merged, merge_sha: merged ? mergeSha : null},
    release: released
      ? {status: 'passed', url: 'https://github.com/owner/repo/releases/tag/v1', evidence: 'Production deployment and post-release E2E passed'}
      : merged
        ? {status: 'no_mechanism', url: null, evidence: 'Repository has no deployment mechanism'}
        : {status: 'not_requested', url: null, evidence: 'PR stage; production was not changed'},
    blockers: [],
  }
  if (merged) {
    value.promotion = {
      source: 'live_pr',
      source_receipt: null,
      candidate_base_sha: baseSha,
      candidate_head_sha: headSha,
      authority_evidence: 'Explicit current invocation: $auto-pilot release PR #1',
    }
  }
  if (released) {
    value.capability_reachability = {
      deployed_candidate_sha: mergeSha,
      scope_evidence: 'Repository release impact selected only the changed reply capability.',
      cases: [{
        id: 'reply-comment',
        actor: 'authenticated external caller',
        credential_class: 'personal access token',
        resource_scope: 'runtime-supplied canary workspace and connected account',
        entrypoint: 'public reply apply endpoint',
        runtime_principal: 'production edge runtime database role',
        representative_data_case: 'legacy blank author identity and valid provider reply target',
        expected_terminal_outcome: 'provider reply identifier observed',
        deterministic: {status: 'passed', evidence: 'Isolated API-to-worker-to-fake-provider E2E passed'},
        production: {status: 'passed', evidence: 'Bounded canary reached the terminal provider reply'},
        authorization_changed: true,
        authorized: {status: 'passed', decision: 'allowed', effective_binding_count: 1, evidence: 'Scoped runtime credential was allowed'},
        unauthorized: {status: 'passed', decision: 'denied', effective_binding_count: 0, evidence: 'Out-of-scope credential was denied'},
      }],
    }
  }
  return value
}

function run(value) {
  const directory = mkdtempSync(join(tmpdir(), 'receipt-validator-'))
  const file = join(directory, 'receipt.json')
  try {
    writeFileSync(file, JSON.stringify(value))
    return {status: 0, output: execFileSync('python3', [validator, file], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})}
  } catch (error) {
    return {status: error.status, output: `${error.stdout}${error.stderr}`}
  } finally {
    rmSync(directory, {recursive: true, force: true})
  }
}

for (const state of ['pr_ready', 'merged_main', 'released']) {
  test(`accepts a valid ${state} receipt without orchestration metadata`, () => {
    const value = receipt(state)
    assert.equal('orchestration' in value, false)
    assert.equal('reviews' in value, false)
    assert.equal(run(value).status, 0)
  })
}

test('accepts a minimal blocked receipt', () => {
  const value = receipt()
  value.terminal_state = 'blocked'
  value.blockers = [{reason: 'credential missing', evidence: 'CLI output'}]
  delete value.git
  delete value.criteria
  delete value.checks
  delete value.pull_request
  delete value.release
  assert.equal(run(value).status, 0)
})

for (const [name, mutate] of [
  ['legacy schema', (value) => { value.schema_version = 3 }],
  ['missing summary', (value) => { value.summary = '' }],
  ['null commit', (value) => { value.git.commits = [null] }],
  ['failed criterion', (value) => { value.criteria[0].status = 'failed' }],
  ['no passed check', (value) => { value.checks[0].status = 'not_applicable' }],
  ['bad PR URL', (value) => { value.pull_request.url = 'github.com/owner/repo' }],
]) {
  test(`rejects ${name}`, () => {
    const value = receipt()
    mutate(value)
    assert.equal(run(value).status, 1)
  })
}

test('rejects production mutation in PR mode receipt', () => {
  const value = receipt()
  value.pull_request = {url: 'https://github.com/owner/repo/pull/1', status: 'merged', merged: true, merge_sha: mergeSha}
  assert.equal(run(value).status, 1)
})

test('rejects release without fresh promotion evidence', () => {
  const value = receipt('released')
  delete value.promotion
  assert.equal(run(value).status, 1)
})

test('rejects promotion evidence in PR mode', () => {
  const value = receipt()
  value.promotion = receipt('released').promotion
  assert.equal(run(value).status, 1)
})

test('rejects release candidate not bound to commits', () => {
  const value = receipt('released')
  value.promotion.candidate_head_sha = 'd'.repeat(40)
  assert.equal(run(value).status, 1)
})

test('rejects released state without release URL', () => {
  const value = receipt('released')
  value.release.url = null
  assert.equal(run(value).status, 1)
})

test('rejects released state without exact capability reachability', () => {
  const value = receipt('released')
  delete value.capability_reachability
  assert.equal(run(value).status, 1)
})

test('rejects a release proved only by a deterministic fixture', () => {
  const value = receipt('released')
  value.capability_reachability.cases[0].production.status = 'not_run'
  assert.equal(run(value).status, 1)
})

test('rejects an authorized proof with zero effective scope bindings', () => {
  const value = receipt('released')
  value.capability_reachability.cases[0].authorized.effective_binding_count = 0
  assert.equal(run(value).status, 1)
})

test('rejects reachability recorded for a different deployed commit', () => {
  const value = receipt('released')
  value.capability_reachability.deployed_candidate_sha = 'd'.repeat(40)
  assert.equal(run(value).status, 1)
})

test('rejects reachability without the observed runtime principal', () => {
  const value = receipt('released')
  value.capability_reachability.cases[0].runtime_principal = ''
  assert.equal(run(value).status, 1)
})

test('validates included delivery evidence on blocked receipts', () => {
  const value = receipt()
  value.terminal_state = 'blocked'
  value.blockers = [{reason: 'CI unavailable', evidence: 'Provider status'}]
  value.pull_request.url = 'invalid'
  assert.equal(run(value).status, 1)
})
