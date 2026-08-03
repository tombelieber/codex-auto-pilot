import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync} from 'node:fs'
import {homedir} from 'node:os'
import {basename, dirname, join, relative, sep} from 'node:path'

const skillRelativePath = join('.agents', 'skills', 'auto-pilot')
const profilesRelativePath = join('.codex', 'agents')

export function resolveHome() {
  return process.env.CODEX_AUTO_PILOT_HOME || process.env.HOME || homedir()
}

export function resolvePaths({sourceRoot, home = resolveHome()} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const sourceSkill = join(sourceRoot, 'skills', 'auto-pilot')
  const sourceProfiles = join(sourceRoot, 'templates', 'agents')
  if (!existsSync(sourceSkill)) throw new Error(`skill source not found: ${sourceSkill}`)
  if (!existsSync(sourceProfiles)) throw new Error(`agent profile source not found: ${sourceProfiles}`)
  const profiles = readdirSync(sourceProfiles, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith('.toml'))
    .map((entry) => entry.name).sort()
  if (profiles.length !== 5) throw new Error(`expected exactly five agent profiles in ${sourceProfiles}`)
  const result = {
    home, sourceSkill, sourceProfiles,
    items: [
      {name: 'skill', source: sourceSkill, destination: join(home, skillRelativePath)},
      ...profiles.map((name) => ({name: `profile:${name}`, source: join(sourceProfiles, name), destination: join(home, profilesRelativePath, name)})),
    ],
  }
  for (const item of result.items) assertSafeDestination(home, item.destination)
  return result
}

export function install({sourceRoot, home, dryRun = false, force = false} = {}) {
  const paths = resolvePaths({sourceRoot, home})
  const items = paths.items.map((item) => ({...item, status: destinationStatus(item.source, item.destination)}))
  const conflicts = items.filter((item) => item.status === 'conflict')
  if (conflicts.length && !force) {
    throw new Error(`refusing to replace existing content: ${conflicts.map((item) => item.destination).join(', ')} (use --force to back it up first)`)
  }
  if (dryRun) return {items: items.map((item) => ({...item, status: item.status === 'new' ? 'would install' : item.status === 'identical' ? 'would skip' : 'would replace'})), backupRoot: null}

  const replacements = items.filter((item) => item.status === 'new' || (item.status === 'conflict' && force))
  const backupRoot = force && replacements.some((item) => pathExists(item.destination))
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
  return {items: items.map((item) => ({...item, status: item.status === 'identical' ? 'skipped' : 'installed'})), backupRoot}
}

export function doctor({sourceRoot, home} = {}) {
  const {items} = resolvePaths({sourceRoot, home})
  return {items: items.map((item) => ({...item, status: !pathExists(item.destination) ? 'missing' : sameContent(item.source, item.destination) ? 'current' : 'mismatch'}))}
}

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
