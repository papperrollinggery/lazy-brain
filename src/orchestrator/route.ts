/**
 * LazyBrain — Route Plan Orchestrator
 *
 * Converts match results into an advisory execution plan. It never executes
 * skills and never writes Claude/Codex/Cursor configuration.
 */

import type {
  Capability,
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
import { findCombo, type ComboTemplate } from '../combos/registry.js';
import { getVerificationBundle } from '../verification/catalog.js';
import { classifyRouteNeed } from './route-gate.js';

export interface BuildRouteSpecOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  profile?: UserProfile;
  target?: RouteTarget;
}

const TARGETS: RouteTarget[] = ['generic', 'claude', 'codex', 'cursor'];
export const ROUTE_SPEC_SCHEMA_VERSION = '1.4.5';

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

export async function buildRouteSpec(query: string, options: BuildRouteSpecOptions): Promise<RouteSpec> {
  const target = options.target ?? 'generic';
  const gate = classifyRouteNeed(query);
  if (gate.mode === 'no_route_needed') {
    const partial: Omit<RouteSpec, 'adapters'> = {
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
    return { ...partial, adapters: buildAdapters(partial) };
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
    const partial: Omit<RouteSpec, 'adapters'> = {
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
    return { ...partial, adapters: buildAdapters(partial) };
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

  const partial: Omit<RouteSpec, 'adapters'> = {
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
    skills,
    executionPlan: workflow,
    contextNeeded,
    guardrails,
    verification,
    doneWhen,
    tokenStrategy: tokenStrategyFor({ mode: 'route_plan', skills, query, combo }),
    warnings,
  };

  return { ...partial, adapters: buildAdapters(partial) };
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
