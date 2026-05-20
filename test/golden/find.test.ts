import { describe, expect, test } from 'vitest';
import { find } from '../../src/matcher/matcher.js';

const GOLDEN_SET = [
  { query: 'review this PR for security issues', expect: 'security-review' },
  { query: 'fix this bug', expect: 'investigate' },
  { query: 'create a new React page', expect: 'frontend-design' },
  { query: 'deploy to production', expect: 'ship' },
  { query: 'write tests for this function', expect: 'tdd-workflow' },
  { query: '帮我审查代码', expect: 'code-review' },
  { query: '审查这个PR', expect: 'code-review' },
  { query: 'code review', expect: 'code-review' },
  { query: '重构代码让它更简洁', expect: 'refactor-clean' },
  { query: 'refactor for readability', expect: 'refactor-clean' },
  { query: '写单元测试', expect: 'tdd-workflow' },
  { query: 'add unit tests', expect: 'tdd-workflow' },
  { query: '修复构建错误', expect: 'ci-cd-best-practices' },
  { query: 'fix build errors', expect: 'ci-cd-best-practices' },
  { query: '提交代码', expect: 'git-commit' },
  { query: 'git commit', expect: 'git-commit' },
  { query: '设计系统架构', expect: 'architecture' },
  { query: 'system architecture design', expect: 'architecture' },
  { query: '调试这个 bug', expect: 'investigate' },
  { query: 'debug this issue', expect: 'investigate' },
  { query: '部署到生产环境', expect: 'ship' },
  { query: 'security vulnerability scan', expect: 'security-review' },
  { query: '安全漏洞扫描', expect: 'security-review' },
  { query: '生成 API 文档', expect: 'api-design' },
  { query: 'generate API documentation', expect: 'api-design' },
  { query: '数据库查询优化', expect: 'database' },
  { query: 'optimize database queries', expect: 'database' },
  { query: '前端 UI 设计', expect: 'frontend-design' },
  { query: 'frontend UI component', expect: 'frontend-design' },
  { query: '写 Docker 配置', expect: 'docker-patterns' },
  { query: 'clean up AI generated slop', expect: 'ai-slop-cleaner' },
  { query: '清理 AI 生成的垃圾代码', expect: 'ai-slop-cleaner' },
  { query: 'write README install docs', expect: 'docs' },
  { query: 'make release notes', expect: 'docs' },
  { query: 'fix GitHub Actions failing', expect: 'ci-cd-best-practices' },
  { query: 'create a pull request', expect: 'github-ops' },
  { query: 'profile this slow function', expect: 'performance' },
  { query: '性能优化', expect: 'performance' },
  { query: 'research this library', expect: 'research' },
  { query: '看看官网怎么说', expect: 'research' },
  { query: 'OpenAI Responses API docs', expect: 'openai-docs' },
  { query: 'build a web app', expect: 'build-web-apps' },
  { query: 'run SwiftUI simulator', expect: 'build-ios-apps' },
  { query: 'add Playwright tests', expect: 'e2e-testing' },
  { query: 'review endpoint response shape', expect: 'api-design' },
  { query: 'write a migration', expect: 'database' },
  { query: 'containerize this app', expect: 'docker-patterns' },
  { query: 'review architecture tradeoffs', expect: 'architecture' },
  { query: 'cover this bug with a regression test', expect: 'tdd-workflow' },
  { query: 'deploy new payment feature', expect: 'ship' },
  { query: 'check if this auth flow has vulnerabilities', expect: 'security-review' },
  { query: 'check this diff for regressions', expect: 'code-review' },
  { query: 'why is this failing', expect: 'investigate' },
  { query: 'redesign this screen', expect: 'frontend-design' },
  { query: 'prepare release', expect: 'ship' },
  { query: 'use TDD for this fix', expect: 'tdd-workflow' },
  { query: 'make an execution plan', expect: 'plan' },
  { query: 'remove duplication', expect: 'refactor-clean' },
  { query: 'write OpenAPI docs', expect: 'api-design' },
  { query: 'document this workflow', expect: 'docs' },
  { query: 'review this SQL index', expect: 'database' },
  { query: 'optimize Dockerfile', expect: 'docker-patterns' },
  { query: 'release pipeline is broken', expect: 'ci-cd-best-practices' },
  { query: 'reduce latency', expect: 'performance' },
  { query: 'address PR comments', expect: 'github-ops' },
  { query: 'make a conventional commit', expect: 'git-commit' },
  { query: 'find latest docs', expect: 'research' },
  { query: 'how do I use Responses API', expect: 'openai-docs' },
  { query: '定位问题', expect: 'investigate' },
  { query: '代码太乱', expect: 'refactor-clean' },
  { query: '接口设计', expect: 'api-design' },
  { query: '持续集成', expect: 'ci-cd-best-practices' },
  { query: '浏览器测试', expect: 'e2e-testing' },
  { query: '苹果应用', expect: 'build-ios-apps' },
  { query: '模块边界', expect: 'architecture' },
  { query: '内存泄漏', expect: 'performance' },
] as const;

const NEGATIVE_SET = [
  'visual polish only',
  'write marketing copy for landing page',
  'small typo in text',
  'brainstorm product idea only',
] as const;

describe('find golden set', () => {
  test('golden set has product-grade breadth', () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(60);
  });

  test.each(GOLDEN_SET)('find("$query") -> $expect', ({ query, expect: expected }) => {
    const results = find(query, { threshold: 0.5, limit: 1 });
    expect(results[0]?.skill).toBe(expected);
    expect(results[0]?.score).toBeGreaterThanOrEqual(0.5);
  });

  test('precision is at least 85 percent', () => {
    const correct = GOLDEN_SET.filter((item) => find(item.query, { threshold: 0.5, limit: 1 })[0]?.skill === item.expect).length;
    expect(correct / GOLDEN_SET.length).toBeGreaterThanOrEqual(0.88);
  });

  test.each(NEGATIVE_SET)('does not force a match for "$query"', (query) => {
    expect(find(query, { threshold: 0.5, limit: 1 })).toEqual([]);
  });

  test('find responds in under 200ms on average', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) find('review this PR for security issues');
    const avg = (performance.now() - start) / 100;
    expect(avg).toBeLessThan(200);
  });
});
