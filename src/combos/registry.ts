/**
 * LazyBrain — Built-in Route Combos
 *
 * Combos are advisory templates. They do not execute work and do not require
 * every named skill to be installed.
 */

import type { GuardrailRule, VerificationRequirement, WorkflowStep } from '../types.js';

export interface ComboTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  entryCommand: string;
  executionMode: 'advisory' | 'guided';
  modelStrategy: string;
  keywords: string[];
  negativeKeywords?: string[];
  skillNames: string[];
  workflow: WorkflowStep[];
  contextNeeded: string[];
  guardrails: GuardrailRule[];
  verification: VerificationRequirement[];
  doneWhen: string[];
}

function step(id: string, title: string, detail?: string): WorkflowStep {
  return { id, title, detail, source: 'combo' };
}

function check(id: string, title: string, command?: string): VerificationRequirement {
  return { id, title, command, required: true, source: 'combo' };
}

function guard(title: string, detail?: string, strength: GuardrailRule['strength'] = 'normal'): GuardrailRule {
  return { title, detail, strength, source: 'combo' };
}

export const COMBOS: ComboTemplate[] = [
  {
    id: 'frontend_new_page',
    title: 'Frontend new page',
    category: 'frontend',
    description: 'Create a new usable product screen with responsive UI verification.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a frontend-capable model and keep verification in the same turn.',
    keywords: ['new page', 'frontend', 'ui', 'screen', '页面', '前端', '新页面', '界面'],
    negativeKeywords: ['函数', '方法', '模块', 'class', 'api', '接口', '后端', 'backend', 'server'],
    skillNames: ['frontend-design', 'frontend-patterns', 'e2e-testing'],
    workflow: [
      step('understand-user-flow', 'Identify the primary user workflow'),
      step('build-first-screen', 'Build the real usable first screen'),
      step('verify-responsive', 'Verify desktop and mobile rendering'),
    ],
    contextNeeded: ['Target user', 'Primary workflow', 'Existing design conventions', 'Run command or preview URL'],
    guardrails: [guard('Do not make a marketing landing page unless requested', undefined, 'strict')],
    verification: [check('build', 'Build succeeds', 'npm run build')],
    doneWhen: ['The page is usable without extra explanation.', 'Desktop and mobile screenshots are readable.'],
  },
  {
    id: 'frontend_existing_redesign',
    title: 'Existing frontend redesign',
    category: 'frontend',
    description: 'Improve an existing interface while preserving product behavior.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a frontend-capable model, inspect the current route, then verify before/after behavior.',
    keywords: ['redesign', 'existing', 'refactor ui', '改版', '重设计', '重新设计', '重构', '网页', '页面', '界面', '优化界面', '优化网页', '现有页面', '现有网页'],
    negativeKeywords: ['函数', '方法', '模块', 'class', 'api', '接口', '后端', 'backend', 'server', '数据库', '代码'],
    skillNames: ['frontend-design', 'design-review', 'e2e-testing'],
    workflow: [
      step('inspect-existing-ui', 'Inspect the existing UI and design conventions'),
      step('make-targeted-redesign', 'Redesign the weak surface without changing unrelated flows'),
      step('compare-before-after', 'Verify no regression in layout or interaction'),
    ],
    contextNeeded: ['Existing screen URL or route', 'Known pain points', 'Viewport targets', 'Behavior that must not change'],
    guardrails: [guard('Preserve working flows while improving visual hierarchy', undefined, 'strict')],
    verification: [check('console', 'Console stays clean'), check('build', 'Build succeeds', 'npm run build')],
    doneWhen: ['The redesigned screen improves clarity without breaking existing behavior.'],
  },
  {
    id: 'dashboard_ceo',
    title: 'CEO dashboard',
    category: 'dashboard',
    description: 'Turn operational data into a decision-oriented dashboard.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a product-logic-first model pass before visual implementation.',
    keywords: ['ceo dashboard', 'dashboard', 'metrics', 'ops', '后台', '看板', 'CEO', '运营', '指标'],
    skillNames: ['dashboard-builder', 'product-capability', 'frontend-design'],
    workflow: [
      step('define-operating-questions', 'Define the decisions the dashboard must support'),
      step('map-signal-groups', 'Group metrics into status, risk, owner, and next action'),
      step('build-scan-layout', 'Build a dense, scannable dashboard layout'),
      step('verify-operator-readiness', 'Check whether the dashboard answers the operating questions'),
    ],
    contextNeeded: ['Target operator', 'Critical metrics', 'Current data source', 'Refresh cadence', 'Decision questions'],
    guardrails: [guard('Prioritize operational signal over visual decoration', undefined, 'strict')],
    verification: [check('operator-check', 'Dashboard answers the target operating questions')],
    doneWhen: ['A CEO can identify status, risk, owner, and next action from the first screen.'],
  },
  {
    id: 'docs_public_install',
    title: 'Public install docs',
    category: 'docs',
    description: 'Write public-facing installation and recovery documentation.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'advisory',
    modelStrategy: 'Use a concise documentation pass plus public-audit verification.',
    keywords: ['readme', 'docs', 'install', 'public docs', 'README', '文档', '安装流程', '普通用户'],
    skillNames: ['document-release', 'document-review', 'devex-review'],
    workflow: [
      step('separate-real-vs-planned', 'Separate implemented behavior from planned behavior'),
      step('write-install-flow', 'Write a copyable install, test, and rollback flow'),
      step('add-troubleshooting', 'Add short fixes for common failures'),
    ],
    contextNeeded: ['Supported platforms', 'Install commands', 'Known failure modes', 'Rollback command'],
    guardrails: [guard('Do not imply planned features already work', undefined, 'strict')],
    verification: [check('public-audit', 'Public audit passes', 'npm run audit:public')],
    doneWhen: ['A new user can install, test, troubleshoot, and roll back from the docs alone.'],
  },
  {
    id: 'code_review_regression',
    title: 'Regression code review',
    category: 'code-quality',
    description: 'Review changed code for behavioral regressions and missing tests.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'advisory',
    modelStrategy: 'Use review mode: inspect behavior first, then tests and risk.',
    keywords: ['review', 'regression', 'risk', '审查', '回归', '风险', '代码审核'],
    skillNames: ['ce:review', 'ai-regression-testing', 'coding-standards'],
    workflow: [
      step('inspect-diff', 'Inspect the changed surface and identify risky paths'),
      step('review-behavior', 'Look for behavioral regressions before style issues'),
      step('verify-tests', 'Run or specify focused verification'),
    ],
    contextNeeded: ['Diff or branch', 'Expected behavior', 'Relevant test command'],
    guardrails: [guard('Findings must be grounded in files and behavior', undefined, 'strict')],
    verification: [check('tests', 'Tests pass', 'npm test'), check('lint', 'Lint/typecheck passes', 'npm run lint')],
    doneWhen: ['High-risk regressions are either fixed or explicitly called out with evidence.'],
  },
  {
    id: 'debug_stuck_runtime',
    title: 'Stuck runtime debug',
    category: 'debugging',
    description: 'Diagnose a long-running or hung local runtime without destructive resets.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use an evidence-first debugging pass with non-destructive probes.',
    keywords: ['stuck', 'hung', 'no output', 'debug', '卡住', '长时间无输出', '排查', '无响应'],
    skillNames: ['agent-introspection-debugging', 'omc-doctor', 'debugging'],
    workflow: [
      step('capture-state', 'Capture process, logs, and runtime state'),
      step('separate-active-vs-stale', 'Distinguish active work from stale records'),
      step('apply-safe-fix', 'Apply the smallest safe cleanup or restart'),
    ],
    contextNeeded: ['Exact command', 'Last output time', 'Process id or session id', 'Relevant logs'],
    guardrails: [guard('Do not restart or delete state before preserving evidence', undefined, 'strict')],
    verification: [check('smoke', 'Smoke test produces real output')],
    doneWhen: ['The active/stale state is clear and the runtime can be verified with a smoke test.'],
  },
  {
    id: 'debug_crash',
    title: 'Crash or bug debug',
    category: 'debugging',
    description: 'Investigate a bug, crash, failing command, or broken workflow with evidence-first debugging.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a debugging-capable model; collect reproduction evidence before editing.',
    keywords: ['bug', 'crash', 'error', 'failed', 'failing', 'broken', '报错', '崩溃', '失败', '不工作', '修不好', '异常'],
    skillNames: ['agent-introspection-debugging', 'debugging', 'ai-regression-testing'],
    workflow: [
      step('reproduce-failure', 'Reproduce the failure and capture the exact error'),
      step('trace-cause', 'Trace the failing path to the smallest responsible change'),
      step('apply-fix', 'Apply a scoped fix without unrelated refactors'),
      step('verify-regression', 'Run the failing case plus the nearest regression check'),
    ],
    contextNeeded: ['Error output', 'Command or workflow that fails', 'Expected behavior', 'Recent related changes'],
    guardrails: [guard('Do not guess a fix before reproducing or locating evidence', undefined, 'strict')],
    verification: [check('repro-case', 'Original failing case passes'), check('tests', 'Focused tests pass')],
    doneWhen: ['The original failure is reproduced, fixed, and verified with a focused check.'],
  },
  {
    id: 'refactor_clean',
    title: 'Refactor and clean code',
    category: 'code-quality',
    description: 'Clean messy, duplicated, or AI-generated code while preserving behavior.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a conservative implementation pass, then verify behavior and tests.',
    keywords: ['refactor', 'cleanup', 'clean up', 'simplify', '重构', '清理', '整理', '函数', '代码太乱', '垃圾代码', '臃肿', '重复代码'],
    negativeKeywords: ['网页', '页面', '界面', 'ui', 'redesign', '视觉'],
    skillNames: ['ai-slop-cleaner', 'coding-standards', 'ai-regression-testing'],
    workflow: [
      step('identify-behavior-boundary', 'Identify behavior that must stay unchanged'),
      step('remove-noise', 'Remove duplication, dead branches, and unclear generated code'),
      step('tighten-types', 'Tighten names, types, and boundaries without broad rewrites'),
      step('verify-behavior', 'Run focused checks for the touched surface'),
    ],
    contextNeeded: ['Target files or module', 'Behavior that must not change', 'Relevant tests or manual check'],
    guardrails: [guard('Preserve external behavior; do not combine refactor with feature work', undefined, 'strict')],
    verification: [check('tests', 'Focused tests pass'), check('lint', 'Lint/typecheck passes', 'npm run lint')],
    doneWhen: ['The code is simpler and behavior is verified unchanged.'],
  },
  {
    id: 'audit_security',
    title: 'Security audit',
    category: 'security',
    description: 'Audit authentication, authorization, secrets, and vulnerability-sensitive code paths.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a high-precision review pass; require evidence for every finding.',
    keywords: ['security', 'vulnerability', 'secret', 'auth', 'permission', '安全', '漏洞', '密钥', '认证', '鉴权', '权限', '合规'],
    skillNames: ['security-reviewer', 'django-security', 'laravel-security'],
    workflow: [
      step('map-trust-boundary', 'Map the trust boundary and protected assets'),
      step('inspect-sensitive-paths', 'Inspect auth, permissions, input handling, and secret exposure'),
      step('prioritize-findings', 'Prioritize exploitable findings over generic hardening'),
      step('verify-fixes', 'Verify fixes with targeted tests or manual abuse cases'),
    ],
    contextNeeded: ['Threat surface', 'Auth model', 'Sensitive files or endpoints', 'Expected access rules'],
    guardrails: [guard('Do not report speculative vulnerabilities without an exploitable path', undefined, 'strict')],
    verification: [check('security-case', 'Abuse case is blocked'), check('tests', 'Relevant tests pass')],
    doneWhen: ['Security findings are evidence-backed, prioritized, and verified after fixes.'],
  },
  {
    id: 'release_public_audit',
    title: 'Public release audit',
    category: 'release',
    description: 'Prepare a public release with package and privacy checks.',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'guided',
    modelStrategy: 'Use a release-gate pass and require package/privacy verification before publish.',
    keywords: ['release', 'publish', 'npm', 'audit', 'privacy', 'hook', '发布', '公开', '隐私', '回滚'],
    negativeKeywords: ['api', '接口', '后端', 'backend', 'server', 'k8s', 'docker', '普通部署'],
    skillNames: ['document-release', 'github-ops', 'ci-cd-best-practices'],
    workflow: [
      step('version-consistency', 'Verify package, CLI, health, changelog, and tag version consistency'),
      step('public-package-audit', 'Run public privacy and package dry-run checks'),
      step('release-gate', 'Confirm rollback and CI gates before publishing'),
    ],
    contextNeeded: ['Target version', 'Release notes', 'Changed public surface', 'Rollback path'],
    guardrails: [guard('Never publish without a public privacy scan', undefined, 'strict')],
    verification: [
      check('audit-public', 'Public audit passes', 'npm run audit:public'),
      check('pack-dry-run', 'Package dry-run passes', 'npm pack --dry-run --json'),
    ],
    doneWhen: ['Package contents, docs, version, and rollback path are verified.'],
  },
];

