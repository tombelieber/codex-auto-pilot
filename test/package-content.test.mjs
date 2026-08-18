import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import test from 'node:test'

const intended = [
  '.codex-plugin/plugin.json', 'LICENSE', 'README.md', 'bin/codex-auto-pilot.mjs', 'install.sh', 'lib/installer.mjs', 'package.json',
  'hooks/hooks.json', 'lib/hooks-installer.mjs',
  'skills/auto-pilot/SKILL.md', 'skills/auto-pilot/agents/openai.yaml', 'skills/auto-pilot/references/history-schema.md',
  'skills/auto-pilot/references/receipt-schema.md', 'skills/auto-pilot/references/delegated-implementation.md',
  'skills/auto-pilot/references/release-promotion.md', 'skills/auto-pilot/scripts/collect_history.mjs',
  'skills/auto-pilot/scripts/history.mjs', 'skills/auto-pilot/scripts/history-bundle.mjs',
  'skills/auto-pilot/scripts/history-receipt.mjs', 'skills/auto-pilot/scripts/validate_receipt.py',
].sort()

test('npm pack contains exactly the intended minimal public files', () => {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {encoding: 'utf8'}))
  assert.equal(packed.length, 1)
  assert.deepEqual(packed[0].files.map((file) => file.path).sort(), intended)
})
