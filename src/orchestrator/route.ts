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

export interface BuildRouteSpecOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  profile?: UserProfile;
  target?: RouteTarget;
}

const TARGETS: RouteTarget[] = ['generic', 'claude', 'codex', 'cursor'];

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
    reason: reason ?? result?.explanation ?? cap.scenario ?? cap.description,
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
  ];

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
  if (isVagueQuery(query)) return true;
  if (rec.matches.length === 0) return true;
  return (rec.matches[0]?.score ?? 0) < 0.22;
}

export async function buildRouteSpec(query: string, options: BuildRouteSpecOptions): Promise<RouteSpec> {
  const target = options.target ?? 'generic';
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
      query,
      target,
      mode: 'needs_clarification',
      intent: 'Clarify task before routing',
      scenario: 'The request is too broad or low-confidence for a reliable skill chain.',
      skills: [],
      executionPlan: [],
      contextNeeded: [],
      guardrails: [
        { title: 'Ask for the missing task surface before recommending a skill chain', strength: 'strict', source: 'fallback' },
      ],
      verification: [],
      doneWhen: ['The user or main model has clarified the target output and verification method.'],
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
    query,
    target,
    mode: 'route_plan',
    intent: combo?.title ?? top?.name ?? 'Route task',
    scenario: combo?.description ?? top?.scenario ?? top?.description ?? 'Advisory route plan',
    combo: combo?.id,
    skills,
    executionPlan: workflow,
    contextNeeded,
    guardrails,
    verification,
    doneWhen,
    warnings,
  };

  return { ...partial, adapters: buildAdapters(partial) };
}

export function formatRouteSpec(spec: RouteSpec): string {
  const lines = [
    `Route Plan: ${spec.intent}`,
    `Mode: ${spec.mode}`,
    `Scenario: ${spec.scenario}`,
  ];
  if (spec.combo) lines.push(`Combo: ${spec.combo}`);

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
