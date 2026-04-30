/**
 * LazyBrain — Route Plan Orchestrator
 *
 * Converts match results into an advisory execution plan. It never executes
 * skills and never writes Claude/Codex/Cursor configuration.
 */

import type {
  Capability,
  ChoiceOption,
  ChoiceSet,
  ConflictNotice,
  DecisionPolicy,
  GuardrailRule,
  HistoryEntry,
  Recommendation,
  RouteAdapterPayload,
  RouteSkillRef,
  RouteSpec,
  RouteTarget,
  RouteTokenStrategy,
  SkillSchema,
  UserConfig,
  UserProfile,
  VerificationRequirement,
  WorkflowStep,
} from '../types.js';
import { Graph } from '../graph/graph.js';
import { match } from '../matcher/matcher.js';
import { findCombo, formatComboEntryCommand, type ComboTemplate } from '../combos/registry.js';
import { getVerificationBundle } from '../verification/catalog.js';
import { classifyRouteNeed, type RouteGateDecision } from './route-gate.js';

export interface BuildRouteSpecOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  profile?: UserProfile;
  target?: RouteTarget;
}

const TARGETS: RouteTarget[] = ['generic', 'claude', 'codex', 'cursor'];
export const ROUTE_SPEC_SCHEMA_VERSION = '1.5.0';

type RouteSpecDraft = Omit<RouteSpec, 'adapters' | 'choices'>;
type ChoiceContext = {
  gate: RouteGateDecision;
};

export function isRouteTarget(value: string): value is RouteTarget {
  return TARGETS.includes(value as RouteTarget);
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function isVagueQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  const vague = /有点乱|怎么安排|你看怎么|看一下|帮我看看|不知道|随便|优化一下|弄一下|搞一下/.test(q) ||
    /\b(fix this|make it better|clean this up|help me|figure it out)\b/.test(q);
  const concrete = /\b(dashboard|readme|docs|hook|release|publish|review|test|build|lint|ui|frontend|api|debug|bug|rollback|privacy)\b/.test(q) ||
    /看板|文档|安装|发布|审查|测试|构建|界面|页面|前端|回滚|隐私|卡住|报错/.test(q);
  return vague && !concrete;
}

function clarificationQuestions(query: string): string[] {
  void query;
  return [
    'What is the target output: code change, docs, review, debug report, or release plan?',
    'Which files, page, command, or runtime should the agent inspect first?',
    'What counts as done, and which verification command or visual check matters most?',
  ];
}

function schemaFrom(cap: Capability): SkillSchema | undefined {
  return cap.schema;
}

function resolveCapabilityByName(graph: Graph, name: string): Capability | undefined {
  const lower = name.toLowerCase();
  return graph.getAllNodes().find(node => node.name.toLowerCase() === lower) ??
    graph.getAllNodes().find(node => node.name.toLowerCase().includes(lower));
}

function compactReason(value: string | undefined, max = 220): string | undefined {
  if (!value) return undefined;
  const firstBlock = value.split(/\n\s*\n/)[0] ?? value;
  const normalized = firstBlock.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > max ? normalized.slice(0, max - 3).trimEnd() + '...' : normalized;
}

function toSkillRef(cap: Capability, result?: Recommendation['matches'][number], reason?: string): RouteSkillRef {
  return {
    id: cap.id,
    name: cap.name,
    kind: cap.kind,
    category: cap.category,
    origin: cap.origin,
    available: true,
    score: result?.score,
    layer: result?.layer,
    reason: compactReason(reason ?? result?.explanation ?? cap.scenario ?? cap.description),
  };
}

function missingSkillRef(name: string, category: string, reason: string): RouteSkillRef {
  return {
    id: `missing:${name}`,
    name,
    kind: 'skill',
    category,
    origin: 'combo',
    available: false,
    reason,
  };
}

function buildSkillRefs(graph: Graph, rec: Recommendation, combo?: ComboTemplate): RouteSkillRef[] {
  const refs: RouteSkillRef[] = [];
  const resultById = new Map(rec.matches.map(result => [result.capability.id, result]));

  if (combo) {
    for (const name of combo.skillNames) {
      const cap = resolveCapabilityByName(graph, name);
      refs.push(cap
        ? toSkillRef(cap, resultById.get(cap.id), `Combo ${combo.id}`)
        : missingSkillRef(name, combo.category, `Combo ${combo.id} recommends this role, but no installed capability matched it.`));
    }
  }

  for (const result of rec.matches.slice(0, 5)) {
    refs.push(toSkillRef(result.capability, result));
  }

  return unique(refs, item => item.id);
}

