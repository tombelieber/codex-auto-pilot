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
  assert.equal(history.includes('HISTORY_SCHEMA_VERSION = 6'), true)
  assert.equal(manifest.skills, './skills/')
  assert.equal(manifest.hooks, './hooks/hooks.json')
  assert.match(agent, /allow_implicit_invocation:\s*false/)
  const grill = await read('skills/batch-grill-me/SKILL.md')
  assert.match(grill, /name: batch-grill-me/)
  assert.match(grill, /The session is done when the frontier is empty/)
  assert.match(grill, /inspect it directly or dispatch a sub-agent when collaboration is enabled/)
})

test('public install instructions use the tagged GitHub distribution', async () => {
  const packageMetadata = JSON.parse(await read('package.json'))
  const [readme, installer] = await Promise.all([read('README.md'), read('install.sh')])
  assert.equal(
    readme.includes(`npx --yes --allow-git=all github:tombelieber/codex-auto-pilot#v${packageMetadata.version} install`),
    true,
  )
  assert.doesNotMatch(readme, /From npm|npx codex-auto-pilot install/)
  assert.match(installer, /npx --yes --allow-git=all github:tombelieber\/codex-auto-pilot install/)
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

test('the contract has two achieved outcomes and keeps the same task resumable', async () => {
  const manifest = JSON.parse(await read('.codex-plugin/plugin.json'))
  const agent = await read('skills/auto-pilot/agents/openai.yaml')
  const skill = await read('skills/auto-pilot/SKILL.md')
  const configuration = await read('skills/auto-pilot/references/configuration.md')
  const receipt = await read('skills/auto-pilot/references/receipt-schema.md')
  const [readme, moleResearch, observabilityResearch, sessionResearch] = await Promise.all([
    read('README.md'),
    read('docs/research/mole-release-management.md'),
    read('docs/research/oss-agent-eval-observability.md'),
    read('docs/research/tokscale-session-analysis.md'),
  ])
  assert.match(configuration, /"substantive_executor": "auto"/)
  assert.match(configuration, /"model": "inherit"/)
  assert.match(skill, /bundled `\$batch-grill-me` hard dependency/)
  assert.match(skill, /Any known\s+defect, missing evidence, changed candidate\/base\/scope, or unresolved decision\s+means the candidate is not `PR_READY`/)
  assert.match(skill, /The only two successful end states/)
  assert.match(skill, /`PR_READY`/)
  assert.match(skill, /`SHIPPED`/)
  assert.match(skill, /compatibility aliases for `ship`/)
  assert.match(skill, /does not make later turns\s+read-only/)
  assert.match(skill, /resume there without requiring another\s+`\$auto-pilot` command, session, or task/)
  assert.match(skill, /single-use for that attempt only; it never seals the task or goal/)
  assert.match(skill, /no scoped TODO, follow-up,\s+actionable warning, or leftover/)
  assert.match(skill, /failure here is a valid `incomplete` checkpoint/)
  assert.match(skill, /final visible content must end with\s+the exact Markdown stored in `release.message`/)
  const automaticPromotion = await read('skills/auto-pilot/references/automatic-promotion.md')
  const releasePromotion = await read('skills/auto-pilot/references/release-promotion.md')
  assert.match(automaticPromotion, /Do not create\s+a continuation task or require another command after waiting/)
  assert.match(automaticPromotion, /same gate qualifies both public `PR_READY`/)
  assert.match(releasePromotion, /changed head, stale CI,\s+contract mismatch, or changed scope invalidates that attempt, not the task/)
  assert.match(releasePromotion, /No response seals the task\s+or makes future turns read-only/)
  assert.doesNotMatch(`${skill}\n${automaticPromotion}\n${releasePromotion}\n${receipt}`, /10-minute|release-control-budget|merged_main|fresh_release_task|fallback_command/)
  assert.doesNotMatch(receipt, /"orchestration"|"reviews"|"effort"/)
  assert.match(receipt, /"release_notes"/)
  assert.match(receipt, /`release\.message`/)
  assert.match(receipt, /"cleanup"/)
  const publicCopy = [readme, JSON.stringify(manifest), agent, moleResearch, observabilityResearch, sessionResearch].join('\n')
  assert.match(publicCopy, /`PR_READY`/)
  assert.match(publicCopy, /`SHIPPED`/)
  assert.doesNotMatch(publicCopy, /— Released|Released V<version>|finish(?:es)? only as `released`|permanently seals|closeout warnings|three (?:modes|boundaries)|Direct `release`/i)
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
  await access(join(root, 'skills/batch-grill-me/SKILL.md'))
})
