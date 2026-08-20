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
  assert.equal(history.includes('HISTORY_SCHEMA_VERSION = 3'), true)
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

test('skill enforces configurable routing with one accountable implementation lane and a fresh release boundary', async () => {
  const skill = await read('skills/auto-pilot/SKILL.md')
  const receipt = await read('skills/auto-pilot/references/receipt-schema.md')
  assert.match(skill, /default to one user-visible independent task in an isolated worktree/)
  assert.match(skill, /Current-invocation flags override the optional user config, which overrides these defaults/)
  assert.match(skill, /Never describe a collaboration subagent as an independent Codex task/)
  assert.match(skill, /at most one implementer-to-controller handoff/)
  assert.match(skill, /generated task begins with an explicit `\$auto-pilot release <PR>` command/)
  assert.match(skill, /fresh user-visible release task, never a subagent or fork/)
  assert.match(skill, /Only after the continuation outcome is known, validate the final `pr_ready` receipt/)
  assert.match(skill, /After merge or release, automatically clean the task-owned local worktree and delivery branch/)
  assert.match(skill, /final visible content must end with the exact Markdown stored in `release.message`/)
  const automaticPromotion = await read('skills/auto-pilot/references/automatic-promotion.md')
  assert.match(automaticPromotion, /\$auto-pilot release <PR URL> --release-model <RESOLVED MODEL> --release-thinking <RESOLVED THINKING>/)
  assert.match(automaticPromotion, /preserves a current `ship` invocation override/)
  assert.doesNotMatch(receipt, /"orchestration"|"reviews"|"effort"/)
  assert.match(receipt, /"notes_url"/)
  assert.match(receipt, /"message"/)
  assert.match(receipt, /"cleanup"/)
  await access(join(root, 'skills/auto-pilot/scripts/validate_receipt.py'))
  await access(join(root, 'skills/auto-pilot/scripts/history-bundle.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/history-receipt.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/history-routing.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/resolve_config.mjs'))
  await access(join(root, 'skills/auto-pilot/references/configuration.md'))
  await access(join(root, 'skills/auto-pilot/references/delegated-implementation.md'))
  await access(join(root, 'skills/auto-pilot/references/automatic-promotion.md'))
  await access(join(root, 'skills/auto-pilot/references/release-promotion.md'))
})