function fallbackWorkflow(query: string, rec: Recommendation): WorkflowStep[] {
  const top = rec.matches[0]?.capability;
  return [
    { id: 'clarify-task-surface', title: 'Confirm the target surface and expected output', source: 'fallback' },
    {
      id: 'apply-primary-capability',
      title: top ? `Use ${top.name} for the main task` : 'Use the best matched capability for the main task',
      detail: top?.scenario ?? top?.description ?? query,
      source: 'fallback',
    },
    { id: 'verify-result', title: 'Run the relevant verification before calling the task done', source: 'fallback' },
  ];
}

function collectSchemas(skills: RouteSkillRef[], graph: Graph): SkillSchema[] {
  const schemas: SkillSchema[] = [];
  for (const skill of skills) {
    if (!skill.available) continue;
    const cap = graph.getNode(skill.id);
    const schema = cap ? schemaFrom(cap) : undefined;
    if (schema) schemas.push(schema);
  }
  return schemas;
}

function mergeWorkflow(query: string, rec: Recommendation, combo: ComboTemplate | undefined, schemas: SkillSchema[]): WorkflowStep[] {
  const fromSchema = schemas.flatMap(schema => schema.workflow);
  const items = [...(combo?.workflow ?? []), ...fromSchema];
  return unique(items.length > 0 ? items : fallbackWorkflow(query, rec), item => item.title);
}

function mergeStrings(...groups: Array<string[] | undefined>): string[] {
  return unique(groups.flatMap(group => group ?? []), item => item);
}

function mergeGuardrails(...groups: Array<GuardrailRule[] | undefined>): GuardrailRule[] {
  return unique(groups.flatMap(group => group ?? []), item => item.title);
}

function mergeVerification(...groups: Array<VerificationRequirement[] | undefined>): VerificationRequirement[] {
  return unique(groups.flatMap(group => group ?? []), item => item.id ?? item.title);
}

function adapterPrompt(spec: Omit<RouteSpec, 'adapters'>, target: RouteTarget): string {
  const targetLabel: Record<RouteTarget, string> = {
    generic: 'Generic AI agent',
    claude: 'Claude / Agent Agency',
    codex: 'Codex',
    cursor: 'Cursor',
  };
  const lines = [
    `${targetLabel[target]} advisory route plan`,
    '',
    `Intent: ${spec.intent}`,
    `Scenario: ${spec.scenario}`,
    `Mode: ${spec.mode}`,
    `Why route: ${spec.whyRoute}`,
  ];
  if (spec.entryCommand) lines.push(`Entry command: ${spec.entryCommand}`);
  if (spec.executionMode) lines.push(`Execution mode: ${spec.executionMode}`);
  if (spec.modelStrategy) lines.push(`Model strategy: ${spec.modelStrategy}`);

  lines.push(`Recommended choice: ${spec.choices.recommended.label} (${spec.choices.recommended.kind})`);
  if (spec.choices.alternatives.length > 0) {
    lines.push('Alternatives:');
    for (const choice of spec.choices.alternatives.slice(0, 3)) {
      lines.push(`- ${choice.label} (${choice.kind}, ${Math.round(choice.confidence * 100)}%)`);
    }
  }
  if (spec.choices.conflicts.length > 0) {
    lines.push('Conflict notices:');
    for (const conflict of spec.choices.conflicts.slice(0, 3)) {
      lines.push(`- ${conflict.group}: ${conflict.reason}`);
    }
  }

  lines.push('', 'Token strategy:');
  lines.push(`- Top-K skills: ${spec.tokenStrategy.topKSkills}`);
  lines.push(`- Full skill body: ${spec.tokenStrategy.includeFullSkillBody ? 'yes' : 'no'}`);
  lines.push(`- Context budget: ${spec.tokenStrategy.contextBudget}`);

  if (spec.skills.length > 0) {
    lines.push('', 'Use:');
    for (const skill of spec.skills) {
      lines.push(`- ${skill.name}${skill.available ? '' : ' (missing: use a generic prompt)'}`);
    }
  }

  if (spec.contextNeeded.length > 0) {
    lines.push('', 'Context needed:');
    for (const item of spec.contextNeeded) lines.push(`- ${item}`);
  }

  if (spec.executionPlan.length > 0) {
    lines.push('', 'Workflow:');
    for (const [index, step] of spec.executionPlan.entries()) {
      lines.push(`${index + 1}. ${step.title}${step.detail ? ` — ${step.detail}` : ''}`);
    }
  }

  if (spec.guardrails.length > 0) {
    lines.push('', 'Guardrails:');
    for (const rule of spec.guardrails) lines.push(`- ${rule.title}${rule.detail ? `: ${rule.detail}` : ''}`);
  }

  if (spec.verification.length > 0) {
    lines.push('', 'Verification:');
    for (const check of spec.verification) {
      lines.push(`- ${check.title}${check.command ? ` (${check.command})` : ''}`);
    }
  }

  if (spec.doneWhen.length > 0) {
    lines.push('', 'Done when:');
    for (const item of spec.doneWhen) lines.push(`- ${item}`);
  }

  if (spec.clarificationQuestions?.length) {
    lines.push('', 'Clarify first:');
    for (const question of spec.clarificationQuestions) lines.push(`- ${question}`);
  }

  return lines.join('\n');
}

