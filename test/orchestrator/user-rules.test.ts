import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadUserRules } from '../../src/orchestrator/user-rules.js';
import { signalFromQuery } from '../../src/orchestrator/signals.js';

describe('user rules', () => {
  test('loads rules.yaml into executable orchestration rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-rules-'));
    const rulesPath = join(dir, 'rules.yaml');
    try {
      writeFileSync(rulesPath, [
        'rules:',
        '  - name: my-deploy-flow',
        '    match: "deploy|ship|release"',
        '    skills: [security-review, tdd-workflow, ship]',
        '    confidence: 0.9',
        '    sequence: sequential',
      ].join('\n'));
      const [rule] = loadUserRules(rulesPath);
      const plan = rule.plan(signalFromQuery('deploy payment feature'));
      expect(rule.match(signalFromQuery('ship release'))).toBe(true);
      expect(plan.enhancements.map((item) => item.name)).toEqual(['security-review', 'tdd-workflow', 'ship']);
      expect(plan.confidence).toBe(0.9);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
