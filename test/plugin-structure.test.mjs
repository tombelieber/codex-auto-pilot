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
  assert.equal(history.includes('HISTORY_SCHEMA_VERSION = 5'), true)
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

test('ship keeps one owner through production and exposes only real terminal outcomes', async () => {
  const skill = await read('skills/auto-pilot/SKILL.md')
  const configuration = await read('skills/auto-pilot/references/configuration.md')
  const receipt = await read('skills/auto-pilot/references/receipt-schema.md')
  assert.match(configuration, /"substantive_executor": "auto"/)
  assert.match(skill, /bounded helpers are terminal leaves; they cannot spawn, fork, create\s+another task, delegate/)
  assert.match(configuration, /A fresh stage owner may\s+itself be a child task/)
  assert.match(skill, /Current-invocation flags override optional user config,\s+which overrides defaults/)
  assert.match(skill, /Never describe a collaboration\s+subagent as an independent Codex task/)
  assert.match(skill, /review the integrated candidate once rather than\s+reviewing each worker, commit, or partial change/)
  assert.match(skill, /same accountable task owns\s+implementation, PR, merge, deployment, and production proof/)
  assert.match(skill, /`pr_ready` is an\s+internal transition, never the final result of `ship`/)
  assert.match(skill, /A `ship` or `release` invocation ends only as `released` or `blocked`/)
  assert.match(skill, /A terminal `blocked` or `released` response permanently seals the release\s+attempt/)
  assert.match(skill, /do not repeat implementation, edit source, create commits or branches, open\s+another PR/)
  assert.match(skill, /Local cleanup failure does not rewrite a\s+proven live production release as blocked/)
  assert.match(skill, /final visible content for `released`\s+must end with the exact Markdown stored in `release.message`/)
  const automaticPromotion = await read('skills/auto-pilot/references/automatic-promotion.md')
  const releasePromotion = await read('skills/auto-pilot/references/release-promotion.md')
  assert.match(automaticPromotion, /Do not create, fork, or hand off to another user-visible task/)
  assert.match(automaticPromotion, /prove a production release path before merge/i)
  assert.match(automaticPromotion, /wait for CI, deployment, and observation inside the current task/)
  assert.match(releasePromotion, /If no production or distribution path exists, block before merge/)
  assert.doesNotMatch(`${skill}\n${automaticPromotion}\n${releasePromotion}\n${receipt}`, /10-minute|release-control-budget|merged_main|fresh_release_task|fallback_command/)
  assert.doesNotMatch(receipt, /"orchestration"|"reviews"|"effort"/)
  assert.match(receipt, /"notes_url"/)
  assert.match(receipt, /"message"/)
  assert.match(receipt, /"cleanup"/)
  await access(join(root, 'skills/auto-pilot/scripts/validate_receipt.py'))
  await access(join(root, 'skills/auto-pilot/scripts/history-bundle.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/history-receipt.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/history-materialize.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/new_goal_id.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/history-routing.mjs'))
  await access(join(root, 'skills/auto-pilot/scripts/resolve_config.mjs'))
  await access(join(root, 'skills/auto-pilot/references/configuration.md'))
  await access(join(root, 'skills/auto-pilot/references/delegated-implementation.md'))
  await access(join(root, 'skills/auto-pilot/references/automatic-promotion.md'))
  await access(join(root, 'skills/auto-pilot/references/release-promotion.md'))
})