function buildAdapters(spec: Omit<RouteSpec, 'adapters'>): RouteSpec['adapters'] {
  const adapters: RouteSpec['adapters'] = {
    generic: { target: 'generic', prompt: adapterPrompt(spec, 'generic') },
  };
  if (spec.target !== 'generic') {
    adapters[spec.target] = { target: spec.target, prompt: adapterPrompt(spec, spec.target) } as RouteAdapterPayload;
  }
  return adapters;
}

function needsClarification(query: string, rec: Recommendation, combo?: ComboTemplate): boolean {
  if (combo) return false;
  if (classifyRouteNeed(query).mode === 'needs_clarification') return true;
  if (isVagueQuery(query)) return true;
  if (rec.matches.length === 0) return true;
  return (rec.matches[0]?.score ?? 0) < 0.22;
}

function shouldSuggestSubagents(query: string, combo?: ComboTemplate): boolean {
  return /\b(team|subagent|multi-agent|parallel|agents?)\b|智能体|子智能体|团队|并行|审查|评审/iu.test(query) ||
    combo?.id === 'code_review_regression' ||
    combo?.id === 'release_public_audit';
}

function tokenStrategyFor(input: {
  mode: RouteSpec['mode'];
  skills: RouteSkillRef[];
  query: string;
  combo?: ComboTemplate;
}): RouteTokenStrategy {
  const shouldClarifyFirst = input.mode === 'needs_clarification';
  const suggestSubagents = input.mode === 'route_plan' && shouldSuggestSubagents(input.query, input.combo);
  const topKSkills = input.mode === 'route_plan' ? Math.min(3, input.skills.length) : 0;
  const contextBudget: RouteTokenStrategy['contextBudget'] = input.mode === 'no_route_needed'
    ? 'minimal'
    : input.combo
      ? 'focused'
      : 'focused';
  return {
    topKSkills,
    includeFullSkillBody: false,
    suggestSubagents,
    shouldClarifyFirst,
    contextBudget,
    summary: shouldClarifyFirst
      ? 'Clarify before loading skill context.'
      : input.mode === 'no_route_needed'
        ? 'Handle directly; no skill body should be loaded.'
      : `Load only ${topKSkills} compact skill card${topKSkills === 1 ? '' : 's'} plus verification guidance.`,
  };
}

function clampConfidence(value: number | undefined, fallback: number): number {
  const raw = Number.isFinite(value) ? value as number : fallback;
  return Math.max(0, Math.min(1, Math.round(raw * 100) / 100));
}

function routeCostFromCapability(cap: Capability | undefined): ChoiceOption['cost'] {
  if (cap?.costLevel === 'high') return 'high';
  if (cap?.costLevel === 'medium') return 'medium';
  return 'low';
}

function routeRiskFromCapability(cap: Capability | undefined, available: boolean): ChoiceOption['risk'] {
  if (!available) return 'medium';
  if (cap?.requiresConfirmation || cap?.riskLevel === 'destructive') return 'high';
  if (cap?.riskLevel === 'caution') return 'medium';
  return 'low';
}

function latencyFromCost(cost: ChoiceOption['cost']): ChoiceOption['latency'] {
  if (cost === 'high') return 'slow';
  if (cost === 'medium') return 'normal';
  return 'fast';
}

