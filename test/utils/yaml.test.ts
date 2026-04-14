import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/utils/yaml.js';

describe('parseFrontmatter', () => {
  it('parses normal frontmatter', () => {
    const content = `---
name: frontend-design
description: Create distinctive frontend interfaces
origin: ECC
trigger: "when building UI"
---

# Frontend Design

Use this when...`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({
      name: 'frontend-design',
      description: 'Create distinctive frontend interfaces',
      origin: 'ECC',
      trigger: 'when building UI',
    });
    expect(result.body).toBe('\n# Frontend Design\n\nUse this when...');
  });

  it('returns empty frontmatter when none exists', () => {
    const content = `# Build and Fix

Incrementally fix build errors...`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('# Build and Fix\n\nIncrementally fix build errors...');
  });

  it('handles empty file', () => {
    const result = parseFrontmatter('');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('');
  });

  it('handles quoted values', () => {
    const content = `---
name: "quoted-name"
description: "This has spaces"
---

Content`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({
      name: 'quoted-name',
      description: 'This has spaces',
    });
  });

  it('handles boolean and number values', () => {
    const content = `---
count: 42
enabled: true
disabled: false
---

Content`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({
      count: 42,
      enabled: true,
      disabled: false,
    });
  });

  it('handles frontmatter with empty lines after', () => {
    const content = `---
name: test
---

# Heading

Paragraph`;

    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ name: 'test' });
    expect(result.body).toBe('\n# Heading\n\nParagraph');
  });
});
