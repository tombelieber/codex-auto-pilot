#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {existsSync, lstatSync, readFileSync} from 'node:fs'
import {relative, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const SELF_PATH = fileURLToPath(import.meta.url)
const ALLOWED_ENV_FILES = new Set(['.env.example'])
const PRIVATE_KEY_FILE = /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|p12|pfx|key))$/i
const PRIVATE_PATH = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/
const NON_NOREPLY_EMAIL = /\b[A-Z0-9._%+-]+@(?!users\.noreply\.github\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const SECRET_VALUE = String.raw`(?:[A-Za-z0-9_./+=-]{8,})`
const SECRET_PATTERNS = [
  {name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/},
  {name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/},
  {name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/},
  {name: 'credential assignment', pattern: new RegExp(String.raw`\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["']?${SECRET_VALUE}`, 'i')},
  {name: 'private key block', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/},
]

function git(root, args) { return execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) }
function gitBuffer(root, args) { return execFileSync('git', args, {cwd: root, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe']}) }

function repositoryRoot(cwd) { return git(cwd, ['rev-parse', '--show-toplevel']).trim() }
function hasHistory(root) { try { git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']); return true } catch { return false } }
function publicFiles(root) { return [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort() }
function addFinding(findings, file, reason) { findings.push(`${file}: ${reason}`) }
function checkPath(findings, file) {
  const basename = file.split('/').at(-1)
  if (basename.startsWith('.env') && !ALLOWED_ENV_FILES.has(basename)) addFinding(findings, file, 'environment files are not allowed')
  if (PRIVATE_KEY_FILE.test(file)) addFinding(findings, file, 'private-key-like filename is not allowed')
}
function checkContent(findings, label, content) {
  const text = content.toString('utf8')
  if (PRIVATE_PATH.test(text)) addFinding(findings, label, 'contains a private absolute home path')
  if (NON_NOREPLY_EMAIL.test(text)) addFinding(findings, label, 'contains a non-noreply email address')
  for (const {name, pattern} of SECRET_PATTERNS) if (pattern.test(text)) addFinding(findings, label, `contains ${name}`)
}

function scanWorkingTree(root, findings) {
  let files = 0
  for (const file of publicFiles(root)) {
    const absolute = resolve(root, file)
    if (!existsSync(absolute)) continue
    const stats = lstatSync(absolute); files += 1
    if (stats.isSymbolicLink()) { addFinding(findings, file, 'symlinks are not allowed'); continue }
    if (!stats.isFile()) continue
    checkPath(findings, file)
    if (absolute !== SELF_PATH) checkContent(findings, file, readFileSync(absolute))
  }
  return files
}

function scanHistory(root, findings) {
  if (!hasHistory(root)) return {commits: 0, trees: 0, blobs: 0}
  const commits = git(root, ['rev-list', '--all']).trim().split('\n').filter(Boolean)
  const blobs = new Map(); const trees = new Set()
  for (const path of new Set(git(root, ['log', '--all', '--format=', '--name-only']).split('\n').filter(Boolean))) checkPath(findings, path)
  for (const commit of commits) {
    trees.add(git(root, ['show', '-s', '--format=%T', commit]).trim())
    const metadata = git(root, ['show', '-s', '--format=%an%x00%ae%x00%cn%x00%ce', commit]).split('\0')
    for (const email of [metadata[1], metadata[3]]) if (email && NON_NOREPLY_EMAIL.test(email)) addFinding(findings, `commit ${commit.slice(0, 12)}`, 'contains a non-noreply author or committer email')
    const entries = git(root, ['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean)
    for (const entry of entries) {
      const [header, path] = entry.split('\t'); const [mode, type, oid] = header.split(' ')
      checkPath(findings, path)
      if (mode === '120000') { addFinding(findings, `${commit.slice(0, 12)}:${path}`, 'historical symlinks are not allowed'); continue }
      if (type === 'blob') {
        const paths = blobs.get(oid) || new Set(); paths.add(path); blobs.set(oid, paths)
      }
    }
  }
  const selfRelative = relative(root, SELF_PATH)
  for (const [oid, paths] of blobs) {
    if (paths.size === 1 && paths.has(selfRelative)) continue
    checkContent(findings, `history blob ${oid.slice(0, 12)}`, gitBuffer(root, ['cat-file', 'blob', oid]))
  }
  return {commits: commits.length, trees: trees.size, blobs: blobs.size}
}

export function checkPublicSafety(cwd = process.cwd()) {
  const root = repositoryRoot(cwd); const findings = []
  const workingFiles = scanWorkingTree(root, findings)
  const history = scanHistory(root, findings)
  return {root, findings, evidence: {working_files: workingFiles, ...history}}
}

export function main(cwd = process.cwd()) {
  try {
    const {findings, evidence} = checkPublicSafety(cwd)
    const counts = `working files=${evidence.working_files}, commits=${evidence.commits}, trees=${evidence.trees}, blobs=${evidence.blobs}`
    if (findings.length === 0) { console.log(`Public safety check passed (${counts}).`); return 0 }
    console.error(`Public safety check failed (${counts}):`)
    for (const finding of findings) console.error(`- ${finding}`)
    return 1
  } catch (error) { console.error(`Public safety check could not run: ${error.message}`); return 2 }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = main()