function choiceKindForSkill(skill: RouteSkillRef): ChoiceOption['kind'] {
  if (skill.kind === 'mode') return 'mode';
  return skill.origin.toLowerCase().includes('plugin') ? 'plugin' : 'skill';
}

function skillChoice(skill: RouteSkillRef, graph: Graph, fallbackConfidence: number): ChoiceOption {
  const cap = graph.getNode(skill.id);
  const cost = routeCostFromCapability(cap);
  return {
    id: `${choiceKindForSkill(skill)}:${skill.id}`,
    kind: choiceKindForSkill(skill),
    label: skill.name,
    confidence: clampConfidence(skill.score, fallbackConfidence),
    cost,
    latency: latencyFromCost(cost),
    risk: routeRiskFromCapability(cap, skill.available),
    reason: skill.reason ?? `${skill.name} is a matched capability for this route.`,
  };
}

function modeChoice(mode: RouteSpec['mode'], confidence: number, reason: string): ChoiceOption {
  if (mode === 'no_route_needed') {
    return {
      id: 'mode:direct',
      kind: 'mode',
      label: 'Direct execution',
      confidence: clampConfidence(confidence, 0.9),
      cost: 'low',
      latency: 'fast',
      risk: 'low',
      reason,
    };
  }
  if (mode === 'needs_clarification') {
    return {
      id: 'mode:clarify-first',
      kind: 'mode',
      label: 'Clarify before routing',
      confidence: clampConfidence(confidence, 0.85),
      cost: 'low',
      latency: 'fast',
      risk: 'low',
      reason,
    };
  }
  return {
    id: 'mode:route-plan',
    kind: 'mode',
    label: 'Route plan',
    confidence: clampConfidence(confidence, 0.75),
    cost: 'low',
    latency: 'normal',
    risk: 'medium',
    reason,
  };
}

function modelChoice(modelStrategy: string | undefined, highRisk: boolean): ChoiceOption {
  if (modelStrategy) {
    const strong = /strong|deep|senior|review|audit|security|architecture|高|深|强|审查|安全|架构/i.test(modelStrategy);
    return {
      id: 'model:recommended-strategy',
      kind: 'model',
      label: strong ? 'Stronger reasoning model' : 'Balanced model strategy',
      confidence: strong ? 0.82 : 0.75,
      cost: strong ? 'high' : 'medium',
      latency: strong ? 'slow' : 'normal',
      risk: 'low',
      reason: modelStrategy,
    };
  }
  if (highRisk) {
    return {
      id: 'model:strong-reasoning',
      kind: 'model',
      label: 'Stronger reasoning model',
      confidence: 0.78,
      cost: 'high',
      latency: 'slow',
      risk: 'low',
      reason: 'The route contains high-risk capabilities, so the model strategy should favor stronger reasoning and review.',
    };
  }
  return {
    id: 'model:balanced',
    kind: 'model',
    label: 'Balanced coding model',
    confidence: 0.7,
    cost: 'medium',
    latency: 'normal',
    risk: 'low',
    reason: 'The task is non-trivial but does not require an expensive model by default.',
  };
}

function rankedModelChoices(draft: RouteSpecDraft, highRisk: boolean): ChoiceOption[] {
  const recommended = modelChoice(draft.modelStrategy, highRisk);
  const fast: ChoiceOption = {
    id: 'model:fast-low-cost',
    kind: 'model',
    label: 'Fast low-cost model',
    confidence: highRisk ? 0.38 : 0.62,
    cost: 'low',
    latency: 'fast',
    risk: highRisk ? 'medium' : 'low',
    reason: highRisk
      ? 'Available only as a fallback because this task has high-risk signals.'
      : 'Good for small implementation, docs, and repeatable verification work.',
  };
  const balanced: ChoiceOption = {
    id: 'model:balanced',
    kind: 'model',
    label: 'Balanced coding model',
    confidence: highRisk ? 0.64 : 0.76,
    cost: 'medium',
    latency: 'normal',
    risk: 'low',
    reason: 'Default fit for normal coding, review, debugging, and documentation tasks.',
  };
  const strong: ChoiceOption = {
    id: 'model:strong-reasoning',
    kind: 'model',
    label: 'Stronger reasoning model',
    confidence: highRisk ? 0.86 : 0.58,
    cost: 'high',
    latency: 'slow',
    risk: 'low',
    reason: highRisk
      ? 'Recommended for high-risk changes, releases, security, production, hooks, and irreversible operations.'
      : 'Use when architecture, subtle bugs, or cross-module tradeoffs matter more than cost.',
  };
  const localPrivate: ChoiceOption = {
    id: 'model:local-private',
    kind: 'model',
    label: 'Local or private model',
    confidence: /secret|token|credential|private|privacy|密钥|隐私/.test(draft.query) ? 0.72 : 0.45,
    cost: 'low',
    latency: 'normal',
    risk: 'low',
    reason: 'Prefer this when sensitive data should stay local or inside a private runtime.',
  };
  const ordered = highRisk
    ? [strong, recommended, balanced, localPrivate, fast]
    : [recommended, balanced, fast, strong, localPrivate];
  return uniqueChoices(ordered);
}

