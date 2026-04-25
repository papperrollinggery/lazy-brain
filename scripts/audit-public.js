#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = pkg.version;
const failures = [];
let packedFiles = [];

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function fail(message) {
  failures.push(message);
}

function checkVersion() {
  const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf-8') : '';
  if (!changelog.includes(`## [v${version}]`)) {
    fail(`CHANGELOG.md missing ## [v${version}]`);
  }
  if (existsSync('dist/bin/lazybrain.js')) {
    const output = run('node', ['dist/bin/lazybrain.js', '--version']).trim();
    if (output !== `lazybrain ${version}`) fail(`CLI version mismatch: ${output} != lazybrain ${version}`);
  }
}

function checkPack() {
  const raw = run('npm', ['pack', '--dry-run', '--json']);
  const entries = JSON.parse(raw);
  const files = entries[0]?.files?.map(file => file.path).sort() ?? [];
  packedFiles = files;
  const allowed = files.every(file =>
    file === 'package.json' ||
    file === 'README.md' ||
    file === 'README_CN.md' ||
    file === 'CHANGELOG.md' ||
    file === 'LICENSE' ||
    file.startsWith('dist/'));
  if (!allowed) {
    fail(`npm package includes unexpected files: ${files.filter(file =>
      file !== 'package.json' &&
      file !== 'README.md' &&
      file !== 'README_CN.md' &&
      file !== 'CHANGELOG.md' &&
      file !== 'LICENSE' &&
      !file.startsWith('dist/')).join(', ')}`);
  }
  const required = ['dist/bin/lazybrain.js', 'dist/bin/hook.js', 'dist/index.js', 'dist/index.d.ts'];
  for (const file of required) {
    if (!files.includes(file)) fail(`npm package missing ${file}`);
  }
}

const allowlist = [
  { file: /^scripts\/audit-public\.js$/, pattern: /.*/ },
  { file: /^test\/hook\/plan\.test\.ts$/, pattern: /sk-live123|Bearer abc/ },
  { file: /^test\/config\/redaction\.test\.ts$/, pattern: /real-(compile|embedding|secretary)-key/ },
  { file: /^test\/matcher\/semantic-engine\.test\.ts$/, pattern: /test-key/ },
  { file: /^test\/embeddings\/cache-rebuild\.test\.ts$/, pattern: /fake-key/ },
  { file: /^test\/health\/api-test\.test\.ts$/, pattern: /private-(compile|embedding|secretary)-key|fake-key/ },
  { file: /^src\/constants\.ts$/, pattern: /\.omc/ },
  { file: /^src\/utils\/omc-state\.ts$/, pattern: /\.omc/ },
  { file: /^dist\//, pattern: /\.omc/ },
  { file: /^docs\/REVIEW\.md$/, pattern: /\.paperclip|\.omc/ },
  { file: /^\.gitignore$/, pattern: /docs\/IRI-\*|docs\/iri-2/ },
];

const checks = [
  { name: 'home path', pattern: /\/Users\/[A-Za-z0-9._-]+/ },
  { name: 'private docs', pattern: /docs\/IRI-|docs\/iri-2|subtask-split|board-resubmission/ },
  { name: 'paperclip path', pattern: /\.paperclip/ },
  { name: 'internal workspace name', pattern: /lazy_user/ },
  { name: 'internal author', pattern: /release-engineer@gstack\.local|GStack Release Engineer|382206596@qq\.com/ },
  { name: 'secret token', pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/ },
  { name: 'api key assignment', pattern: /(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/i },
];

function isAllowed(file, line) {
  return allowlist.some(entry => entry.file.test(file) && entry.pattern.test(line));
}

function scanFileContent(file, prefix = '') {
  let content = '';
  try { content = readFileSync(file, 'utf-8'); } catch { return; }
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const check of checks) {
      if (check.pattern.test(line) && !isAllowed(file, line)) {
        fail(`${prefix}${check.name}: ${file}:${index + 1}`);
      }
    }
  });
}

function checkPublicContent() {
  const tracked = run('git', ['ls-files']).trim().split('\n').filter(Boolean);
  const files = tracked.filter(file =>
    !file.startsWith('.git/') &&
    !file.startsWith('node_modules/') &&
    !file.startsWith('dist/') &&
    file !== 'package-lock.json' &&
    file !== 'pnpm-lock.yaml');
  for (const file of files) scanFileContent(file);

  for (const file of packedFiles) {
    if (existsSync(file)) scanFileContent(file, 'package ');
  }

  const untracked = run('git', ['ls-files', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean);
  const suspicious = untracked.filter(file => /docs\/IRI-|docs\/iri-2|\.paperclip|\.omc|lazy_user/.test(file));
  if (suspicious.length > 0) {
    fail(`suspicious untracked public files are not ignored: ${suspicious.map(file => relative(root, file)).join(', ')}`);
  }
}

checkVersion();
checkPack();
checkPublicContent();

if (failures.length > 0) {
  console.error('Public audit failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Public audit passed for lazybrain@${version}`);
