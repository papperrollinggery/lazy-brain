import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { generateWiki } from '../../src/graph/wiki-generator.js';
import { Graph } from '../../src/graph/graph.js';

const TEST_WIKI_DIR = '/tmp/lazybrain-test-wiki';

describe('generateWiki', () => {
  beforeEach(() => {
    if (existsSync(TEST_WIKI_DIR)) {
      rmSync(TEST_WIKI_DIR, { recursive: true });
    }
    mkdirSync(TEST_WIKI_DIR, { recursive: true });
  });

  it('generates wiki with index and category files', () => {
    const graph = new Graph();

    graph.addNode({
      id: 'skill-1',
      kind: 'skill',
      name: 'code-review',
      description: 'Comprehensive code review',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: ['review', 'quality'],
      exampleQueries: [],
      category: 'code-quality',
    });

    graph.addNode({
      id: 'agent-1',
      kind: 'agent',
      name: 'reviewer',
      description: 'Code review specialist',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'code-quality',
    });

    const result = generateWiki(graph, { outputDir: TEST_WIKI_DIR });

    expect(result.articlesWritten).toBeGreaterThanOrEqual(2);
    expect(existsSync(result.indexPath)).toBe(true);
    expect(existsSync(join(TEST_WIKI_DIR, 'code-quality.md'))).toBe(true);
  });

  it('index contains correct capability count', () => {
    const graph = new Graph();

    graph.addNode({
      id: 'skill-1',
      kind: 'skill',
      name: 'test-skill',
      description: 'Test',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'other',
    });

    const result = generateWiki(graph, { outputDir: TEST_WIKI_DIR });
    const indexContent = readFileSync(result.indexPath, 'utf-8');

    expect(indexContent).toContain('# LazyBrain Wiki');
    expect(indexContent).toContain('1 capabilities');
  });

  it('category file contains capability details', () => {
    const graph = new Graph();

    graph.addNode({
      id: 'skill-1',
      kind: 'skill',
      name: 'code-review',
      description: 'Code review description',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: ['review', 'quality'],
      exampleQueries: [],
      category: 'code-quality',
    });

    generateWiki(graph, { outputDir: TEST_WIKI_DIR });
    const categoryContent = readFileSync(join(TEST_WIKI_DIR, 'code-quality.md'), 'utf-8');

    expect(categoryContent).toContain('# Code Quality');
    expect(categoryContent).toContain('**code-review**');
    expect(categoryContent).toContain('Tags: review, quality');
  });

  it('uses Obsidian wiki links format in category files', () => {
    const graph = new Graph();

    graph.addNode({
      id: 'skill-1',
      kind: 'skill',
      name: 'skill-a',
      description: 'Skill A',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'other',
    });

    graph.addLink({
      source: 'skill-1',
      target: 'skill-1',
      type: 'similar_to',
      confidence: 0.8,
    });

    generateWiki(graph, { outputDir: TEST_WIKI_DIR });
    const categoryContent = readFileSync(join(TEST_WIKI_DIR, 'other.md'), 'utf-8');

    expect(categoryContent).toContain('[[skill-a]]');
  });
});
