import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/matcher/tag-layer.js';
import { tagMatch } from '../../src/matcher/tag-layer.js';
import type { Capability } from '../../src/types.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const base: Omit<Capability, 'id' | 'name' | 'description' | 'tags' | 'exampleQueries'> = {
  kind: 'skill',
  origin: 'local',
  status: 'installed',
  compatibility: ['claude-code'],
  category: 'code-quality',
};

function cap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    description: '',
    tags: [],
    exampleQueries: [],
    ...base,
    ...overrides,
  };
}

// ─── tokenize ─────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits Latin words', () => {
    expect(tokenize('code review')).toEqual(expect.arrayContaining(['code', 'review']));
  });

  it('produces CJK bigrams', () => {
    const tokens = tokenize('代码审查');
    expect(tokens).toContain('代码');
    expect(tokens).toContain('码审');
    expect(tokens).toContain('审查');
  });

  it('handles mixed CJK + Latin', () => {
    const tokens = tokenize('帮我 review 代码');
    expect(tokens).toContain('帮我');
    expect(tokens).toContain('review');
    expect(tokens).toContain('代码');
  });

  it('normalizes Traditional Chinese before tokenizing', () => {
    const tokens = tokenize('幫我審查程式碼');
    expect(tokens).toContain('审查');
    expect(tokens).toContain('代码');
  });

  it('expands abstract product/architecture phrasing into concrete intent tokens', () => {
    const tokens = tokenize('这个项目感觉带不起来，一直兜圈子');
    expect(tokens).toEqual(expect.arrayContaining(['架构', '规划', 'architecture', 'architect', 'planning', 'plan']));
  });

  it('deduplicates tokens', () => {
    const tokens = tokenize('code code review');
    expect(tokens.filter(t => t === 'code').length).toBe(1);
  });

  it('lowercases everything', () => {
    const tokens = tokenize('Code Review');
    expect(tokens).toContain('code');
    expect(tokens).toContain('review');
    expect(tokens).not.toContain('Code');
  });

  it('returns empty for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles single CJK char (no bigram)', () => {
    const tokens = tokenize('我');
    // single char — no bigram produced, but Latin fallback also empty
    expect(Array.isArray(tokens)).toBe(true);
  });
});

// ─── tagMatch ─────────────────────────────────────────────────────────────────

