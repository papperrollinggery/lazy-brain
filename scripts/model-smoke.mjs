#!/usr/bin/env node
// Optional, explicitly requested inference evaluation. Never run by npm test/CI.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--run') || !args.includes('--model') || !args.includes('--output')) {
  throw new Error('Explicit inference run: node scripts/model-smoke.mjs --run --model MODEL --effort EFFORT --output DIRECTORY');
}
const model = option('--model');
const effort = args.includes('--effort') ? option('--effort') : 'medium';
const output = resolve(option('--output'));
const sandbox = mkdtempSync(join(tmpdir(), 'lazybrain-model-'));
const library = join(sandbox, 'library');
const skill = join(library, 'valley-beat-card');
const ownSkill = join(sandbox, '.agents', 'skills', 'lazybrain-find');
mkdirSync(output, { recursive: true });
mkdirSync(skill, { recursive: true });
mkdirSync(dirname(ownSkill), { recursive: true });
cpSync(join(root, 'skills/lazybrain-find'), ownSkill, { recursive: true });
writeFileSync(join(skill, 'SKILL.md'), [
  '---', 'name: valley-beat-card',
  'description: Write an eight-second valley scene as a Chinese acting beat card, with sound-driven movement.',
  '---', '',
  'Create one continuous eight-second shot. Output five short Chinese lines labelled 题名、画面、动作、声音、结束状态.',
  'The performer hears a distant bell, pauses, then turns toward the sound. Keep the action physically performable.',
  'Use warm backlight through mist. End with the performer looking off-screen toward the valley.',
  'Do not generate media, write files, run programs, or open a browser.',
].join('\n'));
const cases = [
  {
    name: 'lookup-and-use', shouldSearch: true,
    prompt: 'Use $lazybrain-find to find the eight-second valley acting beat card Skill stored in this project’s local library, whose name I forgot. Follow the selected Skill to write a Chinese card for a performer hearing a distant bell and turning toward it in a misty valley. This is a read-only fixture exercise: return the card, do not generate media, install anything, write files, or look up external material.',
  },
  {
    name: 'known-entry', shouldSearch: false,
    prompt: 'I already selected the Skill at ' + join(skill, 'SKILL.md') + '. Read it directly and draft its Chinese eight-second valley card for a performer who hears a bell and turns toward it. Return the card only. Read-only fixture exercise; no media generation, file writes, installation, or external research.',
  },
  {
    name: 'ordinary-question', shouldSearch: false,
    prompt: '用两句话说明：查到工具的本地文件，与确认工具在当前任务中可调用，有什么区别？只回答这个概念问题。',
  },
];
const config = {
  command: process.execPath, args: [join(root, 'dist/bin/mcp.js')],
  env: { LAZYBRAIN_SCAN_PATHS: library, LAZYBRAIN_DATA_DIR: join(sandbox, 'data') },
};
const tomlString = (value) => JSON.stringify(value);
const inline = '{command=' + tomlString(config.command) + ',args=[' + config.args.map(tomlString).join(',') +
  '],env={LAZYBRAIN_SCAN_PATHS=' + tomlString(library) + ',LAZYBRAIN_DATA_DIR=' +
  tomlString(join(sandbox, 'data')) + '}}';
const reports = [];
const runtimeFiles = [
  'package.json', '.codex-plugin/plugin.json', '.mcp.json',
  'skills/lazybrain-find/SKILL.md', 'skills/lazybrain-find/agents/openai.yaml',
  ...readdirSync(join(root, 'dist'), { recursive: true }).filter((path) => String(path).endsWith('.js')).map((path) => 'dist/' + path),
].sort();
const hashes = Object.fromEntries(runtimeFiles.map((path) => [
  path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex'),
]));

try {
  for (const item of cases) {
    const commandArgs = ['exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
      '--sandbox', 'read-only', '--json', '--color', 'never', '-C', sandbox, '-m', model,
      '-c', 'model_reasoning_effort=' + tomlString(effort), '-c', 'approval_policy="never"',
      '-c', 'plugins."lazybrain@lazybrain-local".enabled=false',
      '-c', 'mcp_servers.lazybrain_eval=' + inline,
      '-o', join(output, item.name + '.md'), item.prompt];
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn('codex', commandArgs, {
        cwd: sandbox, env: { ...process.env, LAZYBRAIN_SCAN_PATHS: library, LAZYBRAIN_DATA_DIR: join(sandbox, 'data') },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill('SIGTERM'); }, 300_000);
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolveResult({ code, signal, stdout, stderr });
      });
    });
    writeFileSync(join(output, item.name + '.jsonl'), result.stdout);
    writeFileSync(join(output, item.name + '.stderr.txt'), result.stderr);
    assert.equal(result.code, 0, item.name + ': Codex failed; inspect saved stderr.');
    const events = result.stdout.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    const toolEvents = events.filter((event) => event.item?.type === 'mcp_tool_call' || event.item?.type === 'command_execution');
    const called = toolEvents.some((event) =>
      /lazybrain_recommend|lazybrain_catalog/.test(JSON.stringify(event.item)) &&
      /lazybrain_eval/.test(JSON.stringify(event.item)));
    const text = readFileSync(join(output, item.name + '.md'), 'utf8');
    reports.push({ case: item.name, expectedSearch: item.shouldSearch, observedSearch: called,
      completed: text.length > 0, exitCode: result.code });
    process.stdout.write(JSON.stringify(reports.at(-1)) + '\n');
  }
  const report = {
    requestedModel: model, requestedEffort: effort,
    codexVersion: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(),
    runtimeFiles: hashes,
    version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    skillSha256: createHash('sha256').update(readFileSync(join(root, 'skills/lazybrain-find/SKILL.md'))).digest('hex'),
    cases: reports,
    boundary: 'Read-only Codex CLI fixture runs using existing account authentication; inspect transcripts and artifacts for behavioral verdicts.',
  };
  writeFileSync(join(output, 'model-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  assert.ok(reports.every((item) => item.completed && item.expectedSearch === item.observedSearch), 'Tool-choice mismatch; inspect transcripts.');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
