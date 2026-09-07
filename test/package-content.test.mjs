import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

const intended = [
  '.codex-plugin/plugin.json', 'LICENSE', 'README.md', 'bin/codex-auto-pilot.mjs', 'install.sh', 'lib/installer.mjs', 'package.json',
  'lib/hooks-installer.mjs', 'legacy/README.md',
  'skills/auto-pilot/SKILL.md', 'skills/auto-pilot/agents/openai.yaml',
  'skills/batch-grill-me/SKILL.md',
  'legacy/auto-pilot/SKILL.md', 'legacy/auto-pilot/agents/openai.yaml', 'legacy/auto-pilot/references/configuration.md', 'legacy/auto-pilot/references/history-schema.md',
  'legacy/auto-pilot/references/receipt-schema.md', 'legacy/auto-pilot/references/automatic-promotion.md',
  'legacy/auto-pilot/references/delegated-implementation.md',
  'legacy/auto-pilot/references/release-promotion.md', 'legacy/auto-pilot/scripts/collect_history.mjs',
  'legacy/auto-pilot/scripts/resolve_config.mjs', 'legacy/auto-pilot/scripts/history-routing.mjs',
  'legacy/auto-pilot/scripts/history.mjs', 'legacy/auto-pilot/scripts/history-bundle.mjs',
  'legacy/auto-pilot/scripts/history-materialize.mjs', 'legacy/auto-pilot/scripts/new_goal_id.mjs',
  'legacy/auto-pilot/scripts/history-receipt.mjs', 'legacy/auto-pilot/scripts/validate_receipt.py',
].sort()

test('packed distribution installs only guidance and retains optional history reads', () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-pilot-packed-install-'))
  try {
    const output = JSON.parse(execFileSync('npm', ['pack', '--pack-destination', root, '--json'], {encoding: 'utf8'}))
    const packed = Array.isArray(output) ? output : Object.values(output)
    assert.equal(packed.length, 1)
    assert.deepEqual(packed[0].files.map((file) => file.path).sort(), intended)
    execFileSync('tar', ['-xzf', join(root, packed[0].filename), '-C', root])
    const cli = join(root, 'package', 'bin', 'codex-auto-pilot.mjs')
    const home = join(root, 'home')
    const env = {...process.env, CODEX_AUTO_PILOT_HOME: home, CODEX_AUTO_PILOT_DATA: join(root, 'data')}
    execFileSync(process.execPath, [cli, 'install'], {env})
    execFileSync(process.execPath, [cli, 'doctor'], {env})
    assert.equal(existsSync(join(home, '.codex', 'hooks.json')), false)
    assert.equal(existsSync(join(home, '.agents', 'skills', 'auto-pilot', 'scripts')), false)
    assert.deepEqual(
      readFileSync(join(home, '.agents', 'skills', 'auto-pilot', 'SKILL.md')),
      readFileSync(new URL('../skills/auto-pilot/SKILL.md', import.meta.url)),
    )
    const history = JSON.parse(execFileSync(process.execPath, [cli, 'history', 'status'], {env, encoding: 'utf8'}))
    assert.equal(history.runs, 0)
  } finally { rmSync(root, {recursive: true, force: true}) }
})