describe('tagMatch', () => {
  const caps: Capability[] = [
    cap({ id: '1', name: 'review-pr', tags: ['code-review', 'pull-request', 'pr'], exampleQueries: ['review this PR', 'check my pull request'] }),
    cap({ id: '2', name: 'ai-slop-cleaner', tags: ['code-cleanup', 'ai-generated-code', 'code-quality', 'code-maintenance', 'refactor'], exampleQueries: ['clean up AI code'] }),
    cap({ id: '3', name: 'debugger', tags: ['debugging', 'bug-fix', 'root-cause'], exampleQueries: ['debug this issue', 'find the bug'] }),
  ];

  it('returns top match for exact tag hit', () => {
    const results = tagMatch('code review', caps, 'claude-code', 3);
    expect(results[0].capability.name).toBe('review-pr');
  });

  it('tag dedup: "code" does not inflate ai-slop-cleaner above review-pr for "code review"', () => {
    const results = tagMatch('code review', caps, 'claude-code', 3);
    const reviewIdx = results.findIndex(r => r.capability.name === 'review-pr');
    const slopIdx = results.findIndex(r => r.capability.name === 'ai-slop-cleaner');
    // review-pr should rank above or equal to ai-slop-cleaner
    expect(reviewIdx).toBeLessThanOrEqual(slopIdx === -1 ? Infinity : slopIdx);
  });

  it('returns empty for unrelated query', () => {
    const results = tagMatch('xyzzy frobnicator', caps, 'claude-code', 3);
    expect(results.length).toBe(0);
  });

  it('respects maxResults', () => {
    const results = tagMatch('code', caps, 'claude-code', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('scores are in [0, 1]', () => {
    const results = tagMatch('code review debug', caps, 'claude-code', 10);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('filters by platform compatibility', () => {
    const cursorCap = cap({ id: '4', name: 'cursor-only', tags: ['cursor'], compatibility: ['cursor'] });
    const mixed = [...caps, cursorCap];
    const results = tagMatch('cursor', mixed, 'claude-code', 10);
    expect(results.find(r => r.capability.name === 'cursor-only')).toBeUndefined();
  });

  it('matches CJK query via bridge expansion', () => {
    // "代码" → "code", "审查" → "review" via bridge
    // Use a cap with enough tags so score clears MIN_MATCH_SCORE
    const richCap = cap({
      id: '10',
      name: 'review-pr',
      tags: ['code-review', 'pull-request', 'pr', 'review', 'code'],
      exampleQueries: ['review this code', 'check my pull request', 'code review'],
    });
    const results = tagMatch('代码审查', [richCap], 'claude-code', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].capability.name).toBe('review-pr');
  });

  it('matches Traditional Chinese query via normalization and bridge expansion', () => {
    const richCap = cap({
      id: '11',
      name: 'review-pr',
      tags: ['code-review', 'pull-request', 'pr', 'review', 'code'],
      exampleQueries: ['review this code', 'check my pull request', 'code review'],
    });
    const results = tagMatch('審查程式碼', [richCap], 'claude-code', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].capability.name).toBe('review-pr');
  });

  it('routes abstract stuck-project phrasing toward planning/architecture capabilities', () => {
    const architect = cap({
      id: '12',
      name: 'architect',
      tags: ['architecture', 'architect', 'planning', 'plan', 'design'],
      exampleQueries: ['system architecture planning'],
      category: 'planning',
    });
    const results = tagMatch('这个项目感觉带不起来，一直兜圈子', [architect], 'claude-code', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].capability.name).toBe('architect');
  });

  it('expands architecture/system-design phrasing into concrete routing tokens', () => {
    const tokens = tokenize('设计系统架构');
    expect(tokens).toEqual(expect.arrayContaining(['架构', '设计', 'architecture', 'architect', 'planner']));
  });

  it('expands deployment-to-production phrasing into deployment and verification tokens', () => {
    const tokens = tokenize('部署到生产环境');
    expect(tokens).toEqual(expect.arrayContaining(['部署', '生产', 'deployment', 'production', 'verification', 'verify']));
  });

  it('expands onboarding phrasing into codebase guidance tokens', () => {
    const tokens = tokenize('代码库新人上手');
    expect(tokens).toEqual(expect.arrayContaining(['代码库', 'onboarding', 'codebase', 'tour', 'code-tour']));
  });

  it('expands typo fix phrasing into minimal change tokens', () => {
    const tokens = tokenize('修个 typo');
    expect(tokens).toEqual(expect.arrayContaining(['typo', 'small-fix', 'minimal-change', 'fix']));
  });

  it('expands unit test phrasing into test coverage and tdd tokens', () => {
    const tokens = tokenize('add unit tests');
    expect(tokens).toEqual(expect.arrayContaining(['test-coverage', 'tdd', 'tdd-workflow', 'test-engineer']));
    expect(tokens).not.toContain('cpp-test');
    expect(tokens).not.toContain('flutter-test');
  });

  it('expands commit phrasing into git commit capability names', () => {
    const tokens = tokenize('提交代码');
    expect(tokens).toEqual(expect.arrayContaining(['git-commit', 'git-master', 'prp-commit']));
  });

  it('boosts architecture intent toward architect capabilities', () => {
    const architect = cap({
      id: '13',
      name: 'Software Architect',
      tags: ['planning'],
      exampleQueries: ['plan a system'],
      category: 'planning',
    });
    const reviewer = cap({
      id: '14',
      name: 'review-pr',
      tags: ['review', 'code'],
      exampleQueries: ['review code'],
      category: 'code-quality',
    });

    const results = tagMatch('设计系统架构', [reviewer, architect], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('Software Architect');
  });

  it('prefers AI slop cleaner over generic simplification for AI-generated slop', () => {
    const generic = cap({
      id: '15',
      name: 'code-simplifier',
      tags: ['code-cleanup', 'refactor', 'code-quality'],
      exampleQueries: ['clean up code', 'simplify code'],
      description: 'Simplifies and refactors code for maintainability.',
    });
    const slop = cap({
      id: '16',
      name: 'ai-slop-cleaner',
      tags: ['ai-generated-code', 'code-cleanup', 'slop'],
      exampleQueries: ['clean up AI generated code'],
      description: 'Remove low-quality AI-generated code while preserving behavior.',
    });

    const results = tagMatch('清理 AI 生成的垃圾代码', [generic, slop], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('ai-slop-cleaner');
  });

  it('prefers database specialists over broad backend workflows for database migration', () => {
    const broad = cap({
      id: '17',
      name: 'multi-backend',
      category: 'development',
      tags: ['backend', 'development', 'planning', 'optimization'],
      exampleQueries: ['backend development workflow', 'database backend planning'],
      description: 'Structured end-to-end backend workflow.',
    });
    const database = cap({
      id: '18',
      name: 'Database Optimizer',
      category: 'data',
      tags: ['database', 'schema', 'migration', 'postgres'],
      exampleQueries: ['database migration', 'design database schemas'],
      description: 'Design database schemas and tune database performance.',
    });

    const results = tagMatch('database migration', [broad, database], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('Database Optimizer');
  });

  it('keeps database migration above memory and broad workflow matches', () => {
    const memory = cap({
      id: '29',
      name: 'mem-search',
      category: 'development',
      tags: ['database', 'migration'],
      exampleQueries: ['database migration'],
      description: 'Search previous session memory.',
    });
    const database = cap({
      id: '30',
      name: 'Database Optimizer',
      category: 'data',
      tags: ['database', 'schema', 'postgres'],
      exampleQueries: ['database migration'],
      description: 'Design database schemas and tune database performance.',
    });

    const results = tagMatch('database migration', [memory, database], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('Database Optimizer');
  });

  it('breaks capped score ties using specialized intent priority', () => {
    const broad = cap({
      id: '21',
      name: 'make-plan',
      category: 'planning',
      tags: ['api', 'documentation', 'planning'],
      exampleQueries: ['generate api documentation'],
      description: 'Plan a complex task before executing it.',
    });
    const writer = cap({
      id: '22',
      name: 'Technical Writer',
      category: 'content',
      tags: ['api', 'documentation', 'writer'],
      exampleQueries: ['generate api documentation'],
      description: 'Write API docs and developer documentation.',
    });

    const results = tagMatch('生成 API 文档', [broad, writer], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('Technical Writer');
  });

  it('routes production deploy wording toward product/frontend release capabilities', () => {
    const setup = cap({
      id: '23',
      name: 'setup',
      category: 'operations',
      tags: ['deployment', 'production'],
      exampleQueries: ['deploy to production'],
      description: 'Install and configure tools.',
    });
    const product = cap({
      id: '24',
      name: 'product-capability',
      category: 'product',
      tags: ['product', 'release'],
      exampleQueries: ['deploy to production'],
      description: 'Shape production product capability choices.',
    });

    const results = tagMatch('deploy to production', [setup, product], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('product-capability');
  });

  it('routes Chinese production deploy wording toward setup and verification capabilities', () => {
    const product = cap({
      id: '27',
      name: 'product-capability',
      category: 'product',
      tags: ['product', 'release'],
      exampleQueries: ['deploy to production'],
      description: 'Shape production product capability choices.',
    });
    const verify = cap({
      id: '28',
      name: 'verification-loop',
      category: 'deployment',
      tags: ['deployment', 'production', 'verification'],
      exampleQueries: ['部署到生产环境'],
      description: 'Verify production deployment readiness.',
    });

    const results = tagMatch('部署到生产环境', [product, verify], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('verification-loop');
  });

  it('routes backend refactor wording toward backend/refactor specialists', () => {
    const broad = cap({
      id: '25',
      name: 'multi-backend',
      category: 'development',
      tags: ['backend', 'workflow', 'refactor'],
      exampleQueries: ['refactor backend'],
      description: 'Broad backend workflow.',
    });
    const backend = cap({
      id: '26',
      name: 'backend-patterns',
      category: 'development',
      tags: ['backend', 'architecture', 'refactor'],
      exampleQueries: ['refactor backend'],
      description: 'Backend architecture patterns and refactor guidance.',
    });

    const results = tagMatch('帮我重构整个后端', [broad, backend], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('backend-patterns');
  });

  it('routes generic Python development toward Python-specific capabilities', () => {
    const writer = cap({
      id: '31',
      name: 'khazix-writer',
      category: 'content',
      tags: ['code', 'development'],
      exampleQueries: ['写 Python 代码'],
      description: 'Generate explanatory writing for a codebase.',
    });
    const python = cap({
      id: '32',
      name: 'python-review',
      category: 'code-quality',
      tags: ['python', 'code', 'review'],
      exampleQueries: ['写 Python 代码'],
      description: 'Review Python code for Pythonic idioms.',
    });

    const results = tagMatch('写 Python 代码', [writer, python], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('python-review');
  });

  it('routes generic Rust development toward Rust review/build capabilities', () => {
    const test = cap({
      id: '33',
      name: 'rust-test',
      category: 'testing',
      tags: ['rust', 'test'],
      exampleQueries: ['Rust 开发'],
      description: 'Write Rust tests first.',
    });
    const review = cap({
      id: '34',
      name: 'rust-review',
      category: 'code-quality',
      tags: ['rust', 'review'],
      exampleQueries: ['Rust 开发'],
      description: 'Review idiomatic Rust code.',
    });

    const results = tagMatch('Rust 开发', [test, review], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('rust-review');
  });

  it('routes frontend UI component wording toward frontend design specialists', () => {
    const dev = cap({
      id: '35',
      name: 'frontend-dev',
      category: 'development',
      tags: ['frontend', 'ui', 'component'],
      exampleQueries: ['frontend UI component'],
      description: 'Build frontend components.',
    });
    const design = cap({
      id: '36',
      name: 'frontend-design',
      category: 'design',
      tags: ['frontend', 'ui', 'component'],
      exampleQueries: ['frontend UI component'],
      description: 'Build web components where visual design quality matters.',
    });

    const results = tagMatch('frontend UI component', [dev, design], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('frontend-design');
  });

  it('uses name coverage to break code-review ties toward code-specific reviewers', () => {
    const critic = cap({
      id: '19',
      name: 'critic',
      tags: ['code', 'review'],
      exampleQueries: ['code review'],
      description: 'Broad work plan and code review expert.',
    });
    const codeReviewer = cap({
      id: '20',
      name: 'Code Reviewer',
      tags: ['code', 'review'],
      exampleQueries: ['code review'],
      description: 'Focused code reviewer.',
    });

    const results = tagMatch('code review', [critic, codeReviewer], 'claude-code', 3);
    expect(results[0]?.capability.name).toBe('Code Reviewer');
  });

  it('layer is always "tag"', () => {
    const results = tagMatch('code review', caps, 'claude-code', 3);
    for (const r of results) {
      expect(r.layer).toBe('tag');
    }
  });
});
