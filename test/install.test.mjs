import assert from 'node:assert/strict'
import {existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {doctor, install, resolveHome, resolvePaths} from '../lib/installer.mjs'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-test-'))
  const sourceRoot = join(root, 'source')
  const home = join(root, 'home')
  mkdirSync(join(sourceRoot, 'skills', 'auto-pilot', 'nested'), {recursive: true})
  writeFileSync(join(sourceRoot, 'skills', 'auto-pilot', 'SKILL.md'), '# Auto Pilot\n')
  writeFileSync(join(sourceRoot, 'skills', 'auto-pilot', 'nested', 'rule.txt'), 'safe\n')
  mkdirSync(join(sourceRoot, 'skills', 'auto-pilot', 'scripts'))
  writeFileSync(join(sourceRoot, 'skills', 'auto-pilot', 'scripts', 'collect_history.mjs'), 'process.stdout.write("{}\\n")\n')
  mkdirSync(join(sourceRoot, 'skills', 'batch-grill-me'), {recursive: true})
  writeFileSync(join(sourceRoot, 'skills', 'batch-grill-me', 'SKILL.md'), '# Batch Grill Me\n')
  return {root, sourceRoot, home, cleanup: () => rmSync(root, {recursive: true, force: true})}
}

test('dry-run writes nothing', () => {
  const f = fixture()
  try {
    const result = install({sourceRoot: f.sourceRoot, home: f.home, dryRun: true})
    assert.equal(result.items.filter((item) => item.status === 'would install').length, 2)
    assert.equal(existsSync(f.home), false)
  } finally { f.cleanup() }
})

test('installs Auto Pilot and its Batch Grill hard dependency only', () => {
  const f = fixture()
  try {
    const result = install({sourceRoot: f.sourceRoot, home: f.home})
    assert.equal(result.items.filter((item) => item.status === 'installed').length, 2)
    assert.equal(readFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), '# Auto Pilot\n')
    assert.equal(readFileSync(join(f.home, '.agents', 'skills', 'batch-grill-me', 'SKILL.md'), 'utf8'), '# Batch Grill Me\n')
    assert.equal(existsSync(join(f.home, '.codex', 'agents')), false)
  } finally { f.cleanup() }
})

test('installs the hard dependency before the Auto Pilot skill', () => {
  const f = fixture()
  try {
    const {items} = resolvePaths({sourceRoot: f.sourceRoot, home: f.home})
    assert.deepEqual(items.map((item) => item.name), ['batch-grill-me-skill', 'auto-pilot-skill'])
  } finally { f.cleanup() }
})

test('the repository installer includes current routing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-install-v080-'))
  const home = join(root, 'home')
  try {
    install({sourceRoot: projectRoot, home})
    const skill = join(home, '.agents', 'skills', 'auto-pilot')
    for (const path of [
      'references/configuration.md',
      'scripts/resolve_config.mjs',
      'scripts/history-routing.mjs',
    ]) assert.equal(existsSync(join(skill, path)), true)
    assert.equal(existsSync(join(home, '.agents', 'skills', 'batch-grill-me', 'SKILL.md')), true)
  } finally { rmSync(root, {recursive: true, force: true}) }
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

test('treats destination symlinks as collisions', () => {
  const f = fixture()
  try {
    mkdirSync(join(f.home, '.agents', 'skills'), {recursive: true})
    symlinkSync(join(f.sourceRoot, 'skills', 'auto-pilot'), join(f.home, '.agents', 'skills', 'auto-pilot'))
    assert.throws(() => install({sourceRoot: f.sourceRoot, home: f.home}), /refusing symlink below selected home/)
  } finally { f.cleanup() }
})

