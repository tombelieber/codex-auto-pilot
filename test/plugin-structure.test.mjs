import assert from 'node:assert/strict'
import {access, readFile, readdir} from 'node:fs/promises'
import {join} from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFile(join(root, path), 'utf8')

test('plugin exposes only the guidance skills and registers no hooks', async () => {
  const manifest = JSON.parse(await read('.codex-plugin/plugin.json'))
  const metadata = JSON.parse(await read('package.json'))
  assert.equal(manifest.name, 'codex-auto-pilot')
  assert.equal(manifest.version, metadata.version)
  assert.equal(manifest.skills, './skills/')
  assert.equal(manifest.hooks, undefined)
  assert.deepEqual((await readdir(join(root, manifest.skills))).sort(), ['auto-pilot', 'batch-grill-me'])
  assert.deepEqual((await readdir(join(root, manifest.skills, 'auto-pilot'))).sort(), ['SKILL.md', 'agents'])
  await access(join(root, manifest.skills, 'batch-grill-me', 'SKILL.md'))
  assert.match(await read('skills/auto-pilot/agents/openai.yaml'), /allow_implicit_invocation:\s*false/)
})

test('historical tools remain available outside skill discovery', async () => {
  for (const path of ['SKILL.md', 'scripts/history.mjs', 'scripts/validate_receipt.py', 'references/receipt-schema.md']) {
    await access(join(root, 'legacy/auto-pilot', path))
  }
})
