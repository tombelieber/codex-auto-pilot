import assert from 'node:assert/strict'
import {access, readFile} from 'node:fs/promises'
import {join} from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFile(join(root, path), 'utf8')

test('Auto Pilot is explicit-only and exposes a valid skill path', async () => {
  const manifest = JSON.parse(await read('.codex-plugin/plugin.json'))
  const packageMetadata = JSON.parse(await read('package.json'))
  const agent = await read('skills/auto-pilot/agents/openai.yaml')
  const history = await read('skills/auto-pilot/scripts/history.mjs')
  assert.equal(manifest.name, 'codex-auto-pilot')
  assert.equal(manifest.version, packageMetadata.version)
  assert.equal(history.includes(`AUTO_PILOT_VERSION = '${packageMetadata.version}'`), true)
  assert.equal(manifest.skills, './skills/')
  assert.equal(manifest.hooks, './hooks/hooks.json')
  assert.match(agent, /allow_implicit_invocation:\s*false/)
})

test('plugin hooks collect lifecycle evidence without adding model context', async () => {
  const hooks = JSON.parse(await read('hooks/hooks.json'))
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ['SessionEnd', 'Stop', 'SubagentStop', 'UserPromptSubmit'].sort())
  for (const groups of Object.values(hooks.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.match(hook.command, /collect_history\.mjs/)
        assert.doesNotMatch(JSON.stringify(hook), /additionalContext|decision/)
      }
    }
  }
})

test('skill enforces one implementation handoff and a fresh manual or automatic release session', async () => {
  const skill = await read('skills/auto-pilot/SKILL.md')
  const receipt = await read('skills/auto-pilot/references/receipt-schema.md')
  assert.match(skill, /exactly one fresh independent Terra task/)
  assert.match(skill, /at most one implementer-to-controller handoff/)
  assert.match(skill, /generated task begins with an explicit `\$auto-pilot release <PR>` command/)
  assert.match(skill, /ship.*creates exactly one fresh release task automatically/)
  assert.match(skill, /Do not create separate planning, inventory, status, log-summary, reviewer, or repair agents/)
  assert.doesNotMatch(receipt, /"orchestration"|"reviews"|"effort"/)
  await access(join(root, 'skills/auto-pilot/scripts/validate_receipt.py'))
  await access(join(root, 'skills/auto-pilot/scripts/history-bundle.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/history-receipt.mjs'))
  await access(join(root, 'skills/auto-pilot/references/delegated-implementation.md'))
  await access(join(root, 'skills/auto-pilot/references/automatic-promotion.md'))
  await access(join(root, 'skills/auto-pilot/references/release-promotion.md'))
})
