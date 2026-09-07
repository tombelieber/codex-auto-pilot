import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync} from 'node:fs'
import {homedir} from 'node:os'
import {basename, dirname, join, relative, sep} from 'node:path'
import {hasHistoryHooks, historyHookStatus, historyHooksPath, installHistoryHooks} from './hooks-installer.mjs'

const autoPilotRelativePath = join('.agents', 'skills', 'auto-pilot')
const batchGrillRelativePath = join('.agents', 'skills', 'batch-grill-me')

export function resolveHome() {
  return process.env.CODEX_AUTO_PILOT_HOME || process.env.HOME || homedir()
}

export function resolvePaths({sourceRoot, home = resolveHome(), withLocalHistory = false} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const sourceSkill = join(sourceRoot, 'skills', 'auto-pilot')
  const sourceBatchGrill = join(sourceRoot, 'skills', 'batch-grill-me')
  if (!existsSync(sourceSkill)) throw new Error(`skill source not found: ${sourceSkill}`)
  if (!existsSync(sourceBatchGrill)) throw new Error(`skill source not found: ${sourceBatchGrill}`)
  const result = {
    home, sourceSkill,
    items: [
      {name: 'batch-grill-me-skill', source: sourceBatchGrill, destination: join(home, batchGrillRelativePath)},
      {name: 'auto-pilot-skill', source: sourceSkill, destination: join(home, autoPilotRelativePath)},
    ],
  }
  if (withLocalHistory || hasHistoryHooks({home})) {
    const source = join(sourceRoot, 'legacy', 'auto-pilot')
    if (!existsSync(source)) throw new Error(`legacy history source not found: ${source}`)
    result.items.unshift({
      name: 'legacy-history', source,
      destination: join(home, '.codex-auto-pilot', 'legacy', 'auto-pilot'),
    })
  }
  for (const item of result.items) assertSafeDestination(home, item.destination)
  return result
}

export function install({sourceRoot, home, dryRun = false, force = false, withLocalHistory = false} = {}) {
  const paths = resolvePaths({sourceRoot, home, withLocalHistory})
  const items = paths.items.map((item) => ({...item, status: destinationStatus(item.source, item.destination)}))
  const historyItem = items.find((item) => item.name === 'legacy-history')
  const conflicts = items.filter((item) => item.status === 'conflict')
  if (conflicts.length && !force) {
    throw new Error(`refusing to replace existing content: ${conflicts.map((item) => item.destination).join(', ')} (use --force to back it up first)`)
  }
  if (dryRun) {
    const preview = items.map((item) => ({...item, status: item.status === 'new' ? 'would install' : item.status === 'identical' ? 'would skip' : 'would replace'}))
    if (historyItem) preview.push(installHistoryHooks({home: paths.home, installedSkill: historyItem.destination, preserveExisting: !withLocalHistory, dryRun: true}))
    return {items: preview, backupRoot: null}
  }

  const replacements = items.filter((item) => item.status === 'new' || (item.status === 'conflict' && force))
  const hooksNeedBackup = historyItem && pathExists(historyHooksPath(paths.home)) && historyHookStatus({home: paths.home, installedSkill: historyItem.destination, preserveExisting: !withLocalHistory}) !== 'current'
  const backupRoot = (force && replacements.some((item) => pathExists(item.destination))) || hooksNeedBackup
    ? makeBackupRoot(paths.home) : null
  const completed = []
  try {
    for (const item of replacements) {
      const backup = backupRoot && pathExists(item.destination)
        ? join(backupRoot, relative(paths.home, item.destination)) : null
      atomicReplace(paths.home, item.source, item.destination, backup)
      completed.push(item)
    }
  } catch (error) {
    throw new Error(`installation stopped after ${completed.length} replacement(s): ${error.message}`)
  }
  const resultItems = items.map((item) => ({...item, status: item.status === 'identical' ? 'skipped' : 'installed'}))
  if (historyItem) resultItems.push(installHistoryHooks({home: paths.home, installedSkill: historyItem.destination, preserveExisting: !withLocalHistory, backupRoot}))
  return {items: resultItems, backupRoot}
}