function wantsMode(query: string, pattern: RegExp): boolean {
  return pattern.test(query);
}

function rankedModeChoices(draft: RouteSpecDraft, highRisk: boolean): ChoiceOption[] {
  const q = draft.query;
  const base = modeChoice(draft.mode, draft.mode === 'route_plan' ? 0.76 : 0.9, draft.whyRoute);
  const review: ChoiceOption = {
    id: 'mode:review',
    kind: 'mode',
    label: 'Review mode',
    confidence: wantsMode(q, /review|audit|security|regression|审查|审核|安全|回归/i) || highRisk ? 0.78 : 0.48,
    cost: 'medium',
    latency: 'normal',
    risk: 'low',
    reason: 'Use this when the main value is catching regressions, security issues, or risky assumptions before execution.',
  };
  const qa: ChoiceOption = {
    id: 'mode:qa',
    kind: 'mode',
    label: 'QA mode',
    confidence: wantsMode(q, /test|qa|verify|build|lint|ci|release|publish|测试|验证|构建|发布/i) ? 0.74 : 0.5,
    cost: 'medium',
    latency: 'normal',
    risk: 'low',
    reason: 'Use this when verification evidence matters as much as the code or plan.',
  };
  const autopilot: ChoiceOption = {
    id: 'mode:autopilot',
    kind: 'mode',
    label: 'Autopilot mode',
    confidence: wantsMode(q, /autopilot|auto\s*pilot|end-to-end|end to end|全自动|自动完成|自动跑完|端到端|自己安排/i) ? 0.76 : 0.36,
    cost: 'high',
    latency: 'slow',
    risk: 'high',
    reason: 'Use only when the customer wants an end-to-end autonomous loop with checkpoints and handoff records.',
  };
  const team: ChoiceOption = {
    id: 'mode:team',
    kind: 'mode',
    label: 'Team mode',
    confidence: wantsMode(q, /team|subagent|multi-agent|parallel|团队|子智能体|多智能体|并行/i) ? 0.74 : 0.34,
    cost: 'high',
    latency: 'slow',
    risk: 'medium',
    reason: 'Use when independent subtasks can run in parallel without creating file ownership conflicts.',
  };

  if (draft.mode === 'no_route_needed') {
    return uniqueChoices([
      base,
      {
        id: 'mode:route-plan-if-task-grows',
        kind: 'mode',
        label: 'Route if task grows',
        confidence: 0.48,
        cost: 'low',
        latency: 'normal',
        risk: 'low',
        reason: 'Use route planning only if the direct task expands into coding, review, testing, or release work.',
      },
    ]);
  }

  if (draft.mode === 'needs_clarification') {
    return uniqueChoices([
      base,
      ...[autopilot, team].filter(choice => choice.confidence >= 0.7),
      {
        id: 'mode:route-plan-after-clarification',
        kind: 'mode',
        label: 'Route after clarification',
        confidence: 0.62,
        cost: 'low',
        latency: 'normal',
        risk: 'medium',
        reason: 'After the target output is clear, run route planning with the clarified task.',
      },
    ]);
  }

  return uniqueChoices([base, review, qa, autopilot, team])
    .sort((a, b) => b.confidence - a.confidence);
}

function workflowChoice(draft: RouteSpecDraft): ChoiceOption {
  return {
    id: draft.combo ? `workflow:${draft.combo}` : 'workflow:route-plan',
    kind: 'workflow',
    label: draft.combo ?? draft.intent,
    confidence: draft.combo ? 0.86 : 0.72,
    cost: 'low',
    latency: 'normal',
    risk: draft.guardrails.some(rule => rule.strength === 'strict') ? 'medium' : 'low',
    reason: draft.combo
      ? `Matched built-in workflow ${draft.combo}.`
      : 'Use the generated route plan, compact context, and listed verification.',
    command: draft.entryCommand,
  };
}

