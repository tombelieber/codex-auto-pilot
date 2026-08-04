import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

const validator = resolve(fileURLToPath(new URL('../skills/auto-pilot/scripts/validate_receipt.py', import.meta.url)))
const sha = 'a'.repeat(40)

function receipt(state = 'pr_ready') {
  const released = state === 'released'
  const merged = state === 'merged_main' || released
  return {
    schema_version: 3,
    mode: merged ? 'release' : 'pr',
    terminal_state: state,
    plan: {source: 'docs/plan.md', approved: true},
    summary: 'Implemented and verified the approved plan.',
    git: {base_branch: 'main', delivery_branch: 'feature/test', commits: [sha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'Observed behavior'}],
    checks: [{name: released ? 'post-release E2E' : 'test', status: 'passed', evidence: 'Command or runtime evidence'}],
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: merged ? 'merged' : 'open', merged, merge_sha: merged ? sha : null},
    release: released
      ? {status: 'passed', url: 'https://github.com/owner/repo/releases/tag/v1', evidence: 'Production deployment and post-release E2E passed'}
      : merged
        ? {status: 'no_mechanism', url: null, evidence: 'Repository has no deployment mechanism'}
        : {status: 'not_requested', url: null, evidence: 'PR mode; production was not changed'},
    blockers: [],
  }
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
  ['legacy schema', (value) => { value.schema_version = 2 }],
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
  value.pull_request = {url: 'https://github.com/owner/repo/pull/1', status: 'merged', merged: true, merge_sha: sha}
  assert.equal(run(value).status, 1)
})

test('rejects released state without release URL', () => {
  const value = receipt('released')
  value.release.url = null
  assert.equal(run(value).status, 1)
})

test('validates included delivery evidence on blocked receipts', () => {
  const value = receipt()
  value.terminal_state = 'blocked'
  value.blockers = [{reason: 'CI unavailable', evidence: 'Provider status'}]
  value.pull_request.url = 'invalid'
  assert.equal(run(value).status, 1)
})