test('rejects a symlinked .agents ancestor before writes', () => {
  const f = fixture()
  const outside = join(f.root, 'outside')
  try {
    mkdirSync(outside)
    mkdirSync(f.home)
    symlinkSync(outside, join(f.home, '.agents'))
    for (const options of [{}, {dryRun: true}, {force: true}]) {
      assert.throws(() => install({sourceRoot: f.sourceRoot, home: f.home, ...options}), /refusing symlink below selected home/)
    }
    assert.equal(existsSync(join(outside, 'skills', 'auto-pilot')), false)
  } finally { f.cleanup() }
})

test('force backs up the replaced skill before installing', () => {
  const f = fixture()
  try {
    install({sourceRoot: f.sourceRoot, home: f.home})
    writeFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'user content\n')
    const result = install({sourceRoot: f.sourceRoot, home: f.home, force: true})
    assert.ok(result.backupRoot)
    assert.equal(readFileSync(join(result.backupRoot, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), 'user content\n')
    assert.equal(readFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'utf8'), '# Auto Pilot\n')
  } finally { f.cleanup() }
})

test('repeat install skips identical skill and never touches config.toml', () => {
  const f = fixture()
  try {
    mkdirSync(join(f.home, '.codex'), {recursive: true})
    const config = join(f.home, '.codex', 'config.toml')
    writeFileSync(config, 'model = "private-value"\n')
    install({sourceRoot: f.sourceRoot, home: f.home})
    const repeated = install({sourceRoot: f.sourceRoot, home: f.home})
    assert.equal(repeated.items.filter((item) => item.status === 'skipped').length, 2)
    assert.equal(readFileSync(config, 'utf8'), 'model = "private-value"\n')
  } finally { f.cleanup() }
})

test('doctor reports current or mismatched skill without reading config.toml', () => {
  const f = fixture()
  try {
    install({sourceRoot: f.sourceRoot, home: f.home})
    assert.equal(resolvePaths({sourceRoot: f.sourceRoot, home: f.home}).items.length, 2)
    assert.equal(doctor({sourceRoot: f.sourceRoot, home: f.home}).items.find((item) => item.name === 'auto-pilot-skill').status, 'current')
    writeFileSync(join(f.home, '.agents', 'skills', 'auto-pilot', 'SKILL.md'), 'corrupt\n')
    assert.equal(doctor({sourceRoot: f.sourceRoot, home: f.home}).items.find((item) => item.name === 'auto-pilot-skill').status, 'mismatch')
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

test('local history opt-in preserves existing hooks and installs all lifecycle events', () => {
  const f = fixture()
  try {
    mkdirSync(join(f.home, '.codex'), {recursive: true})
    const hooksPath = join(f.home, '.codex', 'hooks.json')
    writeFileSync(hooksPath, JSON.stringify({hooks: {PreToolUse: [{hooks: [{type: 'command', command: 'safe-existing-hook'}]}]}}))
    const result = install({sourceRoot: f.sourceRoot, home: f.home, withLocalHistory: true})
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'))
    assert.equal(result.items.at(-1).status, 'installed')
    assert.ok(result.backupRoot)
    assert.equal(hooks.hooks.PreToolUse[0].hooks[0].command, 'safe-existing-hook')
    for (const event of ['UserPromptSubmit', 'SubagentStop', 'Stop', 'SessionEnd']) {
      assert.match(hooks.hooks[event][0].hooks[0].command, /\.agents\/skills\/auto-pilot\/scripts\/collect_history\.mjs/)
    }
    assert.equal(doctor({sourceRoot: f.sourceRoot, home: f.home, withLocalHistory: true}).items.at(-1).status, 'current')
  } finally { f.cleanup() }
})

test('local history dry-run rejects a symlinked .codex ancestor', () => {
  const f = fixture()
  const outside = join(f.root, 'outside-hooks')
  try {
    mkdirSync(f.home)
    mkdirSync(outside)
    symlinkSync(outside, join(f.home, '.codex'))
    assert.throws(() => install({sourceRoot: f.sourceRoot, home: f.home, withLocalHistory: true, dryRun: true}), /refusing symlink/)
    assert.equal(existsSync(join(outside, 'hooks.json')), false)
  } finally { f.cleanup() }
})
