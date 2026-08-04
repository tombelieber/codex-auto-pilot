#!/usr/bin/env node
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {doctor, install, resolvePaths} from '../lib/installer.mjs'

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

  const options = parseOptions(argv.slice(1))
  if (command === 'install') {
    const result = install({sourceRoot: packageRoot, ...options})
    for (const item of result.items) console.log(`${item.status} ${item.destination}`)
    if (result.backupRoot) console.log(`backup ${result.backupRoot}`)
    return
  }
  if (command === 'doctor') {
    const result = doctor({sourceRoot: packageRoot})
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
    else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

function printHelp() {
  console.log(`codex-auto-pilot ${version}

Usage:
  codex-auto-pilot install [--dry-run] [--force]
  codex-auto-pilot doctor
  codex-auto-pilot skill-path
  codex-auto-pilot --version

Install copies only the Auto Pilot skill. It never installs agent profiles or edits .codex/config.toml.
Set CODEX_AUTO_PILOT_HOME to use an isolated Codex home.`)
}
