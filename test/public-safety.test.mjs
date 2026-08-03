import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = resolve(fileURLToPath(new URL('../scripts/check-public-safety.mjs', import.meta.url)));

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'public-safety-'));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

function run(root) {
  try {
    return { status: 0, output: execFileSync(process.execPath, [checker], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { status: error.status, output: `${error.stdout}${error.stderr}` };
  }
}

function withRepo(fn) {
  const root = makeRepo();
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('passes safe tracked and untracked files', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'No telemetry. The word secret is ordinary documentation.\n');
  writeFileSync(join(root, '.env.example'), 'OPTIONAL_VALUE=\n');
  writeFileSync(join(root, 'draft.md'), 'untracked content is scanned too\n');
  execFileSync('git', ['add', 'README.md', '.env.example'], { cwd: root });
  const result = run(root);
  assert.equal(result.status, 0, result.output);
}));

test('rejects a private home path in an untracked file', () => withRepo((root) => {
  const privatePath = ['/Users', 'person', 'private'].join('/');
  writeFileSync(join(root, 'notes.md'), privatePath);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /private absolute home path/);
}));

test('rejects common credential material without matching ordinary words', () => withRepo((root) => {
  const key = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  writeFileSync(join(root, 'config.txt'), `value=${key}\n`);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /OpenAI API key/);
}));

test('rejects environment files, private-key names, emails, and symlinks', () => withRepo((root) => {
  writeFileSync(join(root, '.env'), 'VALUE=1\n');
  mkdirSync(join(root, 'keys'));
  writeFileSync(join(root, 'keys', 'id_rsa'), 'placeholder\n');
  writeFileSync(join(root, 'contact.md'), ['contact', 'person', '@', 'example.com'].join(''));
  writeFileSync(join(root, 'target.txt'), 'target\n');
  symlinkSync('target.txt', join(root, 'linked.txt'));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /environment files/);
  assert.match(result.output, /private-key-like filename/);
  assert.match(result.output, /non-noreply email/);
  assert.match(result.output, /symlinks are not allowed/);
}));
