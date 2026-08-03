import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

function commit(root, message, email = 'tombelieber@users.noreply.github.com', name = 'tombelieber') {
  execFileSync('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '--quiet', '-m', message], {cwd: root});
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

test('rejects a secret deleted from the current tree', () => withRepo((root) => {
  const key = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  writeFileSync(join(root, 'old.txt'), key);
  execFileSync('git', ['add', 'old.txt'], {cwd: root}); commit(root, 'add temporary file');
  execFileSync('git', ['rm', '--quiet', 'old.txt'], {cwd: root}); commit(root, 'remove temporary file');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /OpenAI API key/);
  assert.match(result.output, /commits=2/);
}));

test('rejects deleted private paths and non-noreply commit metadata', () => withRepo((root) => {
  writeFileSync(join(root, '.env'), 'VALUE=1\n');
  execFileSync('git', ['add', '-f', '.env'], {cwd: root}); commit(root, 'private env', ['person', '@', 'example.com'].join(''));
  execFileSync('git', ['rm', '--quiet', '.env'], {cwd: root}); commit(root, 'remove env');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /environment files/);
  assert.match(result.output, /unexpected author or committer identity/);
}));

test('rejects a shallow clone even when its visible tree is clean', () => withRepo((root) => {
  const key = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  writeFileSync(join(root, 'removed-secret.txt'), key);
  execFileSync('git', ['add', 'removed-secret.txt'], {cwd: root}); commit(root, 'add then delete secret');
  execFileSync('git', ['rm', '--quiet', 'removed-secret.txt'], {cwd: root}); commit(root, 'clean visible tree');
  const clone = mkdtempSync(join(tmpdir(), 'public-safety-shallow-'));
  try {
    execFileSync('git', ['clone', '--quiet', '--depth=1', `file://${root}`, clone]);
    const result = run(clone);
    assert.equal(result.status, 1);
    assert.match(result.output, /shallow/);
  } finally { rmSync(clone, {recursive: true, force: true}); }
}));

test('scans the scanner source itself without regex-source false positives', () => withRepo((root) => {
  mkdirSync(join(root, 'scripts'));
  const key = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  writeFileSync(join(root, 'scripts', 'check-public-safety.mjs'), `${readFileSync(checker, 'utf8')}\n// ${key}\n`);
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'add scanner');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /OpenAI API key/);
}));

test('rejects private commit messages and unexpected author or committer names', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'clean\n');
  execFileSync('git', ['add', 'README.md'], {cwd: root});
  commit(root, `private ${['person', '@', 'example.com'].join('')} ${['/Users', 'person', 'project'].join('/')}`, 'tombelieber@users.noreply.github.com', 'Other Person');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /non-noreply email/);
  assert.match(result.output, /private absolute home path/);
  assert.match(result.output, /unexpected author or committer identity/);
}));

test('rejects private annotated tag messages and tagger metadata', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'clean\n');
  execFileSync('git', ['add', 'README.md'], {cwd: root}); commit(root, 'initial');
  execFileSync('git', ['-c', 'user.name=Other Person', '-c', `user.email=${['person', '@', 'example.com'].join('')}`, 'tag', '-a', 'v1', '-m', `private ${['/Users', 'person', 'project'].join('/')}`], {cwd: root});
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /private absolute home path/);
  assert.match(result.output, /unexpected author or committer identity/);
  assert.match(result.output, /tag objects=1/);
}));

test('an unborn repository works', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'clean\n');
  const result = run(root);
  assert.equal(result.status, 0, result.output);
}));

