export interface BuiltinSkill {
  name: string;
  category: string;
  description: string;
  triggers: string[];
  negatives: string[];
  examples: string[];
  composesWell: string[];
}

function skill(input: BuiltinSkill): BuiltinSkill {
  return input;
}

const CORE_SKILLS = [
  skill({
    name: 'security-review',
    category: 'review',
    description: 'Scan code for OWASP Top 10, auth bypass, injection, and credential exposure.',
    triggers: ['review this PR for security', 'review this PR for security issues', 'security vulnerability scan', 'review for security', 'security audit', 'check vulnerabilities', 'auth bypass', 'injection risk', 'credential exposure', 'OWASP', 'is this code secure', 'security issues in this PR', 'check XSS', 'SQL injection', 'CSRF', '安全审查', '安全漏洞', '注入风险', '认证绕过'],
    negatives: ['visual design', 'copywriting', 'spreadsheet', 'presentation', 'landing page'],
    examples: ['review this PR for security issues', 'check if this auth flow has vulnerabilities', 'audit the payment module for injection risks', '安全漏洞扫描', 'is this code secure'],
    composesWell: ['code-review', 'tdd-workflow', 'ship'],
  }),
  skill({
    name: 'code-review',
    category: 'review',
    description: 'Review changed code for regressions, maintainability, edge cases, and missing tests.',
    triggers: ['code review', 'review this PR', 'review changes', 'regression risk', 'missing tests', 'edge cases', 'quality review', '审查代码', '审查PR', '审查这个PR', '代码审核', '回归风险'],
    negatives: ['write article', 'design logo', 'make slides', 'generate image'],
    examples: ['review this PR', '审查这个PR', '帮我审查代码', 'check this diff for regressions', 'review before merge'],
    composesWell: ['security-review', 'tdd-workflow', 'git-commit'],
  }),
  skill({
    name: 'investigate',
    category: 'debugging',
    description: 'Trace bugs and failing workflows from evidence to root cause.',
    triggers: ['debug', 'bug', 'crash', 'failing', 'broken', 'root cause', 'trace issue', 'diagnose', '卡住', '报错', '调试', '排查', '定位问题'],
    negatives: ['deploy', 'write docs', 'visual design', 'marketing'],
    examples: ['fix this bug', 'debug this issue', '调试这个 bug', 'why is this failing', 'find root cause'],
    composesWell: ['tdd-workflow', 'code-review', 'ai-regression-testing'],
  }),
  skill({
    name: 'frontend-design',
    category: 'frontend',
    description: 'Build or improve usable, responsive product screens with strong visual hierarchy.',
    triggers: ['frontend UI', 'React page', 'new page', 'component design', 'responsive layout', 'redesign screen', 'CSS layout', '前端 UI', '页面设计', '界面', '组件', 'React 页面'],
    negatives: ['backend API', 'database migration', 'terminal cli', 'security audit'],
    examples: ['create a new React page', 'frontend UI component', '前端 UI 设计', 'redesign this screen', 'build a usable settings page'],
    composesWell: ['e2e-testing', 'design-review', 'frontend-patterns'],
  }),
  skill({
    name: 'ship',
    category: 'release',
    description: 'Prepare a change for release with build, tests, PR, changelog, and deployment checks.',
    triggers: ['deploy', 'release', 'ship', 'production', 'publish', 'create PR', 'open PR', 'merge', '部署', '发布', '上线', '提交 PR'],
    negatives: ['brainstorm', 'research only', 'mockup only'],
    examples: ['deploy to production', 'deploy new payment feature', '发布到生产环境', 'prepare release', 'create a PR'],
    composesWell: ['code-review', 'security-review', 'ci-cd-best-practices'],
  }),
  skill({
    name: 'tdd-workflow',
    category: 'testing',
    description: 'Write a failing test first, implement the fix, then keep the regression covered.',
    triggers: ['write tests', 'unit tests', 'cover this bug with a regression test', 'TDD', 'test first', 'coverage', 'regression test', 'vitest', 'jest', '写测试', '单元测试', '测试覆盖'],
    negatives: ['visual polish', 'marketing copy', 'deploy only'],
    examples: ['write tests for this function', 'add unit tests', '写单元测试', 'cover this bug with a regression test', 'use TDD for this fix'],
    composesWell: ['investigate', 'code-review', 'ship'],
  }),
  skill({
    name: 'plan',
    category: 'planning',
    description: 'Turn an ambiguous implementation request into scoped steps, constraints, and verification.',
    triggers: ['make a plan', 'implementation plan', 'architecture plan', 'break down', 'scope this work', '规划', '方案', '执行计划', '架构设计'],
    negatives: ['just run tests', 'show version', 'small typo'],
    examples: ['design system architecture', '系统架构设计', 'plan this migration', 'break this project into phases', 'make an execution plan'],
    composesWell: ['code-review', 'ship', 'architecture'],
  }),
  skill({
    name: 'refactor-clean',
    category: 'code-quality',
    description: 'Simplify messy or duplicated code while preserving behavior.',
    triggers: ['refactor', 'clean up code', 'simplify code', 'AI slop', 'duplication', 'readability', '重构', '清理代码', '代码太乱', '重复代码'],
    negatives: ['add feature', 'new page', 'deploy', 'write blog'],
    examples: ['refactor for readability', '重构代码让它更简洁', 'clean up AI generated slop', 'simplify this module', 'remove duplication'],
    composesWell: ['code-review', 'tdd-workflow', 'ai-slop-cleaner'],
  }),
  skill({
    name: 'api-design',
    category: 'backend',
    description: 'Design or review APIs, schemas, contracts, and endpoint behavior.',
    triggers: ['API design', 'generate API documentation', 'endpoint', 'REST', 'GraphQL', 'OpenAPI', 'request schema', 'response shape', '接口设计', 'API 文档', '后端接口'],
    negatives: ['CSS', 'visual design', 'spreadsheet'],
    examples: ['generate API documentation', '设计这个 API', 'review endpoint response shape', 'write OpenAPI docs', 'create REST API'],
    composesWell: ['backend-patterns', 'security-review', 'docs'],
  }),
  skill({
    name: 'docs',
    category: 'content',
    description: 'Write clear README, API docs, release notes, and implementation handoffs.',
    triggers: ['write docs', 'README', 'documentation', 'API documentation', 'release notes', 'handoff', '文档', '说明', '交接提示词'],
    negatives: ['fix bug', 'deploy', 'unit test'],
    examples: ['生成 API 文档', 'write README install docs', 'document this workflow', 'make a handoff prompt', 'write release notes'],
    composesWell: ['devex-review', 'ship', 'api-design'],
  }),
  skill({
    name: 'database',
    category: 'data',
    description: 'Optimize SQL, migrations, indexes, and data access patterns.',
    triggers: ['database', 'SQL', 'query optimization', 'migration', 'index', 'Postgres', 'schema', '数据库', '查询优化', '迁移'],
    negatives: ['frontend design', 'image generation', 'slides'],
    examples: ['optimize database queries', '数据库查询优化', 'write a migration', 'review this SQL index', 'fix slow query'],
    composesWell: ['backend-patterns', 'performance', 'security-review'],
  }),
  skill({
    name: 'docker-patterns',
    category: 'operations',
    description: 'Create or repair Docker, compose, and container build workflows.',
    triggers: ['Docker', 'container', 'docker compose', 'Dockerfile', 'image build', '写 Docker 配置', '容器', '镜像'],
    negatives: ['copywriting', 'UI mockup'],
    examples: ['写 Docker 配置', 'fix Docker build', 'create docker compose', 'optimize Dockerfile', 'containerize this app'],
    composesWell: ['ci-cd-best-practices', 'ship', 'backend-patterns'],
  }),
  skill({
    name: 'ci-cd-best-practices',
    category: 'release',
    description: 'Repair CI, GitHub Actions, deployment gates, and release pipelines.',
    triggers: ['CI', 'CD', 'GitHub Actions', 'pipeline', 'build failure', 'release workflow', '持续集成', '流水线'],
    negatives: ['UI design', 'write article'],
    examples: ['fix build errors', '修复构建错误', 'GitHub Actions failing', 'release pipeline is broken', 'CI should run tests'],
    composesWell: ['ship', 'tdd-workflow', 'github-ops'],
  }),
  skill({
    name: 'performance',
    category: 'performance',
    description: 'Profile latency, memory, rendering, database, or runtime bottlenecks.',
    triggers: ['performance', 'slow', 'latency', 'memory leak', 'profile', 'optimize speed', '性能', '慢', '延迟', '内存泄漏'],
    negatives: ['security policy', 'copywriting'],
    examples: ['make this faster', 'profile this slow function', 'reduce latency', '性能优化', 'find memory leak'],
    composesWell: ['investigate', 'database', 'frontend-patterns'],
  }),
  skill({
    name: 'github-ops',
    category: 'release',
    description: 'Work with GitHub issues, pull requests, checks, and repository operations.',
    triggers: ['GitHub', 'pull request', 'PR', 'issue', 'merge', 'review comments', 'branch', '提交代码', '开 PR'],
    negatives: ['database tuning', 'image style'],
    examples: ['git commit', '提交代码', 'create a pull request', 'address PR comments', 'check CI status'],
    composesWell: ['git-commit', 'code-review', 'ship'],
  }),
  skill({
    name: 'git-commit',
    category: 'release',
    description: 'Stage and commit verified changes with conventional commit messages.',
    triggers: ['git commit', 'commit changes', 'stage files', 'conventional commit', '提交代码', '提交改动'],
    negatives: ['deploy production', 'design screen'],
    examples: ['git commit', '提交代码', 'make a conventional commit', 'stage the changed files', 'commit this fix'],
    composesWell: ['code-review', 'ship', 'github-ops'],
  }),
  skill({
    name: 'research',
    category: 'research',
    description: 'Find current facts, compare sources, and synthesize actionable research.',
    triggers: ['research', 'look up', 'latest', 'compare options', 'source links', '官网', '搜索', '研究', '查一下'],
    negatives: ['local-only edit', 'no search'],
    examples: ['research this library', '看看官网怎么说', 'find latest docs', 'compare these tools', 'source this claim'],
    composesWell: ['docs', 'plan', 'api-design'],
  }),
  skill({
    name: 'openai-docs',
    category: 'research',
    description: 'Answer OpenAI API and platform questions from official documentation.',
    triggers: ['OpenAI API', 'Responses API', 'Agents SDK', 'ChatGPT Apps', 'model docs', 'OpenAI 文档'],
    negatives: ['anthropic', 'local css'],
    examples: ['how do I use Responses API', 'OpenAI Agents SDK docs', 'latest OpenAI API', 'ChatGPT app manifest', 'structured outputs'],
    composesWell: ['api-design', 'docs', 'research'],
  }),
  skill({
    name: 'build-web-apps',
    category: 'frontend',
    description: 'Build complete web app screens with React, browser verification, and production polish.',
    triggers: ['build web app', 'React app', 'Next.js', 'browser test', 'web UI', 'web 应用', '网页应用'],
    negatives: ['iOS native', 'CLI only'],
    examples: ['build a web app', 'create a dashboard screen', 'make a React tool', 'browser test this UI', 'build a usable page'],
    composesWell: ['frontend-design', 'e2e-testing', 'ship'],
  }),
  skill({
    name: 'build-ios-apps',
    category: 'mobile',
    description: 'Build, run, and debug SwiftUI iOS apps on simulator workflows.',
    triggers: ['iOS', 'SwiftUI', 'Xcode', 'simulator', 'iPhone app', 'Swift', '苹果应用'],
    negatives: ['web app', 'node cli'],
    examples: ['build iOS app', 'run SwiftUI simulator', 'debug Xcode build', 'create iPhone screen', 'SwiftUI performance'],
    composesWell: ['design-review', 'tdd-workflow', 'ship'],
  }),
  skill({
    name: 'e2e-testing',
    category: 'testing',
    description: 'Verify browser flows, UI behavior, and regressions with end-to-end tests.',
    triggers: ['E2E', 'Playwright', 'browser test', 'end to end', 'visual regression', '端到端测试', '浏览器测试'],
    negatives: ['unit only', 'copywriting'],
    examples: ['test this flow in browser', 'add Playwright tests', 'verify mobile layout', 'run E2E', 'check UI regression'],
    composesWell: ['frontend-design', 'ship', 'tdd-workflow'],
  }),
  skill({
    name: 'ai-slop-cleaner',
    category: 'code-quality',
    description: 'Remove low-quality generated code, fake complexity, dead branches, and noisy abstractions.',
    triggers: ['AI slop', 'generated slop', 'overengineered', 'fake abstraction', 'cleanup generated code', 'AI 生成的垃圾代码'],
    negatives: ['generate image', 'make slides'],
    examples: ['清理 AI 生成的垃圾代码', 'clean up AI generated slop', 'remove fake abstractions', 'this code feels overengineered', 'clean generated mess'],
    composesWell: ['refactor-clean', 'code-review', 'tdd-workflow'],
  }),
  skill({
    name: 'architecture',
    category: 'planning',
    description: 'Make architecture decisions, module boundaries, and migration plans explicit.',
    triggers: ['architecture', 'system design', 'module boundary', 'migration plan', 'technical design', '架构', '系统设计', '模块边界'],
    negatives: ['small typo', 'single test'],
    examples: ['system architecture design', '设计系统架构', 'plan this module split', 'review architecture tradeoffs', 'write technical design'],
    composesWell: ['plan', 'code-review', 'docs'],
  }),
] satisfies BuiltinSkill[];

