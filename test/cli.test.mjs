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
  assert.equal(run(['--version']).stdout.trim(), '0.1.0')
  assert.match(run(['help']).stdout, /install \[--dry-run\] \[--force\]/)
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
