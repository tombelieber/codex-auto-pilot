import {copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {dirname, join, relative, sep} from 'node:path'

const EVENTS = ['UserPromptSubmit', 'SubagentStop', 'Stop', 'SessionEnd']

export function historyHooksPath(home) { return join(home, '.codex', 'hooks.json') }

export function historyHookStatus({home, installedSkill}) {
  const destination = historyHooksPath(home)
  assertSafePath(home, destination)
  if (!existsSync(destination)) return 'missing'
  const config = readHooks(destination)
  const expected = commandHook(installedSkill)
  return EVENTS.every((event) => hasExpectedHandler(config, event, expected)) ? 'current' : 'missing'
}

export function installHistoryHooks({home, installedSkill, dryRun = false, backupRoot = null}) {
  const destination = historyHooksPath(home)
  const status = historyHookStatus({home, installedSkill})
  if (status === 'current') return {name: 'local-history-hooks', destination, status: dryRun ? 'would skip' : 'skipped'}
  if (dryRun) return {name: 'local-history-hooks', destination, status: 'would install'}

  assertSafePath(home, destination)
  const config = existsSync(destination) ? readHooks(destination) : {description: 'User-level Codex lifecycle hooks.', hooks: {}}
  config.hooks ||= {}
  const expected = commandHook(installedSkill)
  for (const event of EVENTS) upsertHandler(config, event, expected)

  if (existsSync(destination) && backupRoot) {
    const backup = join(backupRoot, relative(home, destination))
    mkdirPrivate(dirname(backup))
    copyFileSync(destination, backup)
  }
  mkdirPrivate(dirname(destination))
  const temporary = `${destination}.codex-auto-pilot-tmp-${process.pid}-${Math.random().toString(16).slice(2)}`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600})
  renameSync(temporary, destination)
  return {name: 'local-history-hooks', destination, status: 'installed'}
}

function commandHook(installedSkill) {
  const script = join(installedSkill, 'scripts', 'collect_history.mjs')
  return {
    type: 'command',
    command: `node ${shellQuote(script)}`,
    commandWindows: `node "${script.replaceAll('"', '\\"')}"`,
    timeout: 30,
  }
}

function upsertHandler(config, event, expected) {
  const groups = Array.isArray(config.hooks[event]) ? config.hooks[event] : []
  for (const group of groups) {
    if (!Array.isArray(group.hooks)) continue
    const index = group.hooks.findIndex(isAutoPilotCollector)
    if (index >= 0) {
      group.hooks[index] = event === 'SessionEnd' ? {...expected, timeout: 3} : {...expected}
      config.hooks[event] = groups
      return
    }
  }
  groups.push({hooks: [event === 'SessionEnd' ? {...expected, timeout: 3} : {...expected}]})
  config.hooks[event] = groups
}

function hasExpectedHandler(config, event, expected) {
  const timeout = event === 'SessionEnd' ? 3 : 30
  return (config.hooks?.[event] || []).some((group) => (group.hooks || []).some((handler) =>
    handler.command === expected.command && handler.commandWindows === expected.commandWindows && handler.timeout === timeout,
  ))
}

function isAutoPilotCollector(handler) {
  return typeof handler?.command === 'string' && /auto-pilot[/\\]scripts[/\\]collect_history\.mjs/.test(handler.command)
}

function readHooks(path) {
  let parsed
  try { parsed = JSON.parse(readFileSync(path, 'utf8')) } catch (error) { throw new Error(`cannot parse existing hooks file ${path}: ${error.message}`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`existing hooks file is not a JSON object: ${path}`)
  if (parsed.hooks !== undefined && (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks))) {
    throw new Error(`existing hooks field is not a JSON object: ${path}`)
  }
  return parsed
}

function assertSafePath(home, destination) {
  const child = relative(home, destination)
  if (!child || child === '..' || child.startsWith(`..${sep}`) || child.split(sep).includes('..')) throw new Error(`hook destination escapes selected home: ${destination}`)
  let current = home
  for (const part of child.split(sep)) {
    current = join(current, part)
    if (!existsSync(current)) continue
    const stats = lstatSync(current)
    if (stats.isSymbolicLink()) throw new Error(`refusing symlink below selected home: ${current}`)
    if (current !== destination && !stats.isDirectory()) throw new Error(`hook destination parent is not a directory: ${current}`)
  }
}

function mkdirPrivate(path) { mkdirSync(path, {recursive: true, mode: 0o700}) }
function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'` }
