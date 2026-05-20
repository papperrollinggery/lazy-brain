import type { Enhancement, OrchestrationPlan, TaskSignal } from './types.js';
import { loadUserRules } from './user-rules.js';

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
  const builtIns: OrchestrationRule[] = [
    {
      name: 'payment-security-release',
      description: 'Payment or auth deployment requires security, tests, and release review.',
      confidence: 0.94,
      match: (signal) => has(signal, /\b(payment|checkout|billing|stripe|auth|login|token|credential)\b|生产|上线|支付|认证|鉴权/),
      plan: (signal) => plan(signal, ['security-review', 'tdd-workflow', 'code-review', 'ship'], 0.94, 'payment/auth risk detected'),
    },
    {
      name: 'production-deploy',
      description: 'Production deploy routes through review, CI, security, and ship.',
      confidence: 0.9,
      match: (signal) => has(signal, /\b(deploy|release|ship|production|publish)\b|上线|发布|部署/),
      plan: (signal) => plan(signal, ['code-review', 'ci-cd-best-practices', 'security-review', 'ship'], 0.9, 'production release intent detected'),
    },
    {
      name: 'bug-fix',
      description: 'Bug fixing needs investigation, regression tests, and review.',
      confidence: 0.88,
      match: (signal) => has(signal, /\b(bug|crash|error|failing|broken|debug)\b|报错|崩溃|失败|调试/),
      plan: (signal) => plan(signal, ['investigate', 'tdd-workflow', 'code-review'], 0.88, 'bug or failure signal detected'),
    },
    {
      name: 'new-frontend',
      description: 'New UI work needs frontend design and browser verification.',
      confidence: 0.86,
      match: (signal) => has(signal, /\b(frontend|react|page|screen|component|ui|css)\b|页面|界面|组件|前端/),
      plan: (signal) => plan(signal, ['frontend-design', 'frontend-patterns', 'e2e-testing'], 0.86, 'frontend UI work detected'),
    },
    {
      name: 'test-request',
      description: 'Explicit testing requests should use TDD and regression review.',
      confidence: 0.84,
      match: (signal) => has(signal, /\b(test|tests|coverage|vitest|jest|playwright)\b|测试|覆盖/),
      plan: (signal) => plan(signal, ['tdd-workflow', 'ai-regression-testing'], 0.84, 'test intent detected'),
    },
    {
      name: 'documentation',
      description: 'Documentation work uses docs plus developer-experience review.',
      confidence: 0.82,
      match: (signal) => has(signal, /\b(readme|docs|documentation|handoff|api docs)\b|文档|说明|交接/),
      plan: (signal) => plan(signal, ['docs', 'document-review', 'devex-review'], 0.82, 'documentation intent detected'),
    },
    {
      name: 'database-change',
      description: 'Database work needs migration, performance, and security review.',
      confidence: 0.85,
      match: (signal) => has(signal, /\b(database|sql|migration|postgres|schema|index)\b|数据库|迁移|索引/),
      plan: (signal) => plan(signal, ['database', 'database-migrations', 'performance', 'security-review'], 0.85, 'database change detected'),
    },
    {
      name: 'docker-infra',
      description: 'Container and infra work routes through Docker and CI.',
      confidence: 0.83,
      match: (signal) => has(signal, /\b(docker|container|k8s|kubernetes|terraform|infra)\b|容器|镜像/),
      plan: (signal) => plan(signal, ['docker-patterns', 'ci-cd-best-practices', 'ship'], 0.83, 'infrastructure work detected'),
    },
    {
      name: 'architecture-plan',
      description: 'Architecture work needs planning before implementation.',
      confidence: 0.82,
      match: (signal) => has(signal, /\b(architecture|system design|migration plan|module boundary)\b|架构|系统设计|方案/),
      plan: (signal) => plan(signal, ['architecture', 'plan', 'docs'], 0.82, 'architecture planning detected'),
    },
    {
      name: 'research-current-facts',
      description: 'Research or current facts need source-backed lookup.',
      confidence: 0.8,
      match: (signal) => has(signal, /\b(research|latest|look up|source|compare)\b|官网|搜索|研究|查一下/),
      plan: (signal) => plan(signal, ['research', 'docs'], 0.8, 'research intent detected'),
    },
    {
      name: 'api-endpoint',
      description: 'API endpoint work needs contract design, backend patterns, and tests.',
      confidence: 0.87,
      match: (signal) => has(signal, /\b(api|endpoint|route|handler|controller)\b|接口|端点|路由|后端接口/),
      plan: (signal) => plan(signal, ['api-design', 'backend-patterns', 'tdd-workflow'], 0.87, 'API endpoint work detected'),
    },
    {
      name: 'refactoring',
      description: 'Refactoring routes through behavior lock, cleanup, and review.',
      confidence: 0.86,
      match: (signal) => has(signal, /\b(refactor|clean|simplify|extract|cleanup)\b|重构|清理|简化|抽取/),
      plan: (signal) => plan(signal, ['refactor-clean', 'tdd-workflow', 'code-review'], 0.86, 'refactoring intent detected'),
    },
    {
      name: 'performance-issue',
      description: 'Performance issues need measurement, investigation, and regression checks.',
      confidence: 0.86,
      match: (signal) => has(signal, /\b(performance|slow|latency|memory|profile|optimize)\b|优化|性能|慢|延迟|内存/),
      plan: (signal) => plan(signal, ['performance', 'investigate', 'tdd-workflow'], 0.86, 'performance issue detected'),
    },
    {
      name: 'new-project-setup',
      description: 'New project setup starts with planning, architecture, and docs.',
      confidence: 0.84,
      match: (signal) => has(signal, /\b(init|scaffold|bootstrap|new project|starter)\b|初始化|脚手架|新项目|启动项目/),
      plan: (signal) => plan(signal, ['plan', 'architecture', 'docs'], 0.84, 'new project setup detected'),
    },
    {
      name: 'code-quality',
      description: 'Code quality cleanup uses cleanup, refactor, and review skills.',
      confidence: 0.83,
      match: (signal) => has(signal, /\b(lint|format|slop|code quality|messy|clean code)\b|格式化|代码质量|太乱|清爽/),
      plan: (signal) => plan(signal, ['ai-slop-cleaner', 'refactor-clean', 'code-review'], 0.83, 'code quality intent detected'),
    },
    {
      name: 'mobile-development',
      description: 'Mobile work routes through mobile app patterns, tests, and shipping.',
      confidence: 0.83,
      match: (signal) => has(signal, /\b(ios|swift|android|flutter|mobile)\b|移动端|手机端|安卓/),
      plan: (signal) => plan(signal, ['build-ios-apps', 'tdd-workflow', 'ship'], 0.83, 'mobile development detected'),
    },
    {
      name: 'ci-failure',
      description: 'CI failures require pipeline investigation before changes.',
      confidence: 0.86,
      match: (signal) => has(signal, /\b(ci|pipeline|github actions|workflow fail|build fail)\b|流水线|构建失败|ci失败|自动化失败/),
      plan: (signal) => plan(signal, ['ci-cd-best-practices', 'investigate'], 0.86, 'CI failure detected'),
    },
    {
      name: 'migration',
      description: 'Migrations and upgrades need planning, tests, security review, and ship checks.',
      confidence: 0.87,
      match: (signal) => has(signal, /\b(migrate|migration|upgrade|version bump|bump version)\b|升级|迁移|版本升级|版本更新/),
      plan: (signal) => plan(signal, ['plan', 'tdd-workflow', 'security-review', 'ship'], 0.87, 'migration or upgrade detected'),
    },
  ];
  return [...loadUserRules(), ...builtIns];
}

export function matchRules(signal: TaskSignal, disabledRules: string[] = []): OrchestrationPlan | null {
  const disabled = new Set(disabledRules);
  const candidates = loadRules()
    .filter((rule) => !disabled.has(rule.name) && rule.match(signal))
    .map((rule) => rule.plan(signal))
    .sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}
