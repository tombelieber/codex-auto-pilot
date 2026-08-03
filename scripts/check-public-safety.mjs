#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {existsSync, lstatSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const ALLOWED_ENV_FILES = new Set(['.env.example'])
const PRIVATE_KEY_FILE = /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|p12|pfx|key))$/i
const PRIVATE_PATH = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const ALLOWED_CONTENT_EMAIL = /^(?:[A-Z0-9._%+-]+@users\.noreply\.github\.com|noreply@github\.com)$/i
const ALLOWED_GIT_IDENTITIES = [
  {name: 'tombelieber', email: /^(?:tombelieber|[0-9]+\+tombelieber)@users\.noreply\.github\.com$/i},
  {name: 'Tom Tang', email: /^(?:tombelieber|[0-9]+\+tombelieber)@users\.noreply\.github\.com$/i},
  {name: 'GitHub', email: /^noreply@github\.com$/i},
]
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
function checkPath(findings, file, label) {
  const basename = file.split('/').at(-1)
  if (basename.startsWith('.env') && !ALLOWED_ENV_FILES.has(basename)) addFinding(findings, label, 'environment files are not allowed')
  if (PRIVATE_KEY_FILE.test(file)) addFinding(findings, label, 'private-key-like filename is not allowed')
}
function checkContent(findings, label, content) {
  const text = content.toString('utf8')
  if (PRIVATE_PATH.test(text)) addFinding(findings, label, 'contains a private absolute home path')
  const emails = text.match(EMAIL) || []
  if (emails.some((email) => !ALLOWED_CONTENT_EMAIL.test(email))) addFinding(findings, label, 'contains a non-noreply email address')
  for (const {name, pattern} of SECRET_PATTERNS) if (pattern.test(text)) addFinding(findings, label, `contains ${name}`)
}
function checkIdentity(findings, label, name, email) {
  if (!ALLOWED_GIT_IDENTITIES.some((identity) => identity.name === (name || '').trim() && identity.email.test((email || '').trim()))) {
    addFinding(findings, label, 'contains an unexpected author or committer identity')
  }
}

function checkPathText(findings, label, path) { checkContent(findings, label, Buffer.from(path)) }

function scanWorkingTree(root, findings) {
  let files = 0
  for (const file of publicFiles(root)) {
    const absolute = resolve(root, file)
    if (!existsSync(absolute)) continue
    const stats = lstatSync(absolute); files += 1
    const label = `working tree entry ${files}`
    checkPath(findings, file, label)
    checkPathText(findings, label, file)
    if (stats.isSymbolicLink()) { addFinding(findings, label, 'symlinks are not allowed'); continue }
    if (!stats.isFile()) continue
    checkContent(findings, label, readFileSync(absolute))
  }
  return files
}

function scanHistory(root, findings) {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    addFinding(findings, 'repository history', 'is shallow and cannot be scanned completely')
  }
  if (!hasHistory(root)) return {commits: 0, trees: 0, blobs: 0, tag_objects: 0}
  const commits = git(root, ['rev-list', '--all']).trim().split('\n').filter(Boolean)
  const blobs = new Map(); const trees = new Set()
  function collectTree(treeish) {
    const rootTree = git(root, ['rev-parse', `${treeish}^{tree}`]).trim()
    trees.add(rootTree)
    const entries = git(root, ['ls-tree', '-r', '-t', '-z', treeish]).split('\0').filter(Boolean)
    for (const entry of entries) {
      const separator = entry.indexOf('\t')
      if (separator < 0) throw new Error('git ls-tree returned an entry without a path separator')
      const header = entry.slice(0, separator); const path = entry.slice(separator + 1)
      const [mode, type, oid] = header.split(' ')
      const label = 'historical tree entry'
      checkPath(findings, path, label)
      checkPathText(findings, label, path)
      if (type === 'tree') { trees.add(oid); continue }
      if (mode === '120000') { addFinding(findings, label, 'historical symlinks are not allowed'); continue }
      if (type === 'blob') {
        const paths = blobs.get(oid) || new Set(); paths.add(path); blobs.set(oid, paths)
      }
    }
  }
  for (const commit of commits) {
    const metadata = git(root, ['show', '-s', '--format=%B%x00%an%x00%ae%x00%cn%x00%ce', commit]).split('\0')
    const label = `commit ${commit.slice(0, 12)}`
    checkContent(findings, label, Buffer.from(metadata[0] || ''))
    checkIdentity(findings, label, metadata[1], metadata[2])
    checkIdentity(findings, label, metadata[3], metadata[4])
    collectTree(commit)
  }
  const tagObjects = new Set()
  const refRoots = git(root, ['for-each-ref', '--format=%(objecttype)%09%(objectname)']).split('\n')
    .map((line) => line.split('\t')).filter(([, oid]) => oid)
  for (const [type, oid] of refRoots) {
    if (type === 'tree') collectTree(oid)
    else if (type === 'blob') {
      const paths = blobs.get(oid) || new Set(); paths.add('direct ref target'); blobs.set(oid, paths)
    }
  }
  const tagRoots = refRoots.filter(([type]) => type === 'tag').map(([, oid]) => oid)
  const pendingTags = [...tagRoots]
  while (pendingTags.length > 0) {
    const oid = pendingTags.pop()
    if (tagObjects.has(oid)) continue
    tagObjects.add(oid)
    const label = `annotated tag ${oid.slice(0, 12)}`
    const raw = gitBuffer(root, ['cat-file', 'tag', oid])
    checkContent(findings, label, raw)
    const tagger = raw.toString('utf8').match(/^tagger (.+) <([^>]+)> /m)
    if (!tagger) addFinding(findings, label, 'is missing valid tagger metadata')
    else checkIdentity(findings, label, tagger[1], tagger[2])
    const target = raw.toString('utf8').match(/^object ([0-9a-f]+)\ntype (blob|tree|commit|tag)(?:\n|$)/m)
    if (!target) { addFinding(findings, label, 'has an unsupported target'); continue }
    const [, targetOid, targetType] = target
    if (targetType === 'tag') pendingTags.push(targetOid)
    else if (targetType === 'tree') collectTree(targetOid)
    else if (targetType === 'blob') {
      const paths = blobs.get(targetOid) || new Set(); paths.add('annotated tag target'); blobs.set(targetOid, paths)
    }
  }
  for (const oid of blobs.keys()) {
    checkContent(findings, `history blob ${oid.slice(0, 12)}`, gitBuffer(root, ['cat-file', 'blob', oid]))
  }
  return {commits: commits.length, trees: trees.size, blobs: blobs.size, tag_objects: tagObjects.size}
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
    const counts = `working files=${evidence.working_files}, commits=${evidence.commits}, trees=${evidence.trees}, blobs=${evidence.blobs}, tag objects=${evidence.tag_objects}`
    if (findings.length === 0) { console.log(`Public safety check passed (${counts}).`); return 0 }
    console.error(`Public safety check failed (${counts}):`)
    for (const finding of findings) console.error(`- ${finding}`)
    return 1
  } catch (error) { console.error(`Public safety check could not run: ${error.message}`); return 2 }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = main()
