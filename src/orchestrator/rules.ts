import type { Enhancement, OrchestrationPlan, TaskSignal } from './types.js';

export interface OrchestrationRule {
  name: string;
  description: string;
  match: (signal: TaskSignal) => boolean;
  plan: (signal: TaskSignal) => OrchestrationPlan;
  confidence: number;
}

function text(signal: TaskSignal): string {
  return `${signal.content} ${(signal.context.files_changed ?? []).join(' ')}`.toLowerCase();
}

function has(signal: TaskSignal, pattern: RegExp): boolean {
  return pattern.test(text(signal));
}

function enhancement(name: string, priority: number, reason: string, type: Enhancement['type'] = 'skill'): Enhancement {
  return { type, name, priority, reason };
}

function plan(signal: TaskSignal, names: string[], confidence: number, reason: string, sequence: OrchestrationPlan['sequence'] = 'sequential'): OrchestrationPlan {
  return {
    trigger: signal,
    enhancements: names.map((name, index) => enhancement(name, index + 1, reason)),
    sequence,
    confidence,
    reason,
    autoActivate: false,
  };
}

export function loadRules(): OrchestrationRule[] {
  return [
    {
      name: 'payment-security-release',
      description: 'Payment or auth deployment requires security, tests, and release review.',
      confidence: 0.94,
      match: (signal) => has(signal, /\b(payment|checkout|billing|stripe|auth|login|token|credential|生产|上线|支付|认证|鉴权)\b/),
      plan: (signal) => plan(signal, ['security-review', 'tdd-workflow', 'code-review', 'ship'], 0.94, 'payment/auth risk detected'),
    },
    {
      name: 'production-deploy',
      description: 'Production deploy routes through review, CI, security, and ship.',
      confidence: 0.9,
      match: (signal) => has(signal, /\b(deploy|release|ship|production|publish|上线|发布|部署)\b/),
      plan: (signal) => plan(signal, ['code-review', 'ci-cd-best-practices', 'security-review', 'ship'], 0.9, 'production release intent detected'),
    },
    {
      name: 'bug-fix',
      description: 'Bug fixing needs investigation, regression tests, and review.',
      confidence: 0.88,
      match: (signal) => has(signal, /\b(bug|crash|error|failing|broken|debug|报错|崩溃|失败|调试)\b/),
      plan: (signal) => plan(signal, ['investigate', 'tdd-workflow', 'code-review'], 0.88, 'bug or failure signal detected'),
    },
    {
      name: 'new-frontend',
      description: 'New UI work needs frontend design and browser verification.',
      confidence: 0.86,
      match: (signal) => has(signal, /\b(frontend|react|page|screen|component|ui|css|页面|界面|组件|前端)\b/),
      plan: (signal) => plan(signal, ['frontend-design', 'frontend-patterns', 'e2e-testing'], 0.86, 'frontend UI work detected'),
    },
    {
      name: 'test-request',
      description: 'Explicit testing requests should use TDD and regression review.',
      confidence: 0.84,
      match: (signal) => has(signal, /\b(test|tests|coverage|vitest|jest|playwright|测试|覆盖)\b/),
      plan: (signal) => plan(signal, ['tdd-workflow', 'ai-regression-testing'], 0.84, 'test intent detected'),
    },
    {
      name: 'documentation',
      description: 'Documentation work uses docs plus developer-experience review.',
      confidence: 0.82,
      match: (signal) => has(signal, /\b(readme|docs|documentation|handoff|api docs|文档|说明|交接)\b/),
      plan: (signal) => plan(signal, ['docs', 'document-review', 'devex-review'], 0.82, 'documentation intent detected'),
    },
    {
      name: 'database-change',
      description: 'Database work needs migration, performance, and security review.',
      confidence: 0.85,
      match: (signal) => has(signal, /\b(database|sql|migration|postgres|schema|index|数据库|迁移|索引)\b/),
      plan: (signal) => plan(signal, ['database', 'database-migrations', 'performance', 'security-review'], 0.85, 'database change detected'),
    },
    {
      name: 'docker-infra',
      description: 'Container and infra work routes through Docker and CI.',
      confidence: 0.83,
      match: (signal) => has(signal, /\b(docker|container|k8s|kubernetes|terraform|infra|容器|镜像)\b/),
      plan: (signal) => plan(signal, ['docker-patterns', 'ci-cd-best-practices', 'ship'], 0.83, 'infrastructure work detected'),
    },
    {
      name: 'architecture-plan',
      description: 'Architecture work needs planning before implementation.',
      confidence: 0.82,
      match: (signal) => has(signal, /\b(architecture|system design|migration plan|module boundary|架构|系统设计|方案)\b/),
      plan: (signal) => plan(signal, ['architecture', 'plan', 'docs'], 0.82, 'architecture planning detected'),
    },
    {
      name: 'research-current-facts',
      description: 'Research or current facts need source-backed lookup.',
      confidence: 0.8,
      match: (signal) => has(signal, /\b(research|latest|look up|source|compare|官网|搜索|研究|查一下)\b/),
      plan: (signal) => plan(signal, ['research', 'docs'], 0.8, 'research intent detected'),
    },
  ];
}

export function matchRules(signal: TaskSignal, disabledRules: string[] = []): OrchestrationPlan | null {
  const disabled = new Set(disabledRules);
  const candidates = loadRules()
    .filter((rule) => !disabled.has(rule.name) && rule.match(signal))
    .map((rule) => rule.plan(signal))
    .sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}
