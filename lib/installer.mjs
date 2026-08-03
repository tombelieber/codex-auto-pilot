import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync} from 'node:fs'
import {homedir} from 'node:os'
import {basename, dirname, join, relative} from 'node:path'

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
  if (profiles.length !== 4) throw new Error(`expected exactly four agent profiles in ${sourceProfiles}`)
  return {
    home, sourceSkill, sourceProfiles,
    items: [
      {name: 'skill', source: sourceSkill, destination: join(home, skillRelativePath)},
      ...profiles.map((name) => ({name: `profile:${name}`, source: join(sourceProfiles, name), destination: join(home, profilesRelativePath, name)})),
    ],
  }
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
  const backupRoot = force && replacements.some((item) => existsSync(item.destination))
    ? makeBackupRoot(paths.home) : null
  const completed = []
  try {
    for (const item of replacements) {
      const backup = backupRoot && existsSync(item.destination)
        ? join(backupRoot, relative(paths.home, item.destination)) : null
      atomicReplace(item.source, item.destination, backup)
      completed.push(item)
    }
  } catch (error) {
    throw new Error(`installation stopped after ${completed.length} replacement(s): ${error.message}`)
  }
  return {items: items.map((item) => ({...item, status: item.status === 'identical' ? 'skipped' : 'installed'})), backupRoot}
}

export function doctor({sourceRoot, home} = {}) {
  const {items} = resolvePaths({sourceRoot, home})
  return {items: items.map((item) => ({...item, present: existsSync(item.destination)}))}
}

function destinationStatus(source, destination) {
  if (!existsSync(destination)) return 'new'
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

function atomicReplace(source, destination, backup) {
  const parent = dirname(destination)
  mkdirSync(parent, {recursive: true})
  const temp = join(parent, `.${basename(destination)}.codex-auto-pilot-tmp-${process.pid}-${Math.random().toString(16).slice(2)}`)
  try {
    cpSync(source, temp, {recursive: true, errorOnExist: true})
    if (existsSync(destination)) {
      mkdirSync(dirname(backup), {recursive: true})
      renameSync(destination, backup)
    }
    renameSync(temp, destination)
  } catch (error) {
    rmSync(temp, {recursive: true, force: true})
    if (backup && existsSync(backup) && !existsSync(destination)) {
      renameSync(backup, destination)
    }
    throw error
  }
}

function makeBackupRoot(home) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = join(home, '.codex-auto-pilot-backups', `${stamp}-${process.pid}`)
  mkdirSync(backupRoot, {recursive: true})
  return backupRoot
}