const GENERATED_NAMES = [
  'backend-patterns', 'frontend-patterns', 'react-best-practices', 'shadcn', 'stripe-best-practices', 'supabase-postgres-best-practices',
  'django-patterns', 'django-security', 'laravel-patterns', 'laravel-security', 'nestjs-patterns', 'golang-patterns', 'golang-testing',
  'kotlin-patterns', 'kotlin-testing', 'java-coding-standards', 'cpp-testing', 'dotnet-patterns', 'python-testing', 'rust-patterns',
  'api-security', 'auth-review', 'secrets-scan', 'threat-model', 'security-scan', 'fix-finding', 'attack-path-analysis',
  'document-review', 'document-release', 'article-writing', 'brand-voice', 'meeting-notes-and-actions', 'investor-materials',
  'spreadsheets', 'presentations', 'google-drive', 'gmail', 'slack', 'linear', 'notion', 'github', 'vercel', 'canva',
  'browser', 'chrome', 'computer-use', 'xcodebuild', 'ios-debugger-agent', 'swiftui-performance-audit', 'swiftui-ui-patterns',
  'game-studio', 'phaser-2d-game', 'three-webgl-game', 'sprite-pipeline', 'remotion', 'hyperframes', 'manim-video',
  'imagegen', 'fal-ai-media', 'minimax-tts', 'minimax-web-search', 'data-scraper-agent', 'database-migrations', 'clickhouse-io',
  'docker-patterns', 'ci-cd-best-practices', 'devex-review', 'e2e-testing', 'eval-harness', 'ai-regression-testing',
  'agent-browser', 'agent-introspection-debugging', 'agent-native-architecture', 'agentic-engineering', 'autopilot',
  'autoplan', 'blueprint', 'board-escalation', 'brainstorming', 'careful', 'checkpoint', 'council', 'deep-dive',
  'design-consultation', 'design-review', 'design-shotgun', 'frontend-slides', 'high-end-visual-design', 'industrial-brutalist-ui',
  'minimalist-ui', 'liquid-glass-design', 'logistics-exception-management', 'inventory-demand-planning', 'customer-billing-ops',
  'customs-trade-compliance', 'energy-procurement', 'finance-billing-ops', 'healthcare-phi-compliance', 'hipaa-compliance',
  'lead-intelligence', 'investor-outreach', 'jira-integration', 'knowledge-harvest', 'knowledge-ops', 'memory-injector',
  'memory-lancedb-pro', 'mcp-builder', 'mcp-server-patterns', 'mcp-setup', 'messages-ops', 'multi-search-engine',
  'obsidian-markdown', 'json-canvas', 'excalidraw-diagram-generator', 'cost-aware-llm-pipeline', 'content-engine',
  'content-hash-cache-pattern', 'continuous-agent-loop', 'continuous-learning', 'configure-notifications', 'configure-ecc',
  'database-migrations', 'external-context', 'full-output-enforcement', 'gh-cli', 'gitnexus-cli', 'gitnexus-pr-review',
  'gitnexus-impact-analysis', 'gitnexus-debugging', 'gitnexus-refactoring', 'google-workspace-ops', 'guard', 'handoff',
  'hookify-rules', 'knowledge-ops', 'lazybrain-find', 'learn', 'learner', 'land-and-deploy', 'document-review',
  'migrate-to-shoehorn', 'nanoclaw-repl', 'openai-docs', 'plugin-creator', 'skill-creator', 'skill-installer',
  'automation-audit-ops', 'api-design', 'ask', 'backend-patterns', 'benchmark', 'canary', 'cancel', 'ccg',
  'ce-review', 'ce-work', 'ce-plan', 'ce-brainstorm', 'code-tour', 'codex', 'coding-standards', 'collective-memory',
  'competitive-ads-extractor', 'compose-multiplatform-patterns', 'crosspost', 'daily-briefing', 'deep-interview',
  'deepinit', 'defuddle', 'diagnose', 'dmux-workflows', 'dogfood', 'email-ops', 'enterprise-agent-ops',
  'evm-token-decimals', 'find-skills', 'finishing-a-development-branch', 'freeze', 'get-focus-mode', 'git-commit',
  'github-ops', 'goalwright', 'gstack', 'health', 'hud', 'iterative-retrieval', 'laravel-tdd', 'laravel-verification',
  'liquid-glass-design', 'minimalist-ui', 'open-design', 'project-session-manager', 'pull-request-review',
  'release-manager', 'route-dogfood', 'server-debugging', 'spreadsheet-analysis', 'technical-writer', 'ui-ux-promax',
  'vercel-deploy', 'web-research', 'workflow-mining', 'write-tests', 'xcodebuildmcp', 'yaml-maintenance',
] as const;

