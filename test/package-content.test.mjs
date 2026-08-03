import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import test from 'node:test'

const intended = [
  '.codex-plugin/plugin.json', 'LICENSE', 'README.md', 'bin/codex-auto-pilot.mjs', 'install.sh', 'lib/installer.mjs', 'package.json',
  'skills/auto-pilot/SKILL.md', 'skills/auto-pilot/agents/openai.yaml', 'skills/auto-pilot/references/execution-contract.md', 'skills/auto-pilot/references/receipt-schema.md', 'skills/auto-pilot/scripts/validate_receipt.py',
  'templates/agents/auto-pilot-commander.toml', 'templates/agents/auto-pilot-fixer.toml', 'templates/agents/auto-pilot-goal-reviewer.toml', 'templates/agents/auto-pilot-implementer.toml', 'templates/agents/auto-pilot-release-reviewer.toml',
].sort()

test('npm pack contains exactly the intended 17 public files', () => {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {encoding: 'utf8'}))
  assert.equal(packed.length, 1)
  assert.deepEqual(packed[0].files.map((file) => file.path).sort(), intended)
})
