import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

const cli = new URL('../bin/codex-auto-pilot.mjs', import.meta.url)

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli.pathname, ...args], {encoding: 'utf8', env: {...process.env, ...env}})
}

test('version, help, and skill-path are available without installation', () => {
  assert.equal(run(['--version']).stdout.trim(), '0.13.1')
  assert.match(run(['help']).stdout, /install \[--dry-run\] \[--force\] \[--with-local-history\]/)
  assert.match(run(['help']).stdout, /passive user-level Codex hooks/)
  assert.match(run(['skill-path']).stdout.trim(), /skills\/auto-pilot$/)
})

test('doctor distinguishes missing targets and exits nonzero', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-cli-'))
  try {
    const result = run(['doctor'], {CODEX_AUTO_PILOT_HOME: home})
    assert.equal(result.status, 1)
    assert.match(result.stdout, /missing /)
  } finally { rmSync(home, {recursive: true, force: true}) }
})

test('doctor checks opted-in local history hooks', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-cli-hooks-'))
  try {
    const env = {CODEX_AUTO_PILOT_HOME: home}
    assert.equal(run(['install', '--with-local-history'], env).status, 0)
    const result = run(['doctor', '--with-local-history'], env)
    assert.equal(result.status, 0)
    assert.match(result.stdout, new RegExp(`current ${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/.codex\\/hooks\\.json`))
  } finally { rmSync(home, {recursive: true, force: true}) }
})

test('history status and retention use an isolated local data directory', () => {
  const data = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-history-cli-'))
  try {
    const env = {CODEX_AUTO_PILOT_DATA: data}
    const initial = JSON.parse(run(['history', 'status'], env).stdout)
    assert.equal(initial.runs, 0)
    assert.equal(initial.retention, 90)
    const updated = JSON.parse(run(['history', 'retention', '30'], env).stdout)
    assert.equal(updated.raw_retention_days, 30)
    assert.equal(JSON.parse(run(['history', 'materialize'], env).stdout).materialized, 0)
    assert.deepEqual(JSON.parse(run(['history', 'goals'], env).stdout), [])
    assert.equal(JSON.parse(run(['history', 'report', '--since', '30d'], env).stdout).runs, 0)
  } finally { rmSync(data, {recursive: true, force: true}) }
})