function uniqueChoices(items: ChoiceOption[]): ChoiceOption[] {
  return unique(items, item => item.id);
}

function choiceConflicts(skills: RouteSkillRef[], skillChoices: ChoiceOption[]): ConflictNotice[] {
  const conflicts: ConflictNotice[] = [];
  const available = skillChoices.filter(choice => !choice.id.startsWith('skill:missing:'));
  if (available.length > 1) {
    conflicts.push({
      group: 'skill:same-intent',
      winner: available[0].id,
      suppressed: available.slice(1, 4).map(choice => choice.id),
      reason: 'Only the top matched capability should drive initial context; alternatives remain available in choices.',
      severity: 'info',
    });
  }
  const missing = skills.filter(skill => !skill.available);
  if (missing.length > 0) {
    conflicts.push({
      group: 'skill:missing',
      winner: available[0]?.id ?? 'mode:route-plan',
      suppressed: missing.map(skill => `skill:${skill.id}`),
      reason: 'Some recommended combo roles are not installed, so the route should fall back to available capabilities or the generic workflow.',
      severity: 'warn',
    });
  }
  return conflicts;
}

function decisionPolicy(draft: RouteSpecDraft, highRisk: boolean): DecisionPolicy {
  if (draft.mode === 'needs_clarification') {
    return {
      defaultAction: 'ask',
      askUser: true,
      reason: 'The request is too broad or low-confidence; clarify before spending context or selecting tools.',
    };
  }
  if (highRisk) {
    return {
      defaultAction: 'ask',
      askUser: true,
      reason: 'A matched capability is destructive or requires confirmation, so execution should pause for approval.',
    };
  }
  if (draft.mode === 'no_route_needed') {
    return {
      defaultAction: 'auto',
      askUser: false,
      reason: 'The task is small enough to handle directly without loading routing context.',
    };
  }
  return {
    defaultAction: 'auto',
    askUser: false,
    reason: 'Use the recommended route by default; alternatives are advisory unless the caller has stricter policy.',
  };
}

function buildChoiceSet(draft: RouteSpecDraft, graph: Graph, context: ChoiceContext): ChoiceSet {
  const skillChoices = draft.skills.slice(0, 5).map((skill, index) => skillChoice(skill, graph, 0.68 - (index * 0.06)));
  const highRisk = context.gate.category === 'high_risk' || skillChoices.some(choice => choice.risk === 'high');
  const modelChoices = rankedModelChoices(draft, highRisk);
  const modeChoices = rankedModeChoices(draft, highRisk);
  const primaryMode = modeChoices[0] ?? modeChoice(draft.mode, draft.mode === 'route_plan' ? 0.76 : 0.9, draft.whyRoute);

  let recommended: ChoiceOption;
  const alternatives: ChoiceOption[] = [];

  if (draft.mode === 'route_plan') {
    const workflow = workflowChoice(draft);
    recommended = draft.combo ? workflow : skillChoices[0] ?? workflow;
    alternatives.push(
      ...modelChoices.slice(0, 2),
      ...modeChoices,
      workflow,
      ...modelChoices.slice(2, 4),
      ...skillChoices,
    );
  } else if (draft.mode === 'needs_clarification') {
    recommended = primaryMode;
    alternatives.push(...modeChoices.slice(1), ...modelChoices);
  } else {
    recommended = primaryMode;
    alternatives.push(...modeChoices.slice(1));
  }

  return {
    intent: draft.intent,
    recommended,
    alternatives: uniqueChoices(alternatives).filter(choice => choice.id !== recommended.id).slice(0, 8),
    conflicts: choiceConflicts(draft.skills, skillChoices),
    policy: decisionPolicy(draft, highRisk),
  };
}

function finalizeRouteSpec(draft: RouteSpecDraft, graph: Graph, context: ChoiceContext): RouteSpec {
  const withChoices: Omit<RouteSpec, 'adapters'> = {
    ...draft,
    choices: buildChoiceSet(draft, graph, context),
  };
  return { ...withChoices, adapters: buildAdapters(withChoices) };
}

