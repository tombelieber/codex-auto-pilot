import assert from 'node:assert/strict'
import {mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {
  DEFAULT_AUTO_PILOT_SETTINGS,
  parseInvocationOverrides,
  resolveAutoPilotConfig,
} from '../skills/auto-pilot/scripts/resolve_config.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'codex-auto-pilot-config-'))
  return {root, config: join(root, 'config.json'), cleanup: () => rmSync(root, {recursive: true, force: true})}
}

test('config resolver uses portable defaults when no config or invocation overrides exist', () => {
  const f = fixture()
  try {
    const resolved = resolveAutoPilotConfig({configPath: f.config})
    assert.deepEqual(resolved.implementation, DEFAULT_AUTO_PILOT_SETTINGS.implementation)
    assert.deepEqual(resolved.release, DEFAULT_AUTO_PILOT_SETTINGS.release)
    assert.deepEqual(resolved.collaboration, DEFAULT_AUTO_PILOT_SETTINGS.collaboration)
    assert.deepEqual(resolved.source, {
      config_path: f.config,
      config_loaded: false,
      invocation_overrides: [],
      warnings: [],
    })
  } finally { f.cleanup() }
})

test('invocation settings override user config, which overrides defaults', () => {
  const f = fixture()
  try {
    writeFileSync(f.config, JSON.stringify({
      schema_version: 1,
      implementation: {substantive_executor: 'auto', model: 'user-implementation', thinking: 'high'},
      release: {model: 'user-release', thinking: 'medium'},
      collaboration: {policy: 'off'},
    }))
    const resolved = resolveAutoPilotConfig({
      configPath: f.config,
      prompt: '$auto-pilot pr docs/plan.md --implementation-model="invocation-implementation" --release-thinking xhigh --collaboration auto',
    })
    assert.deepEqual(resolved.implementation, {
      substantive_executor: 'auto', model: 'invocation-implementation', thinking: 'high',
    })
    assert.deepEqual(resolved.release, {model: 'user-release', thinking: 'xhigh'})
    assert.deepEqual(resolved.collaboration, {policy: 'auto'})
    assert.equal(resolved.source.config_loaded, true)
    assert.deepEqual(resolved.source.invocation_overrides, [
      'implementation.model', 'release.thinking', 'collaboration.policy',
    ])
  } finally { f.cleanup() }
})

test('routing flags are deterministic and reject empty or duplicate values', () => {
  assert.deepEqual(parseInvocationOverrides(
    '$auto-pilot pr --implementation-executor direct --implementation-model="local-model" --implementation-thinking high --release-model remote-model --release-thinking xhigh --collaboration off',
  ), {
    implementation: {substantive_executor: 'direct', model: 'local-model', thinking: 'high'},
    release: {model: 'remote-model', thinking: 'xhigh'},
    collaboration: {policy: 'off'},
  })
  assert.throws(() => parseInvocationOverrides('$auto-pilot pr --implementation-model='), /requires a value/)
  assert.throws(() => parseInvocationOverrides('$auto-pilot pr --implementation-model --release-model gpt-5.6-sol'), /implementation-model requires a value/)
  assert.throws(() => parseInvocationOverrides('$auto-pilot pr --collaboration auto --collaboration off'), /only once/)
  assert.throws(() => parseInvocationOverrides('$auto-pilot pr --release-thiking high'), /unknown Auto Pilot override flag.*--release-thiking/)
  assert.throws(() => resolveAutoPilotConfig({
    configPath: '/tmp/codex-auto-pilot-no-config.json',
    prompt: '$auto-pilot pr --release-thinking impossible',
  }), /release.thinking must be one of/)
})

test('a UI skill selection may precede the invocation flags on the next line', () => {
  assert.deepEqual(parseInvocationOverrides(
    '[$auto-pilot](/opt/skills/auto-pilot/SKILL.md)\nship docs/plan.md --release-model tuned-sol --release-thinking high',
  ), {
    release: {model: 'tuned-sol', thinking: 'high'},
  })
})

test('strict validation rejects unsafe or conflicting settings while collector mode records a fallback warning', () => {
  const f = fixture()
  try {
    writeFileSync(f.config, JSON.stringify({
      implementation: {substantive_executor: 'subagent'},
      collaboration: {policy: 'auto'},
    }))
    assert.throws(() => resolveAutoPilotConfig({
      configPath: f.config,
      prompt: '$auto-pilot pr --collaboration off',
    }), /conflicts with collaboration.policy=off/)

    const permissive = resolveAutoPilotConfig({
      configPath: f.config,
      prompt: '$auto-pilot pr --collaboration off',
      strict: false,
    })
    assert.deepEqual(permissive.implementation, DEFAULT_AUTO_PILOT_SETTINGS.implementation)
    assert.deepEqual(permissive.collaboration, DEFAULT_AUTO_PILOT_SETTINGS.collaboration)
    assert.match(permissive.source.warnings.join('\n'), /conflicts with collaboration.policy=off/)

    const link = join(f.root, 'config-link.json')
    symlinkSync(f.config, link)
    assert.throws(() => resolveAutoPilotConfig({configPath: link}), /refusing unsafe config path/)
    assert.throws(() => resolveAutoPilotConfig({configPath: 'relative-config.json'}), /config path must be absolute/)
  } finally { f.cleanup() }
})