test('rejects sensitive-looking working and historical path text without echoing it', () => withRepo((root) => {
  const emailPath = ['contact-', 'person', '@', 'example.com.pem'].join('');
  const keyPath = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  writeFileSync(join(root, emailPath), 'clean\n');
  writeFileSync(join(root, keyPath), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'path secrets');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /non-noreply email/);
  assert.match(result.output, /OpenAI API key/);
  assert.doesNotMatch(result.output, new RegExp(emailPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(result.output, new RegExp(keyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}));

test('counts every reachable nested tree object', () => withRepo((root) => {
  mkdirSync(join(root, 'docs', 'nested'), {recursive: true});
  writeFileSync(join(root, 'README.md'), 'clean\n');
  writeFileSync(join(root, 'docs', 'nested', 'guide.md'), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'nested trees');
  const result = run(root);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /trees=3/);
}));

test('follows deleted inner annotated tags and scans their metadata', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'initial');
  const privatePath = ['/Users', 'person', 'private'].join('/');
  execFileSync('git', ['-c', 'user.name=tombelieber', '-c', 'user.email=tombelieber@users.noreply.github.com', 'tag', '-a', 'inner', '-m', privatePath], {cwd: root});
  execFileSync('git', ['-c', 'user.name=tombelieber', '-c', 'user.email=tombelieber@users.noreply.github.com', 'tag', '-a', 'outer', 'inner', '-m', 'safe outer tag'], {cwd: root});
  execFileSync('git', ['tag', '-d', 'inner'], {cwd: root});
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /private absolute home path/);
  assert.match(result.output, /tag objects=2/);
}));

test('scans blobs and trees referenced only by annotated tags', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'initial');
  const key = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {cwd: root, input: key, encoding: 'utf8'}).trim();
  execFileSync('git', ['-c', 'user.name=tombelieber', '-c', 'user.email=tombelieber@users.noreply.github.com', 'tag', '-a', 'blob-only', blob, '-m', 'safe blob tag'], {cwd: root});
  const privatePath = ['contact-', 'person', '@', 'example.com.md'].join('');
  const tree = execFileSync('git', ['mktree'], {cwd: root, input: `100644 blob ${blob}\t${privatePath}\n`, encoding: 'utf8'}).trim();
  execFileSync('git', ['-c', 'user.name=tombelieber', '-c', 'user.email=tombelieber@users.noreply.github.com', 'tag', '-a', 'tree-only', tree, '-m', 'safe tree tag'], {cwd: root});
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /OpenAI API key/);
  assert.match(result.output, /non-noreply email/);
  assert.match(result.output, /tag objects=2/);
}));

test('scans a blob referenced only by a lightweight tag', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'initial');
  const key = ['sk', 'proj', '1234567890abcdefghijk'].join('-');
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {cwd: root, input: key, encoding: 'utf8'}).trim();
  execFileSync('git', ['tag', 'blob-only', blob], {cwd: root});
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /OpenAI API key/);
}));

test('preserves tabs while scanning historical path text', () => withRepo((root) => {
  const privatePath = ['safe\tcontact-', 'person', '@', 'example.com.md'].join('');
  writeFileSync(join(root, privatePath), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'add unusual path');
  execFileSync('git', ['rm', '--quiet', privatePath], {cwd: root}); commit(root, 'remove unusual path');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.output, /non-noreply email/);
  assert.doesNotMatch(result.output, /example\.com/);
}));

test('allows only the GitHub noreply identity pairs', () => withRepo((root) => {
  writeFileSync(join(root, 'README.md'), 'noreply@github.com and tombelieber@users.noreply.github.com are public-safe\n');
  execFileSync('git', ['add', '.'], {cwd: root});
  execFileSync('git', ['-c', 'user.name=GitHub', '-c', 'user.email=noreply@github.com', 'commit', '--quiet', '--author=Tom Tang <12345+tombelieber@users.noreply.github.com>', '-m', 'GitHub merge metadata'], {cwd: root});
  const allowed = run(root);
  assert.equal(allowed.status, 0, allowed.output);
  writeFileSync(join(root, 'second.md'), 'clean\n');
  execFileSync('git', ['add', '.'], {cwd: root}); commit(root, 'bad local identity', 'root@localhost');
  const rejected = run(root);
  assert.equal(rejected.status, 1);
  assert.match(rejected.output, /unexpected author or committer identity/);
}));
