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
    schema_version: 2, mode: merged ? 'release' : 'pr', terminal_state: state,
    plan: {source: 'docs/plan.md', approved: true},
    effort: {requested: 'auto', resolved: 'xhigh', rationale: 'wide ready frontier and release-sensitive work'},
    orchestration: {
      strategy: 'dynamic_ready_frontier',
      commander: {id: 'commander-1', model: 'gpt-5.6-sol', reasoning_effort: 'xhigh'},
      implementer_model: 'gpt-5.6-terra',
      tickets_total: 3, tickets_completed: 3, peak_active_writers: 2,
      capacity_evidence: 'runtime accepted two ownership-safe writers',
      integration_evidence: 'three scoped commits integrated with targeted checks',
    },
    git: {base_branch: 'main', delivery_branch: 'auto-pilot/test', commits: [sha]},
    criteria: [{id: 'AC-1', status: 'passed', evidence: 'test'}],
    checks: [{name: 'test', status: 'passed', evidence: 'npm test'}],
    reviews: {
      goal_spec: {reviewer: 'goal-reviewer-1', model: 'gpt-5.6-sol', reasoning_effort: 'xhigh', status: 'passed', evidence: 'approved'},
      engineering_release: {reviewer: 'release-reviewer-1', model: 'gpt-5.6-sol', reasoning_effort: 'xhigh', status: 'passed', evidence: 'approved'},
    },
    pull_request: {url: 'https://github.com/owner/repo/pull/1', status: merged ? 'merged' : 'open', merged, merge_sha: merged ? sha : null},
    release: released
      ? {deploy_mechanism: 'GitHub Releases', status: 'passed', url: 'https://github.com/owner/repo/releases/tag/v1', migrations: 'none', backfills: 'passed', post_release_checks: 'passed', deployment_evidence: 'GitHub release v1 is published', migrations_evidence: 'No migrations apply to this package', backfills_evidence: 'Backfill completed with zero pending rows', post_release_evidence: 'Fresh install and doctor succeeded'}
      : merged
        ? {deploy_mechanism: 'none_detected', status: 'not_applicable', url: null, migrations: 'validated', backfills: 'none', post_release_checks: 'not_applicable', deployment_evidence: 'Repository inspection found no deploy mechanism', migrations_evidence: 'Migration dry-run passed before merge', backfills_evidence: 'No backfills apply', post_release_evidence: 'No post-release check applies because no deployment exists'}
        : {deploy_mechanism: 'GitHub Actions release.yml', status: 'not_applicable', url: null, migrations: 'validated', backfills: 'none', post_release_checks: 'not_applicable', deployment_evidence: 'Release workflow detected but not invoked in PR mode', migrations_evidence: 'Migration dry-run passed before PR', backfills_evidence: 'No backfills apply', post_release_evidence: 'Post-release checks wait for release authority'},
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
  delete value.orchestration; delete value.git; delete value.criteria; delete value.checks; delete value.reviews; delete value.pull_request; delete value.release
  assert.equal(run(value).status, 0)
})

test('accepts failed evidence sections on a blocked receipt', () => {
  const value = receipt('pr_ready')
  value.terminal_state = 'blocked'; value.blockers = [{reason: 'review failed', evidence: 'goal reviewer finding'}]
  value.criteria[0].status = 'failed'; value.checks[0].status = 'failed'; value.reviews.goal_spec.status = 'failed'
  assert.equal(run(value).status, 0)
})

test('rejects missing release operation evidence', () => {
  const value = receipt('released')
  value.release.post_release_evidence = ''
  assert.equal(run(value).status, 1)
})

for (const [name, mutate] of [
  ['null included commits', (value) => { value.git = {base_branch: 'main', delivery_branch: 'branch', commits: [null]} }],
  ['empty included criteria', (value) => { value.criteria = [] }],
  ['invalid included PR URL', (value) => { value.pull_request = {url: 'invalid', status: 'open', merged: false, merge_sha: null} }],
  ['invalid included release type', (value) => { value.release = {deploy_mechanism: 'none_detected', status: 'wrong', url: null, migrations: 'none', backfills: 'none', post_release_checks: 'not_applicable', deployment_evidence: 'none', migrations_evidence: 'none', backfills_evidence: 'none', post_release_evidence: 'none'} }],
]) {
  test(`rejects ${name} on a blocked receipt`, () => {
    const value = receipt('pr_ready')
    value.terminal_state = 'blocked'; value.blockers = [{reason: 'credential missing', evidence: 'CLI output'}]
    delete value.git; delete value.criteria; delete value.checks; delete value.reviews; delete value.pull_request; delete value.release
    mutate(value)
    assert.equal(run(value).status, 1)
  })
}

for (const [name, mutate] of [
  ['version 1 schema', (value) => { value.schema_version = 1 }],
  ['auto resolved effort', (value) => { value.effort.resolved = 'auto' }],
  ['missing effort rationale', (value) => { value.effort.rationale = '' }],
  ['wrong orchestration strategy', (value) => { value.orchestration.strategy = 'fixed_wave' }],
  ['wrong commander model', (value) => { value.orchestration.commander.model = 'gpt-5.6-terra' }],
  ['commander effort mismatch', (value) => { value.orchestration.commander.reasoning_effort = 'high' }],
  ['wrong implementer model', (value) => { value.orchestration.implementer_model = 'gpt-5.6-sol' }],
  ['incomplete tickets', (value) => { value.orchestration.tickets_completed = 2 }],
  ['zero active writers', (value) => { value.orchestration.peak_active_writers = 0 }],
  ['same final reviewer', (value) => { value.reviews.engineering_release.reviewer = 'goal-reviewer-1' }],
  ['commander as final reviewer', (value) => { value.reviews.goal_spec.reviewer = 'commander-1' }],
  ['wrong reviewer model', (value) => { value.reviews.goal_spec.model = 'gpt-5.6-terra' }],
  ['weak reviewer effort', (value) => { value.reviews.goal_spec.reasoning_effort = 'medium' }],
  ['executed migration in PR mode', (value) => { value.release.migrations = 'passed' }],
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
