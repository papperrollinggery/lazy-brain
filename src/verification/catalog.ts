/**
 * LazyBrain — Verification Catalog
 *
 * Reusable checks for route plans. These are advisory requirements only; the
 * orchestrator never executes them.
 */

import type { GuardrailRule, VerificationRequirement } from '../types.js';

export interface VerificationBundle {
  verification: VerificationRequirement[];
  doneWhen: string[];
  guardrails: GuardrailRule[];
}

function req(
  id: string,
  title: string,
  detail?: string,
  command?: string,
): VerificationRequirement {
  return { id, title, detail, command, required: true, source: 'catalog' };
}

const WEB_UI: VerificationBundle = {
  verification: [
    req('ui-desktop-screenshot', 'Desktop screenshot check', 'Verify layout at a desktop viewport such as 1280x800.'),
    req('ui-mobile-screenshot', 'Mobile screenshot check', 'Verify layout at a mobile viewport such as 390x844.'),
    req('ui-console-clean', 'Console error check', 'Open the page and confirm there are no runtime console errors.'),
  ],
  doneWhen: [
    'The target screen is readable on desktop and mobile.',
    'No visible overlap, clipping, or broken interaction remains.',
  ],
  guardrails: [
    { title: 'Do not add decorative UI that hides the workflow', strength: 'normal', source: 'fallback' },
  ],
};

const DASHBOARD: VerificationBundle = {
  verification: [
    req('dashboard-operating-questions', 'Operating question check', 'Confirm the dashboard answers the target user questions without requiring explanation outside the UI.'),
    ...WEB_UI.verification,
  ],
  doneWhen: [
    'The dashboard exposes the main decisions, blockers, metrics, and next actions.',
    'A target operator can scan the page and know what needs attention.',
  ],
  guardrails: [
    { title: 'Prioritize dense operational signal over marketing layout', strength: 'strict', source: 'fallback' },
  ],
};

const DOCS: VerificationBundle = {
  verification: [
    req('docs-structure', 'Docs structure check', 'Confirm install, usage, troubleshooting, rollback, and limits are easy to find.'),
    req('docs-readable', 'Plain-language readability check', 'Confirm a non-maintainer can follow the flow without hidden context.'),
    req('docs-copyable-commands', 'Copyable command check', 'Confirm command blocks can be copied and run as shown.'),
  ],
  doneWhen: [
    'The docs separate implemented behavior from planned behavior.',
    'A new user can install, test, use, and recover without reading source code.',
  ],
  guardrails: [
    { title: 'Do not overclaim features that are only planned', strength: 'strict', source: 'fallback' },
  ],
};

const CODE: VerificationBundle = {
  verification: [
    req('code-lint', 'Lint/typecheck', undefined, 'npm run lint'),
    req('code-test', 'Automated tests', undefined, 'npm test'),
    req('code-build', 'Production build', undefined, 'npm run build'),
  ],
  doneWhen: [
    'Relevant tests cover the changed behavior.',
    'Build, lint, and tests pass locally or the remaining failure is explicitly explained.',
  ],
  guardrails: [
    { title: 'Keep edits scoped to the requested behavior', strength: 'normal', source: 'fallback' },
  ],
};

const HOOK_RELEASE: VerificationBundle = {
  verification: [
    req('hook-dry-run', 'Hook dry-run preview', undefined, 'lazybrain hook plan --json'),
    req('hook-rollback', 'Rollback path check', 'Confirm LazyBrain-created backups can restore the prior settings.'),
    req('privacy-scan', 'Public privacy scan', undefined, 'npm run audit:public'),
    req('package-dry-run', 'Package dry-run', undefined, 'npm pack --dry-run --json'),
  ],
  doneWhen: [
    'The release package contains only public artifacts.',
    'Hook changes are previewable and reversible before install.',
  ],
  guardrails: [
    { title: 'Do not install hooks or write target CLI config from route planning', strength: 'strict', source: 'fallback' },
  ],
};

function mergeBundles(...bundles: VerificationBundle[]): VerificationBundle {
  const checks = new Map<string, VerificationRequirement>();
  const doneWhen: string[] = [];
  const guardrails = new Map<string, GuardrailRule>();

  for (const bundle of bundles) {
    for (const check of bundle.verification) checks.set(check.id ?? check.title, check);
    for (const item of bundle.doneWhen) if (!doneWhen.includes(item)) doneWhen.push(item);
    for (const rule of bundle.guardrails) guardrails.set(rule.title, rule);
  }

  return {
    verification: [...checks.values()],
    doneWhen,
    guardrails: [...guardrails.values()],
  };
}

export function getVerificationBundle(input: {
  query: string;
  category?: string;
  comboId?: string;
}): VerificationBundle {
  const q = input.query.toLowerCase();
  const category = input.category?.toLowerCase() ?? '';
  const bundles: VerificationBundle[] = [];

  if (
    input.comboId?.startsWith('frontend') ||
    /\b(frontend|ui|page|redesign|screen|interface)\b/.test(q) ||
    /界面|页面|前端|改版|重设计/.test(q)
  ) {
    bundles.push(WEB_UI);
  }
  if (input.comboId === 'dashboard_ceo' || /\b(ceo|dashboard|metrics|ops)\b/.test(q) || /看板|后台|运营|指标/.test(q)) {
    bundles.push(DASHBOARD);
  }
  if (input.comboId === 'docs_public_install' || /\b(readme|docs|documentation|install)\b/.test(q) || /文档|安装流程|说明/.test(q)) {
    bundles.push(DOCS);
  }
  if (
    input.comboId === 'code_review_regression' ||
    category.includes('code') ||
    /\b(code|review|regression|test|build|lint)\b/.test(q) ||
    /代码|审查|回归|测试|构建/.test(q)
  ) {
    bundles.push(CODE);
  }
  if (
    input.comboId === 'release_public_audit' ||
    /\b(hook|release|publish|package|rollback|privacy|audit)\b/.test(q) ||
    /发布|隐私|回滚|公开|审计|钩子/.test(q)
  ) {
    bundles.push(HOOK_RELEASE);
  }

  return bundles.length > 0 ? mergeBundles(...bundles) : CODE;
}