export async function buildRouteSpec(query: string, options: BuildRouteSpecOptions): Promise<RouteSpec> {
  const target = options.target ?? 'generic';
  const gate = classifyRouteNeed(query);
  if (gate.mode === 'no_route_needed') {
    const draft: RouteSpecDraft = {
      schemaVersion: ROUTE_SPEC_SCHEMA_VERSION,
      query,
      target,
      mode: 'no_route_needed',
      intent: 'Handle directly',
      scenario: 'The request appears small enough that a route plan would add overhead.',
      whyRoute: gate.reason,
      skills: [],
      executionPlan: [],
      contextNeeded: [],
      guardrails: [
        { title: 'Do not load skill bodies for tiny direct tasks', strength: 'light', source: 'fallback' },
      ],
      verification: [],
      doneWhen: ['The direct answer or tiny edit is complete.'],
      tokenStrategy: tokenStrategyFor({ mode: 'no_route_needed', skills: [], query }),
      warnings: [],
    };
    return finalizeRouteSpec(draft, options.graph, { gate });
  }

  const rec = await match(query, {
    graph: options.graph,
    config: options.config,
    history: options.history,
    profile: options.profile,
  });
  const categories = rec.matches.map(result => result.capability.category);
  const combo = findCombo(query, categories);
  const skills = buildSkillRefs(options.graph, rec, combo);
  const schemas = collectSchemas(skills, options.graph);
  const catalog = getVerificationBundle({ query, category: categories[0], comboId: combo?.id });
  const schemaWarnings = schemas.flatMap(schema => schema.warnings ?? []);
  const warnings = unique([...(rec.warnings ?? []), ...schemaWarnings], item => item);

  if (needsClarification(query, rec, combo)) {
    const draft: RouteSpecDraft = {
      schemaVersion: ROUTE_SPEC_SCHEMA_VERSION,
      query,
      target,
      mode: 'needs_clarification',
      intent: 'Clarify task before routing',
      scenario: 'The request is too broad or low-confidence for a reliable skill chain.',
      whyRoute: gate.reason,
      mustCallLazyBrainReason: 'Clarification should happen before the main model spends context on a guessed skill chain.',
      skills: [],
      executionPlan: [],
      contextNeeded: [],
      guardrails: [
        { title: 'Ask for the missing task surface before recommending a skill chain', strength: 'strict', source: 'fallback' },
      ],
      verification: [],
      doneWhen: ['The user or main model has clarified the target output and verification method.'],
      tokenStrategy: tokenStrategyFor({ mode: 'needs_clarification', skills: [], query, combo }),
      warnings,
      clarificationQuestions: clarificationQuestions(query),
    };
    return finalizeRouteSpec(draft, options.graph, { gate });
  }

  const top = rec.matches[0]?.capability;
  const workflow = mergeWorkflow(query, rec, combo, schemas);
  const contextNeeded = mergeStrings(
    combo?.contextNeeded,
    schemas.flatMap(schema => schema.contextNeeded),
    top ? ['Relevant files or page for ' + top.name] : undefined,
  );
  const guardrails = mergeGuardrails(
    combo?.guardrails,
    schemas.flatMap(schema => schema.guardrails),
    catalog.guardrails,
    [{ title: 'Treat this route as advice; keep final execution decisions with the main model or user', strength: 'strict', source: 'fallback' }],
  );
  const verification = mergeVerification(
    combo?.verification,
    schemas.flatMap(schema => schema.verification),
    catalog.verification,
  );
  const doneWhen = mergeStrings(
    combo?.doneWhen,
    schemas.flatMap(schema => schema.doneWhen),
    catalog.doneWhen,
  );

  const draft: RouteSpecDraft = {
    schemaVersion: ROUTE_SPEC_SCHEMA_VERSION,
    query,
    target,
    mode: 'route_plan',
    intent: combo?.title ?? top?.name ?? 'Route task',
    scenario: combo?.description ?? top?.scenario ?? top?.description ?? 'Advisory route plan',
    whyRoute: combo
      ? `Matched built-in combo ${combo.id}; compact routing can reduce context and attach verification.`
      : gate.reason,
    mustCallLazyBrainReason: 'Use LazyBrain when routing skills, agents, verification, or context reduction can materially help.',
    combo: combo?.id,
    entryCommand: combo ? formatComboEntryCommand(combo, target) : undefined,
    executionMode: combo?.executionMode,
    modelStrategy: combo?.modelStrategy,
    skills,
    executionPlan: workflow,
    contextNeeded,
    guardrails,
    verification,
    doneWhen,
    tokenStrategy: tokenStrategyFor({ mode: 'route_plan', skills, query, combo }),
    warnings,
  };

  return finalizeRouteSpec(draft, options.graph, { gate });
}