export function listCombos(category?: string): ComboTemplate[] {
  const normalized = category?.toLowerCase();
  if (!normalized) return COMBOS;
  return COMBOS.filter(combo => combo.category.toLowerCase() === normalized || combo.id.startsWith(normalized));
}

export function findCombo(query: string, categories: string[] = []): ComboTemplate | undefined {
  const q = query.toLowerCase();
  const categorySet = new Set(categories.map(c => c.toLowerCase()));
  let best: { combo: ComboTemplate; score: number } | undefined;

  for (const combo of COMBOS) {
    let keywordScore = 0;
    for (const keyword of combo.keywords) {
      if (q.includes(keyword.toLowerCase())) keywordScore += keyword.length > 5 ? 3 : 2;
    }

    if (keywordScore === 0) continue;

    const categoryScore = categorySet.has(combo.category.toLowerCase()) ? 1 : 0;
    const normalizedKeywordScore = Math.min(1, keywordScore / 6);
    const hasNegativeSignal = combo.negativeKeywords?.some(keyword => q.includes(keyword.toLowerCase())) ?? false;
    const score = (categoryScore * 0.6) + (normalizedKeywordScore * 0.4) - (hasNegativeSignal ? 0.5 : 0);
    if (!best || score > best.score) best = { combo, score };
  }

  return best && best.score >= 0.25 ? best.combo : undefined;
}

export function formatComboList(combos: ComboTemplate[]): string {
  if (combos.length === 0) return 'No combos found.';
  const lines = ['Built-in route combos:', ''];
  for (const combo of combos) {
    lines.push(`  ${combo.id} [${combo.category}]`);
    lines.push(`    ${combo.description}`);
    lines.push(`    Entry: ${combo.entryCommand} (${combo.executionMode})`);
    lines.push(`    Skills: ${combo.skillNames.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