function categoryForName(name: string): string {
  if (/security|auth|secret|threat|finding|attack/.test(name)) return 'security';
  if (/test|e2e|regression|eval|benchmark/.test(name)) return 'testing';
  if (/frontend|react|ui|design|visual|slide|liquid|minimalist/.test(name)) return 'frontend';
  if (/deploy|release|ship|ci|cd|vercel|github|git/.test(name)) return 'release';
  if (/docs|document|writer|article|notes|handoff/.test(name)) return 'content';
  if (/data|database|postgres|clickhouse|spreadsheet/.test(name)) return 'data';
  if (/agent|autopilot|orchestrat|workflow|council|mcp|goalwright/.test(name)) return 'orchestration';
  if (/browser|chrome|computer|xcode|ios|swift|game|video|image|media/.test(name)) return 'tooling';
  if (/research|search|knowledge|learn|memory/.test(name)) return 'research';
  return 'development';
}

function generatedSkill(name: string): BuiltinSkill {
  const words = name.replace(/[-_:]/g, ' ');
  const category = categoryForName(name);
  return {
    name,
    category,
    description: `Use ${name} for ${words} tasks in the ${category} workflow.`,
    triggers: [name, words, `use ${words}`, `${words} help`, `${words} workflow`, `${words} best practices`],
    negatives: [],
    examples: [`use ${words}`, `help with ${words}`, `${words} best practices`],
    composesWell: category === 'release' ? ['code-review', 'security-review'] : ['plan', 'code-review'],
  };
}

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  ...CORE_SKILLS,
  ...GENERATED_NAMES.map(generatedSkill),
];