export function formatRouteSpec(spec: RouteSpec): string {
  const lines = [
    `Route Plan: ${spec.intent}`,
    `Schema: ${spec.schemaVersion}`,
    `Mode: ${spec.mode}`,
    `Scenario: ${spec.scenario}`,
    `Why: ${spec.whyRoute}`,
  ];
  if (spec.combo) lines.push(`Combo: ${spec.combo}`);
  if (spec.entryCommand) lines.push(`Entry command: ${spec.entryCommand}`);
  if (spec.executionMode) lines.push(`Execution mode: ${spec.executionMode}`);
  if (spec.modelStrategy) lines.push(`Model strategy: ${spec.modelStrategy}`);

  lines.push('', 'Choice:');
  lines.push(`  - Recommended: ${spec.choices.recommended.label} [${spec.choices.recommended.kind}, ${Math.round(spec.choices.recommended.confidence * 100)}%]`);
  if (spec.choices.recommended.command) lines.push(`    Command: ${spec.choices.recommended.command}`);
  if (spec.choices.alternatives.length > 0) {
    lines.push('  - Alternatives:');
    for (const choice of spec.choices.alternatives.slice(0, 3)) {
      lines.push(`    - ${choice.label} [${choice.kind}, ${Math.round(choice.confidence * 100)}%]`);
    }
  }
  if (spec.choices.conflicts.length > 0) {
    lines.push('  - Conflict notices:');
    for (const conflict of spec.choices.conflicts.slice(0, 3)) {
      lines.push(`    - ${conflict.group}: ${conflict.reason}`);
    }
  }

  lines.push('', 'Token strategy:');
  lines.push(`  - Top-K skills: ${spec.tokenStrategy.topKSkills}`);
  lines.push(`  - Full skill body: ${spec.tokenStrategy.includeFullSkillBody ? 'yes' : 'no'}`);
  lines.push(`  - Subagents: ${spec.tokenStrategy.suggestSubagents ? 'suggested' : 'not needed by default'}`);
  lines.push(`  - Clarify first: ${spec.tokenStrategy.shouldClarifyFirst ? 'yes' : 'no'}`);
  lines.push(`  - ${spec.tokenStrategy.summary}`);

  if (spec.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of spec.warnings) lines.push(`  - ${warning}`);
  }

  if (spec.clarificationQuestions?.length) {
    lines.push('', 'Clarify first:');
    for (const question of spec.clarificationQuestions) lines.push(`  - ${question}`);
  }

  if (spec.skills.length > 0) {
    lines.push('', 'Use:');
    for (const skill of spec.skills) {
      const status = skill.available ? 'available' : 'missing';
      const score = skill.score !== undefined ? ` ${Math.round(skill.score * 100)}%` : '';
      lines.push(`  - ${skill.name} [${status}${score}]`);
      if (skill.reason) lines.push(`    ${skill.reason}`);
    }
  }

  if (spec.contextNeeded.length > 0) {
    lines.push('', 'Context needed:');
    for (const item of spec.contextNeeded) lines.push(`  - ${item}`);
  }

  if (spec.executionPlan.length > 0) {
    lines.push('', 'Workflow:');
    for (const [index, step] of spec.executionPlan.entries()) {
      lines.push(`  ${index + 1}. ${step.title}`);
      if (step.detail) lines.push(`     ${step.detail}`);
    }
  }

  if (spec.guardrails.length > 0) {
    lines.push('', 'Guardrails:');
    for (const rule of spec.guardrails) lines.push(`  - ${rule.title}${rule.detail ? `: ${rule.detail}` : ''}`);
  }

  if (spec.verification.length > 0) {
    lines.push('', 'Verification:');
    for (const check of spec.verification) lines.push(`  - ${check.title}${check.command ? `: ${check.command}` : ''}`);
  }

  if (spec.doneWhen.length > 0) {
    lines.push('', 'Done when:');
    for (const item of spec.doneWhen) lines.push(`  - ${item}`);
  }

  if (spec.target !== 'generic') {
    lines.push('', `${spec.target} adapter prompt:`);
    lines.push(spec.adapters[spec.target]?.prompt ?? spec.adapters.generic.prompt);
  }

  return lines.join('\n');
}