export function doctor({sourceRoot, home, withLocalHistory = false} = {}) {
  const {items} = resolvePaths({sourceRoot, home, withLocalHistory})
  const historyItem = items.find((item) => item.name === 'legacy-history')
  const results = items.map((item) => ({...item, status: !pathExists(item.destination) ? 'missing' : sameContent(item.source, item.destination) ? 'current' : 'mismatch'}))
  if (historyItem) results.push({
    name: 'local-history-hooks',
    destination: historyHooksPath(resolveHomeForDoctor(home)),
    status: historyHookStatus({home: resolveHomeForDoctor(home), installedSkill: historyItem.destination, preserveExisting: !withLocalHistory}),
  })
  return {items: results}
}

function resolveHomeForDoctor(home) { return home || resolveHome() }

function destinationStatus(source, destination) {
  if (!pathExists(destination)) return 'new'
  return sameContent(source, destination) ? 'identical' : 'conflict'
}

function sameContent(left, right) {
  const leftStat = lstatSync(left)
  const rightStat = lstatSync(right)
  if (leftStat.isSymbolicLink() || rightStat.isSymbolicLink()) return false
  if (leftStat.isFile() || rightStat.isFile()) {
    return leftStat.isFile() && rightStat.isFile() && readFileSync(left).equals(readFileSync(right))
  }
  if (!leftStat.isDirectory() || !rightStat.isDirectory()) return false
  const leftEntries = readdirSync(left).sort()
  const rightEntries = readdirSync(right).sort()
  return leftEntries.length === rightEntries.length && leftEntries.every((entry, index) => entry === rightEntries[index] && sameContent(join(left, entry), join(right, entry)))
}

function atomicReplace(home, source, destination, backup) {
  const parent = dirname(destination)
  ensureDirectoryUnderHome(home, parent)
  const temp = join(parent, `.${basename(destination)}.codex-auto-pilot-tmp-${process.pid}-${Math.random().toString(16).slice(2)}`)
  try {
    cpSync(source, temp, {recursive: true, errorOnExist: true})
    if (pathExists(destination)) {
      ensureDirectoryUnderHome(home, dirname(backup))
      renameSync(destination, backup)
    }
    renameSync(temp, destination)
  } catch (error) {
    rmSync(temp, {recursive: true, force: true})
    if (backup && pathExists(backup) && !pathExists(destination)) {
      renameSync(backup, destination)
    }
    throw error
  }
}

function makeBackupRoot(home) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = join(home, '.codex-auto-pilot-backups', `${stamp}-${process.pid}`)
  ensureDirectoryUnderHome(home, backupRoot)
  return backupRoot
}

function assertSafeDestination(home, destination) {
  const child = relative(home, destination)
  if (!child || child === '..' || child.startsWith(`..${sep}`) || child.split(sep).includes('..')) {
    throw new Error(`destination escapes selected home: ${destination}`)
  }
  let current = home
  for (const part of child.split(sep)) {
    current = join(current, part)
    const stat = lstatIfExists(current)
    if (!stat) continue
    if (stat.isSymbolicLink()) throw new Error(`refusing symlink below selected home: ${current}`)
    if (current !== destination && !stat.isDirectory()) throw new Error(`destination parent is not a directory: ${current}`)
  }
}

function ensureDirectoryUnderHome(home, directory) {
  if (!pathExists(home)) mkdirSync(home, {recursive: true})
  const child = relative(home, directory)
  if (child === '') return
  if (child === '..' || child.startsWith(`..${sep}`) || child.split(sep).includes('..')) {
    throw new Error(`directory escapes selected home: ${directory}`)
  }
  let current = home
  for (const part of child.split(sep)) {
    current = join(current, part)
    if (!pathExists(current)) mkdirSync(current)
    const stat = lstatSync(current)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`refusing unsafe directory below selected home: ${current}`)
  }
}

function lstatIfExists(path) {
  try { return lstatSync(path) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function pathExists(path) { return lstatIfExists(path) !== null }
