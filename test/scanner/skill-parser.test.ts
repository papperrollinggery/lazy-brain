import { describe, it, expect } from 'vitest';
import { parseSkill } from '../../src/scanner/parsers/skill-parser.js';

describe('parseSkill', () => {
  it('parses standard format with frontmatter', () => {
    const content = `---
name: frontend-design
description: Create distinctive frontend interfaces with high design quality.
origin: ECC
---

# Frontend Design

Use this when the task is not just "make it work" but "make it look designed."`;

    const result = parseSkill(
      '/home/user/.claude/ecc/skills/frontend-design/SKILL.md',
      content
    );

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('skill');
    expect(result!.name).toBe('frontend-design');
    expect(result!.description).toBe('Create distinctive frontend interfaces with high design quality.');
    expect(result!.origin).toBe('ECC');
    expect(result!.triggers).toBeUndefined();
    expect(result!.compatibility).toContain('claude-code');
  });

  it('parses with trigger field', () => {
    const content = `---
name: continuous-learning-v2
description: Extract behavioral patterns from conversations
origin: ECC
trigger: "when writing new functions"
---

# Continuous Learning v2`;

    const result = parseSkill(
      '/home/user/.claude/ecc/skills/continuous-learning-v2/SKILL.md',
      content
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('continuous-learning-v2');
    expect(result!.triggers).toEqual(['when writing new functions']);
  });

  it('infers origin from path when not in frontmatter', () => {
    const content = `---
name: graphify
description: any input → knowledge graph
trigger: /graphify
---

# /graphify`;

    const result = parseSkill(
      '/home/user/.claude/ecc/skills/graphify/SKILL.md',
      content
    );

    expect(result).not.toBeNull();
    expect(result!.origin).toBe('ECC');
  });

  it('handles no frontmatter', () => {
    const content = `# Some Skill

This skill does something useful.`;

    const result = parseSkill(
      '/home/user/.claude/skills/some-skill/SKILL.md',
      content
    );

    expect(result).not.toBeNull();
    expect(result!.name).toBe('some-skill');
    expect(result!.description).toBe('This skill does something useful.');
    expect(result!.origin).toBe('local');
  });

  it('returns null when name and description are missing', () => {
    const result = parseSkill('/SKILL.md', '');
    expect(result).toBeNull();
  });
});
