import type { GuardrailRule, VerificationRequirement, WorkflowStep } from '../types.js';

export interface ComboTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  keywords: string[];
  negativeKeywords?: string[];
  skillNames: string[];
  workflow: WorkflowStep[];
  guardrails: GuardrailRule[];
  verification: VerificationRequirement[];
  doneWhen: string[];
}

function step(title: string): WorkflowStep {
  return { title, source: 'combo' };
}

function check(title: string, command?: string): VerificationRequirement {
  return { title, command, required: true, source: 'combo' };
}

function guard(title: string): GuardrailRule {
  return { title, strength: 'normal', source: 'combo' };
}

export const COMBOS: ComboTemplate[] = [
  {
    id: 'release_public_audit',
    title: 'Public release audit',
    category: 'release',
    description: 'Prepare a public release with package, security, CI, and rollback checks.',
    keywords: ['release', 'publish', 'deploy', 'production', 'feature', 'ship', 'npm', '上线', '发布', '部署'],
    negativeKeywords: ['draft', 'local only', 'prototype', '草稿', '本地试验'],
    skillNames: ['document-release', 'github-ops', 'ci-cd-best-practices', 'security-review'],
    workflow: [step('Verify version, changelog, package, and CLI behavior'), step('Run public package and privacy checks'), step('Confirm CI, rollback, and deployment gate')],
    guardrails: [guard('Never publish or deploy without explicit release evidence')],
    verification: [check('Public audit passes', 'npm run audit:public'), check('Package dry-run passes', 'npm pack --dry-run --json')],
    doneWhen: ['Version, package contents, CI, and rollback path are verified.'],
  },
  {
    id: 'bug_regression_repair',
    title: 'Bug regression repair',
    category: 'debugging',
    description: 'Reproduce a bug, add a regression test, fix it, and review the change.',
    keywords: ['bug', 'debug', 'crash', 'error', 'failing', 'broken', '报错', '崩溃', '失败', '调试'],
    negativeKeywords: ['feature request', 'new feature', 'docs only', '新功能', '只写文档'],
    skillNames: ['investigate', 'tdd-workflow', 'code-review'],
    workflow: [step('Reproduce the failing behavior'), step('Write or update the regression test'), step('Fix the smallest responsible code path'), step('Review the diff for regressions')],
    guardrails: [guard('Do not guess a fix before reproducing the failure')],
    verification: [check('Original failure passes'), check('Focused tests pass')],
    doneWhen: ['The original failure is fixed and covered.'],
  },
  {
    id: 'frontend_verified_screen',
    title: 'Frontend verified screen',
    category: 'frontend',
    description: 'Build a usable responsive screen and verify it in the browser.',
    keywords: ['frontend', 'react', 'ui', 'screen', 'page', 'component', '页面', '界面', '前端'],
    negativeKeywords: ['api only', 'backend only', 'cli only', '只改后端', '命令行'],
    skillNames: ['frontend-design', 'frontend-patterns', 'e2e-testing'],
    workflow: [step('Identify the primary workflow'), step('Build the real first screen'), step('Verify desktop and mobile rendering')],
    guardrails: [guard('Build the usable experience, not a marketing placeholder')],
    verification: [check('Build succeeds', 'npm run build'), check('Browser smoke passes')],
    doneWhen: ['The screen is usable and responsive.'],
  },
  {
    id: 'security_code_review',
    title: 'Security code review',
    category: 'security',
    description: 'Review sensitive code for vulnerabilities, regressions, and missing tests.',
    keywords: ['security', 'vulnerability', 'auth', 'credential', 'payment', '安全', '漏洞', '认证', '支付'],
    negativeKeywords: ['copy edit', 'visual polish', '文案', '视觉微调'],
    skillNames: ['security-review', 'code-review', 'tdd-workflow'],
    workflow: [step('Map the sensitive boundary'), step('Audit auth, input, and secrets'), step('Add focused regression checks')],
    guardrails: [guard('Every finding must cite an exploitable path or concrete risk')],
    verification: [check('Focused security tests pass'), check('Full tests pass', 'npm test')],
    doneWhen: ['Sensitive paths are reviewed and verified.'],
  },
  {
    id: 'api_endpoint_build',
    title: 'API endpoint build',
    category: 'backend',
    description: 'Design, implement, test, and review a new API endpoint.',
    keywords: ['api', 'endpoint', 'route', 'handler', 'controller', '接口', '端点', '路由', '后端接口'],
    negativeKeywords: ['ui only', 'css', 'copy', '只改页面', '样式'],
    skillNames: ['api-design', 'backend-patterns', 'tdd-workflow', 'code-review'],
    workflow: [step('Define contract, inputs, outputs, and failure modes'), step('Implement the endpoint through existing backend patterns'), step('Cover success and error paths with focused tests'), step('Review API compatibility and call sites')],
    guardrails: [guard('Do not change public API shape without explicit contract evidence')],
    verification: [check('Focused API tests pass'), check('Type check passes', 'npm run lint')],
    doneWhen: ['Endpoint behavior, errors, and tests match the contract.'],
  },
  {
    id: 'refactor_safe',
    title: 'Safe refactor',
    category: 'quality',
    description: 'Refactor code with tests and review while preserving behavior.',
    keywords: ['refactor', 'clean', 'simplify', 'extract', 'cleanup', '重构', '清理', '简化', '抽取'],
    negativeKeywords: ['new feature', 'ship now', 'rewrite everything', '新功能', '重写全部'],
    skillNames: ['refactor-clean', 'tdd-workflow', 'code-review'],
    workflow: [step('Identify the smallest behavior-preserving change'), step('Lock behavior with existing or new tests'), step('Refactor within current module boundaries'), step('Review diff for accidental scope growth')],
    guardrails: [guard('Keep public behavior unchanged unless the task explicitly asks otherwise')],
    verification: [check('Focused regression tests pass'), check('Lint/type check passes', 'npm run lint')],
    doneWhen: ['Behavior is preserved and the refactor has test evidence.'],
  },
  {
    id: 'new_feature_full',
    title: 'Full new feature',
    category: 'feature',
    description: 'Plan, build, test, review, and ship a complete feature.',
    keywords: ['new feature', 'feature', 'build feature', 'full flow', '完整功能', '新功能', '做一个', '从零做'],
    negativeKeywords: ['bug only', 'docs only', 'hotfix', '只修 bug', '只写文档'],
    skillNames: ['plan', 'frontend-design', 'tdd-workflow', 'code-review', 'ship'],
    workflow: [step('Define user workflow and acceptance criteria'), step('Build the smallest complete slice'), step('Add focused tests for expected behavior'), step('Review and prepare release evidence')],
    guardrails: [guard('Ship a usable feature slice before broad polish')],
    verification: [check('Feature tests pass'), check('Build passes', 'npm run build')],
    doneWhen: ['The feature is usable, reviewed, and ready for release.'],
  },
  {
    id: 'performance_fix',
    title: 'Performance fix',
    category: 'performance',
    description: 'Investigate, measure, fix, and verify performance issues.',
    keywords: ['performance', 'slow', 'latency', 'memory', 'profile', '优化', '性能', '慢', '延迟', '内存'],
    negativeKeywords: ['style', 'copy', 'docs only', '文案', '只写文档'],
    skillNames: ['performance', 'investigate', 'tdd-workflow'],
    workflow: [step('Capture the slow path and baseline'), step('Find the smallest measurable bottleneck'), step('Apply a focused optimization'), step('Verify behavior and performance improved')],
    guardrails: [guard('Do not optimize without a baseline or observable bottleneck')],
    verification: [check('Performance scenario improves'), check('Regression tests pass')],
    doneWhen: ['Measured performance improves without behavior regressions.'],
  },
  {
    id: 'documentation_complete',
    title: 'Complete documentation',
    category: 'documentation',
    description: 'Create complete docs with developer-experience and content review.',
    keywords: ['docs', 'documentation', 'readme', 'guide', 'handoff', '文档', '说明', '指南', '交接'],
    negativeKeywords: ['code only', 'no docs', '只改代码', '不要文档'],
    skillNames: ['docs', 'devex-review', 'document-review'],
    workflow: [step('Identify the reader and task path'), step('Write runnable usage and maintenance docs'), step('Review clarity, omissions, and examples')],
    guardrails: [guard('Document real behavior only; do not invent unsupported commands')],
    verification: [check('Examples match current CLI/API'), check('Documentation review passes')],
    doneWhen: ['A new reader can complete the documented task.'],
  },
  {
    id: 'ci_repair',
    title: 'CI repair',
    category: 'ci',
    description: 'Diagnose and repair failing CI or workflow automation.',
    keywords: ['ci', 'pipeline', 'github actions', 'workflow fail', 'build fail', '流水线', '构建失败', 'CI失败', '自动化失败'],
    negativeKeywords: ['local only', 'docs only', 'ignore ci', '只本地', '忽略 CI'],
    skillNames: ['ci-cd-best-practices', 'investigate', 'tdd-workflow'],
    workflow: [step('Read the failing job and reproduce the smallest failing command'), step('Fix config or code at the responsible boundary'), step('Add or update regression coverage where useful')],
    guardrails: [guard('Do not loosen CI gates to hide the failure')],
    verification: [check('Failing CI command passes locally'), check('Full test suite passes', 'npm test')],
    doneWhen: ['The failing pipeline path is fixed without weakening checks.'],
  },
  {
    id: 'database_migration_safe',
    title: 'Safe database migration',
    category: 'database',
    description: 'Plan, implement, and verify a safe schema or data migration.',
    keywords: ['database', 'migration', 'schema', 'postgres', 'sql', '数据库', '迁移', '表结构', '索引'],
    negativeKeywords: ['frontend only', 'css', 'static page', '只改前端', '静态页面'],
    skillNames: ['database', 'database-migrations', 'tdd-workflow', 'security-review'],
    workflow: [step('Define forward and rollback migration behavior'), step('Check data, locking, and compatibility risks'), step('Implement migration and related code changes'), step('Verify migration tests and sensitive access paths')],
    guardrails: [guard('Never make destructive schema changes without rollback evidence')],
    verification: [check('Migration tests pass'), check('Security-sensitive paths reviewed')],
    doneWhen: ['Forward, rollback, compatibility, and tests are verified.'],
  },
  {
    id: 'onboarding_new_repo',
    title: 'New repository onboarding',
    category: 'onboarding',
    description: 'Understand a new repo and produce an actionable starting plan.',
    keywords: ['onboard', 'new repo', 'understand repo', 'codebase tour', '上手', '新项目', '理解仓库', '代码导览'],
    negativeKeywords: ['small fix', 'single file', 'hotfix', '只改一处', '紧急修复'],
    skillNames: ['architecture', 'plan', 'docs'],
    workflow: [step('Map entrypoints, modules, and test commands'), step('Identify active workflows and ownership boundaries'), step('Write a short plan for the first safe change')],
    guardrails: [guard('Do not make broad edits before the repo shape is understood')],
    verification: [check('Known test or smoke command identified'), check('Architecture notes are grounded in files')],
    doneWhen: ['Repository structure, commands, and next action are clear.'],
  },
];

export function listCombos(category?: string): ComboTemplate[] {
  if (!category) return COMBOS;
  const normalized = category.toLowerCase();
  return COMBOS.filter((combo) => combo.category === normalized || combo.id.includes(normalized));
}

function scoreCombo(combo: ComboTemplate, query: string): number {
  const q = query.toLowerCase();
  const positive = combo.keywords.reduce((score, keyword) => score + (q.includes(keyword.toLowerCase()) ? 1 : 0), 0);
  const negative = combo.negativeKeywords?.some((keyword) => q.includes(keyword.toLowerCase())) ? 2 : 0;
  return positive - negative;
}

export function findCombo(query: string, categories: string[] = []): ComboTemplate | undefined {
  const categorySet = new Set(categories.map((item) => item.toLowerCase()));
  let best: { combo: ComboTemplate; score: number } | undefined;
  for (const combo of COMBOS) {
    const score = scoreCombo(combo, query) + (categorySet.has(combo.category) ? 1 : 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { combo, score };
  }
  return best?.combo;
}

export function formatComboList(combos: ComboTemplate[]): string {
  return combos.map((combo) => `${combo.id} [${combo.category}] ${combo.description}`).join('\n');
}
