import assert from 'node:assert/strict'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {doctor, install, resolveHome, resolvePaths} from '../lib/installer.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-test-'))
  const sourceRoot = join(root, 'source')
  const home = join(root, 'home')
  mkdirSync(join(sourceRoot, 'skills', 'auto-pilot', 'nested'), {recursive: true})
  writeFileSync(join(sourceRoot, 'skills', 'auto-pilot', 'SKILL.md'), '# Auto Pilot\n')
  writeFileSync(join(sourceRoot, 'skills', 'auto-pilot', 'nested', 'rule.txt'), 'safe\n')
  mkdirSync(join(sourceRoot, 'templates', 'agents'), {recursive: true})
  for (const name of ['planner.toml', 'builder.toml', 'reviewer.toml', 'verifier.toml']) {
    writeFileSync(join(sourceRoot, 'templates', 'agents', name), `name = "${name}"\n`)
  }
  return {root, sourceRoot, home, cleanup: () => rmSync(root, {recursive: true, force: true})}
}

test('dry-run writes nothing', () => {
  const f = fixture()
  try {
    const result = install({sourceRoot: f.sourceRoot, home: f.home, dryRun: true})
    assert.equal(result.items.filter((item) => item.status === 'would install').length, 5)
    assert.equal(existsSync(f.home), false)
  } finally { f.cleanup() }
})

test('installs default Codex destinations and four profiles', () => {
  const f = fixture()
  try {
    const result = install({sourceRoot: f.sourceRoot, home: f.home})
    assert.equal(result.items.filter((item) => item.status === 'installed').length, 5)
    assert.equal(readFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), '# Auto Pilot\n')
    for (const name of ['planner.toml', 'builder.toml', 'reviewer.toml', 'verifier.toml']) {
      assert.equal(existsSync(join(f.home, '.codex', 'agents', name)), true)
    }
  } finally { f.cleanup() }
})

test('refuses collisions by default', () => {
  const f = fixture()
  try {
    mkdirSync(join(f.home, '.agents', 'skills', 'auto-pilot'), {recursive: true})
    writeFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'user content\n')
    assert.throws(() => install({sourceRoot: f.sourceRoot, home: f.home}), /refusing to replace/)
    assert.equal(readFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), 'user content\n')
  } finally { f.cleanup() }
})

test('force backs up each replaced destination before installing', () => {
  const f = fixture()
  try {
    install({sourceRoot: f.sourceRoot, home: f.home})
    writeFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'user content\n')
    writeFileSync(join(f.home, '.codex', 'agents', 'builder.toml'), 'user profile\n')
    const result = install({sourceRoot: f.sourceRoot, home: f.home, force: true})
    assert.ok(result.backupRoot)
    assert.equal(readFileSync(join(result.backupRoot, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), 'user content\n')
    assert.equal(readFileSync(join(result.backupRoot, '.codex', 'agents', 'builder.toml'), 'utf8'), 'user profile\n')
    assert.equal(readFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), '# Auto Pilot\n')
  } finally { f.cleanup() }
})

test('repeat install skips identical managed content and never touches config.toml', () => {
  const f = fixture()
  try {
    mkdirSync(join(f.home, '.codex'), {recursive: true})
    const config = join(f.home, '.codex', 'config.toml')
    writeFileSync(config, 'model = "private-value"\n')
    install({sourceRoot: f.sourceRoot, home: f.home})
    const repeated = install({sourceRoot: f.sourceRoot, home: f.home})
    assert.equal(repeated.items.filter((item) => item.status === 'skipped').length, 5)
    assert.equal(readFileSync(config, 'utf8'), 'model = "private-value"\n')
  } finally { f.cleanup() }
})

test('doctor reports installed targets without reading config.toml', () => {
  const f = fixture()
  try {
    install({sourceRoot: f.sourceRoot, home: f.home})
    const result = doctor({sourceRoot: f.sourceRoot, home: f.home})
    assert.equal(result.items.length, 5)
    assert.ok(result.items.every((item) => item.present))
    assert.equal(resolvePaths({sourceRoot: f.sourceRoot, home: f.home}).items.length, 5)
  } finally { f.cleanup() }
})

test('CODEX_AUTO_PILOT_HOME overrides the selected home', () => {
  const original = process.env.CODEX_AUTO_PILOT_HOME
  try {
    process.env.CODEX_AUTO_PILOT_HOME = '/tmp/codex-auto-pilot-isolated-home'
    assert.equal(resolveHome(), '/tmp/codex-auto-pilot-isolated-home')
  } finally {
    if (original === undefined) delete process.env.CODEX_AUTO_PILOT_HOME
    else process.env.CODEX_AUTO_PILOT_HOME = original
  }
})
