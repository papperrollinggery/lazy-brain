import { describe, expect, it } from 'vitest';
import { parseSkillSchema } from '../../src/schema/skill-schema.js';

describe('parseSkillSchema', () => {
  it('parses full frontmatter schema from inline JSON fields', () => {
    const schema = parseSkillSchema({
      useWhen: '["build a dashboard"]',
      avoidWhen: '["unclear task"]',
      inputs: '["target user", "metrics"]',
      workflow: '[{"id":"plan","title":"Plan dashboard","detail":"Define operating questions"}]',
      verification: '[{"id":"build","title":"Build succeeds","command":"npm run build","required":true}]',
      doneWhen: '["dashboard answers operating questions"]',
      contextNeeded: '["current data source"]',
      guardrails: '[{"title":"No marketing layout","strength":"strict"}]',
    });

    expect(schema).toBeDefined();
    expect(schema!.useWhen).toEqual(['build a dashboard']);
    expect(schema!.workflow[0]).toMatchObject({ id: 'plan', title: 'Plan dashboard', source: 'schema' });
    expect(schema!.verification[0]).toMatchObject({ id: 'build', command: 'npm run build', required: true });
    expect(schema!.guardrails[0]).toMatchObject({ title: 'No marketing layout', strength: 'strict' });
  });

  it('returns undefined when no schema keys are present', () => {
    expect(parseSkillSchema({ name: 'code-review', description: 'Review code' })).toBeUndefined();
  });

  it('does not crash on bad fields and returns warnings', () => {
    const schema = parseSkillSchema({
      useWhen: 42,
      workflow: '[not-json]',
      verification: '[{"command":"npm test"}]',
      guardrails: '[{"title":"Keep safe","strength":"extreme"}]',
    });

    expect(schema).toBeDefined();
    expect(schema!.useWhen).toEqual([]);
    expect(schema!.workflow).toEqual([]);
    expect(schema!.verification).toEqual([]);
    expect(schema!.guardrails[0]).toMatchObject({ title: 'Keep safe', strength: 'normal' });
    expect(schema!.warnings!.length).toBeGreaterThan(0);
  });
});
