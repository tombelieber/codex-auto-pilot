#!/usr/bin/env node
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {doctor, install} from '../lib/installer.mjs'
import {
  historyGoals,
  historyReport,
  historyRuns,
  historyStatus,
  materializeHistory,
  resolveHistoryRoot,
  setRawRetention,
} from '../skills/auto-pilot/scripts/history.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version

main(process.argv.slice(2)).catch((error) => {
  console.error(`error: ${error.message}`)
  process.exitCode = 1
})

async function main(argv) {
  const command = argv[0]
  if (!command || command === '--help' || command === '-h' || command === 'help') return printHelp()
  if (command === '--version' || command === '-v') return console.log(version)
  if (command === 'skill-path') return console.log(join(packageRoot, 'skills', 'auto-pilot'))
  if (command === 'history') return historyCommand(argv.slice(1))

  const options = parseOptions(argv.slice(1))
  if (command === 'install') {
    const result = install({sourceRoot: packageRoot, ...options})
    for (const item of result.items) console.log(`${item.status} ${item.destination}`)
    if (result.backupRoot) console.log(`backup ${result.backupRoot}`)
    return
  }
  if (command === 'doctor') {
    const result = doctor({sourceRoot: packageRoot, ...options})
    for (const item of result.items) console.log(`${item.status} ${item.destination}`)
    return result.items.every((item) => item.status === 'current') ? undefined : (process.exitCode = 1)
  }
  throw new Error(`unknown command: ${command}`)
}

function parseOptions(argv) {
  const options = {}
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--force') options.force = true
    else if (arg === '--with-local-history') options.withLocalHistory = true
    else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

async function historyCommand(argv) {
  const command = argv[0] || 'status'
  if (command === 'path') return console.log(resolveHistoryRoot())
  if (command === 'status') return printJson(historyStatus())
  if (command === 'retention') {
    if (!argv[1]) throw new Error('history retention requires a positive day count or forever')
    return printJson(setRawRetention(argv[1]))
  }
  if (command === 'materialize') return printJson(await materializeHistory())
  const options = parseHistoryOptions(argv.slice(1))
  if (command === 'list') return printJson(await historyRuns(options))
  if (command === 'goals') return printJson(await historyGoals(options))
  if (command === 'report') return printJson(await historyReport(options))
  throw new Error(`unknown history command: ${command}`)
}

function parseHistoryOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--since') {
      const value = argv[++index]
      const match = /^(\d+)d$/.exec(value || '')
      if (!match || Number(match[1]) < 1) throw new Error('--since must use a positive day count such as 30d')
      options.sinceDays = Number(match[1])
    } else throw new Error(`unknown history option: ${arg}`)
  }
  return options
}

function printJson(value) { console.log(JSON.stringify(value, null, 2)) }

function printHelp() {
  console.log(`codex-auto-pilot ${version}

Usage:
  codex-auto-pilot install [--dry-run] [--force] [--with-local-history]
  codex-auto-pilot doctor [--with-local-history]
  codex-auto-pilot skill-path
  codex-auto-pilot history status|path|materialize|list|goals|report
  codex-auto-pilot history list|goals|report [--since 30d]
  codex-auto-pilot history retention <days|forever>
  codex-auto-pilot --version

Install copies the Auto Pilot skill. --with-local-history also adds passive user-level Codex hooks.
No history data is uploaded, and hooks never add model context.
Set CODEX_AUTO_PILOT_HOME to use an isolated Codex home.`)
}
