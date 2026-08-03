#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_PATH = fileURLToPath(import.meta.url);
const ALLOWED_ENV_FILES = new Set(['.env.example']);
const PRIVATE_KEY_FILE = /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|p12|pfx|key))$/i;
const PRIVATE_PATH = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/;
const NON_NOREPLY_EMAIL = /\b[A-Z0-9._%+-]+@(?!users\.noreply\.github\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SECRET_VALUE = String.raw`(?:[A-Za-z0-9_./+=-]{8,})`;
const SECRET_PATTERNS = [
  { name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'credential assignment', pattern: new RegExp(String.raw`\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["']?${SECRET_VALUE}`, 'i') },
  { name: 'private key block', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
];

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function repositoryRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel']).trim();
}

function publicFiles(root) {
  const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean);
  return [...new Set(listed)].sort();
}

function addFinding(findings, file, reason) {
  findings.push(`${file}: ${reason}`);
}

export function checkPublicSafety(cwd = process.cwd()) {
  const root = repositoryRoot(cwd);
  const findings = [];

  for (const file of publicFiles(root)) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) continue;

    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) {
      addFinding(findings, file, 'symlinks are not allowed in the public distribution');
      continue;
    }
    if (!stats.isFile()) continue;

    const basename = file.split('/').at(-1);
    if (basename.startsWith('.env') && !ALLOWED_ENV_FILES.has(basename)) {
      addFinding(findings, file, 'environment files are not allowed');
    }
    if (PRIVATE_KEY_FILE.test(file)) {
      addFinding(findings, file, 'private-key-like filename is not allowed');
    }
    if (absolute === SELF_PATH) continue;

    const content = readFileSync(absolute, 'utf8');
    if (PRIVATE_PATH.test(content)) addFinding(findings, file, 'contains a private absolute home path');
    if (NON_NOREPLY_EMAIL.test(content)) addFinding(findings, file, 'contains a non-noreply email address');
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(content)) addFinding(findings, file, `contains ${name}`);
    }
  }

  return { root, findings };
}

export function main(cwd = process.cwd()) {
  try {
    const { findings } = checkPublicSafety(cwd);
    if (findings.length === 0) {
      console.log('Public safety check passed.');
      return 0;
    }
    console.error('Public safety check failed:');
    for (const finding of findings) console.error(`- ${finding}`);
    return 1;
  } catch (error) {
    console.error(`Public safety check could not run: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
