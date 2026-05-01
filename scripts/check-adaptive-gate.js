#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function run(label, cmd, args) {
  console.log(`\n[adaptive-gate] ${label}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function capture(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

run('build dist for CLI doctor checks', 'npm', ['run', 'build']);
run('adaptive regression tests', 'npm', [
  'test',
  '--',
  'test/benchmark/match-quality.test.ts',
  'test/orchestrator/route.test.ts',
  'test/orchestrator/choice-preferences.test.ts',
  'test/diagnostics/conflicts.test.ts',
  'test/server/server.test.ts',
]);

console.log('\n[adaptive-gate] doctor warning summary');
const report = JSON.parse(capture('node', ['dist/bin/lazybrain.js', 'doctor', '--all', '--json']));
const scopes = Array.isArray(report.scopes) ? report.scopes : [];
let hookWarnings = 0;
let capabilityWarnings = 0;
let capabilityInfo = 0;

for (const scope of scopes) {
  const hooks = scope.conflicts?.hooks ?? [];
  const capabilities = scope.conflicts?.capabilities ?? [];
  const hookWarns = hooks.filter(conflict => conflict.severity === 'warn' || conflict.severity === 'block');
  const capabilityWarns = capabilities.filter(conflict => conflict.severity === 'warn' || conflict.severity === 'block');
  const infos = capabilities.filter(conflict => conflict.severity === 'info');
  hookWarnings += hookWarns.length;
  capabilityWarnings += capabilityWarns.length;
  capabilityInfo += infos.length;
  console.log(`  ${scope.scope}: hook warnings ${hookWarns.length}, capability warnings ${capabilityWarns.length}, capability info ${infos.length}`);
  for (const conflict of [...hookWarns, ...capabilityWarns]) {
    console.log(`    - [${conflict.severity}] ${conflict.group}: ${conflict.suggestedAction ?? conflict.reason}`);
  }
}

if (hookWarnings > 0 || capabilityWarnings > 0) {
  console.error(`Adaptive gate failed: hookWarnings=${hookWarnings}, capabilityWarnings=${capabilityWarnings}`);
  process.exit(1);
}

console.log(`Adaptive gate passed: hookWarnings=0, capabilityWarnings=0, capabilityInfo=${capabilityInfo}`);
