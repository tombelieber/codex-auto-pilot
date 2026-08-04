import assert from 'node:assert/strict'
import {access, readFile} from 'node:fs/promises'
import {join} from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFile(join(root, path), 'utf8')

test('Auto Pilot is explicit-only and exposes a valid skill path', async () => {
  const manifest = JSON.parse(await read('.codex-plugin/plugin.json'))
  const agent = await read('skills/auto-pilot/agents/openai.yaml')
  assert.equal(manifest.name, 'codex-auto-pilot')
  assert.equal(manifest.skills, './skills/')
  assert.match(agent, /allow_implicit_invocation:\s*false/)
})

test('skill leaves execution strategy to Sol and keeps only delivery evidence', async () => {
  const skill = await read('skills/auto-pilot/SKILL.md')
  const receipt = await read('skills/auto-pilot/references/receipt-schema.md')
  assert.match(skill, /active Sol agent choose the simplest reliable execution approach/)
  assert.match(skill, /Do not create role teams, model routing, parallel waves, mandatory reviewers/)
  assert.doesNotMatch(skill, /gpt-5\.6-terra|dynamic_ready_frontier|commander/)
  assert.doesNotMatch(receipt, /"orchestration"|"reviews"|"effort"/)
  await access(join(root, 'skills/auto-pilot/scripts/validate_receipt.py'))
})
