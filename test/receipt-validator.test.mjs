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
    schema_version: 1, mode: merged ? 'release' : 'pr', terminal_state: state,
    plan: {source: 'docs/plan.md', approved: true},
    git: {base_branch: 'main', delivery_branch: 'auto-pilot/test', commits: [sha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'test'}],
    checks: [{name: 'test', status: 'passed', evidence: 'npm test'}],
    reviews: {goal_spec: {status: 'passed', evidence: 'approved'}, engineering_release: {status: 'passed', evidence: 'approved'}},
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: merged ? 'merged' : 'open', merged, merge_sha: merged ? sha : null},
    release: released
      ? {deploy_mechanism: 'GitHub Releases', status: 'passed', url: 'https://github.com/owner/repo/releases/tag/v1', migrations: 'none', backfills: 'passed', post_release_checks: 'passed'}
      : {deploy_mechanism: 'none_detected', status: 'not_applicable', url: null, migrations: 'none', backfills: 'none', post_release_checks: 'not_applicable'},
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
  } finally { rmSync(directory, {recursive: true, force: true}) }
}

for (const state of ['pr_ready', 'merged_main', 'released']) {
  test(`accepts a valid ${state} receipt`, () => assert.equal(run(receipt(state)).status, 0))
}

test('accepts a valid blocked receipt without delivery evidence', () => {
  const value = receipt('pr_ready')
  value.terminal_state = 'blocked'; value.blockers = [{reason: 'credential missing', evidence: 'CLI output'}]
  assert.equal(run(value).status, 0)
})

for (const [name, mutate] of [
  ['null commit', (value) => { value.git.commits = [null] }],
  ['empty checks', (value) => { value.checks = [] }],
  ['bad PR URL', (value) => { value.pull_request.url = 'github.com/owner/repo' }],
  ['bad merge SHA', (value) => { value.pull_request.merge_sha = 'not-a-sha' }],
  ['bad release URL', (value) => { value.release.url = 'ftp://example.test/release' }],
]) {
  test(`rejects ${name}`, () => {
    const value = receipt(name === 'bad merge SHA' || name === 'bad release URL' ? 'released' : 'pr_ready')
    mutate(value)
    assert.equal(run(value).status, 1)
  })
}
