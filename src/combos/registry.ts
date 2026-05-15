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
    skillNames: ['security-review', 'code-review', 'tdd-workflow'],
    workflow: [step('Map the sensitive boundary'), step('Audit auth, input, and secrets'), step('Add focused regression checks')],
    guardrails: [guard('Every finding must cite an exploitable path or concrete risk')],
    verification: [check('Focused security tests pass'), check('Full tests pass', 'npm test')],
    doneWhen: ['Sensitive paths are reviewed and verified.'],
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
  const ranked = COMBOS
    .map((combo) => ({
      combo,
      score: scoreCombo(combo, query) + (categorySet.has(combo.category) ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.combo;
}

export function formatComboList(combos: ComboTemplate[]): string {
  return combos.map((combo) => `${combo.id} [${combo.category}] ${combo.description}`).join('\n');
}
