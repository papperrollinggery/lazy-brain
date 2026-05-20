import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAZYBRAIN_DIR } from '../constants.js';
import type { Enhancement, OrchestrationPlan, TaskSignal } from './types.js';
import type { OrchestrationRule } from './rules.js';

interface UserRuleSpec {
  name?: string;
  match?: string;
  skills?: string[];
  confidence?: number;
  sequence?: OrchestrationPlan['sequence'];
}

function text(signal: TaskSignal): string {
  return `${signal.content} ${(signal.context.files_changed ?? []).join(' ')}`.toLowerCase();
}

function strip(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSkills(value: string): string[] {
  const trimmed = strip(value);
  const body = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return body.split(',').map((item) => strip(item).trim()).filter(Boolean);
}

function parseRuleFile(content: string): UserRuleSpec[] {
  const rules: UserRuleSpec[] = [];
  let current: UserRuleSpec | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'rules:') continue;
    const normalized = line.startsWith('- ') ? line.slice(2).trim() : line;
    if (line.startsWith('- ')) {
      if (current) rules.push(current);
      current = {};
    }
    if (!current) continue;
    const colon = normalized.indexOf(':');
    if (colon === -1) continue;
    const key = normalized.slice(0, colon).trim();
    const value = normalized.slice(colon + 1).trim();
    if (key === 'name') current.name = strip(value);
    if (key === 'match') current.match = strip(value);
    if (key === 'skills') current.skills = parseSkills(value);
    if (key === 'confidence') current.confidence = Number(value);
    if (key === 'sequence') current.sequence = strip(value) === 'parallel' ? 'parallel' : 'sequential';
  }
  if (current) rules.push(current);
  return rules;
}

function enhancement(name: string, index: number, reason: string): Enhancement {
  return { type: 'skill', name, priority: index + 1, reason };
}

function toRule(spec: UserRuleSpec): OrchestrationRule | null {
  if (!spec.name || !spec.match || !spec.skills?.length) return null;
  let pattern: RegExp;
  try {
    pattern = new RegExp(spec.match, 'i');
  } catch {
    return null;
  }
  const confidence = Math.max(0.1, Math.min(0.99, Number.isFinite(spec.confidence) ? spec.confidence ?? 0.85 : 0.85));
  return {
    name: spec.name,
    description: 'User rule from ~/.lazybrain/rules.yaml',
    confidence,
    match: (signal) => pattern.test(text(signal)),
    plan: (signal) => ({
      trigger: signal,
      enhancements: spec.skills!.map((name, index) => enhancement(name, index, `user rule: ${spec.name}`)),
      sequence: spec.sequence ?? 'sequential',
      confidence,
      reason: `user rule matched: ${spec.name}`,
      autoActivate: false,
    }),
  };
}

export function loadUserRules(path = join(LAZYBRAIN_DIR, 'rules.yaml')): OrchestrationRule[] {
  if (!existsSync(path)) return [];
  try {
    return parseRuleFile(readFileSync(path, 'utf-8'))
      .map(toRule)
      .filter((rule): rule is OrchestrationRule => rule !== null);
  } catch {
    return [];
  }
}

export function userRuleTemplate(): string {
  return [
    'rules:',
    '  - name: my-deploy-flow',
    '    match: "deploy|ship|release"',
    '    skills: [security-review, tdd-workflow, ship]',
    '    confidence: 0.9',
    '    sequence: sequential',
  ].join('\n');
}
