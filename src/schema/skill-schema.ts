/**
 * LazyBrain — Skill Schema Frontmatter Parser
 *
 * Keeps orchestration metadata as optional frontmatter on SKILL.md.
 * This parser is intentionally forgiving: bad fields are ignored and surfaced
 * as schema warnings instead of breaking legacy skill parsing.
 */

import type {
  GuardrailRule,
  SkillSchema,
  VerificationRequirement,
  WorkflowStep,
} from '../types.js';

const SCHEMA_KEYS = [
  'useWhen',
  'avoidWhen',
  'inputs',
  'workflow',
  'verification',
  'doneWhen',
  'contextNeeded',
  'guardrails',
];

function hasSchemaKey(frontmatter: Record<string, unknown>): boolean {
  return SCHEMA_KEYS.some(key => frontmatter[key] !== undefined);
}

function parseJsonLike(value: string, key: string, warnings: string[]): unknown {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      warnings.push(`${key}: invalid JSON frontmatter value`);
      return undefined;
    }
  }
  return value;
}

function toArray(value: unknown, key: string, warnings: string[]): unknown[] {
  if (value === undefined) return [];
  const parsed = typeof value === 'string' ? parseJsonLike(value, key, warnings) : value;
  if (parsed === undefined) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'string') return [parsed];
  warnings.push(`${key}: expected string or array`);
  return [];
}

function toStringList(value: unknown, key: string, warnings: string[]): string[] {
  return toArray(value, key, warnings)
    .filter((item): item is string => {
      const ok = typeof item === 'string' && item.trim().length > 0;
      if (!ok) warnings.push(`${key}: ignored non-string item`);
      return ok;
    })
    .map(item => item.trim());
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toWorkflow(value: unknown, warnings: string[]): WorkflowStep[] {
  return toArray(value, 'workflow', warnings)
    .map((item, index): WorkflowStep | null => {
      if (typeof item === 'string' && item.trim()) {
        return { title: item.trim(), source: 'schema' };
      }
      const obj = toObject(item);
      if (!obj) {
        warnings.push('workflow: ignored invalid item');
        return null;
      }
      const title = toString(obj.title) ?? toString(obj.name) ?? toString(obj.step);
      if (!title) {
        warnings.push('workflow: ignored item without title');
        return null;
      }
      return {
        id: toString(obj.id) ?? `schema-step-${index + 1}`,
        title,
        detail: toString(obj.detail) ?? toString(obj.description),
        source: 'schema',
      };
    })
    .filter((item): item is WorkflowStep => item !== null);
}

function toVerification(value: unknown, warnings: string[]): VerificationRequirement[] {
  return toArray(value, 'verification', warnings)
    .map((item, index): VerificationRequirement | null => {
      if (typeof item === 'string' && item.trim()) {
        return { title: item.trim(), required: true, source: 'schema' };
      }
      const obj = toObject(item);
      if (!obj) {
        warnings.push('verification: ignored invalid item');
        return null;
      }
      const title = toString(obj.title) ?? toString(obj.name) ?? toString(obj.check);
      if (!title) {
        warnings.push('verification: ignored item without title');
        return null;
      }
      return {
        id: toString(obj.id) ?? `schema-check-${index + 1}`,
        title,
        detail: toString(obj.detail) ?? toString(obj.description),
        command: toString(obj.command),
        required: typeof obj.required === 'boolean' ? obj.required : true,
        source: 'schema',
      };
    })
    .filter((item): item is VerificationRequirement => item !== null);
}

function toGuardrails(value: unknown, warnings: string[]): GuardrailRule[] {
  return toArray(value, 'guardrails', warnings)
    .map((item): GuardrailRule | null => {
      if (typeof item === 'string' && item.trim()) {
        return { title: item.trim(), strength: 'normal', source: 'schema' };
      }
      const obj = toObject(item);
      if (!obj) {
        warnings.push('guardrails: ignored invalid item');
        return null;
      }
      const title = toString(obj.title) ?? toString(obj.name) ?? toString(obj.rule);
      if (!title) {
        warnings.push('guardrails: ignored item without title');
        return null;
      }
      const strength = obj.strength === 'light' || obj.strength === 'strict' ? obj.strength : 'normal';
      return {
        title,
        detail: toString(obj.detail) ?? toString(obj.description),
        strength,
        source: 'schema',
      };
    })
    .filter((item): item is GuardrailRule => item !== null);
}

export function emptySkillSchema(): SkillSchema {
  return {
    useWhen: [],
    avoidWhen: [],
    inputs: [],
    workflow: [],
    verification: [],
    doneWhen: [],
    contextNeeded: [],
    guardrails: [],
  };
}

export function parseSkillSchema(frontmatter: Record<string, unknown>): SkillSchema | undefined {
  if (!hasSchemaKey(frontmatter)) return undefined;

  const warnings: string[] = [];
  const schema: SkillSchema = {
    useWhen: toStringList(frontmatter.useWhen, 'useWhen', warnings),
    avoidWhen: toStringList(frontmatter.avoidWhen, 'avoidWhen', warnings),
    inputs: toStringList(frontmatter.inputs, 'inputs', warnings),
    workflow: toWorkflow(frontmatter.workflow, warnings),
    verification: toVerification(frontmatter.verification, warnings),
    doneWhen: toStringList(frontmatter.doneWhen, 'doneWhen', warnings),
    contextNeeded: toStringList(frontmatter.contextNeeded, 'contextNeeded', warnings),
    guardrails: toGuardrails(frontmatter.guardrails, warnings),
  };

  if (warnings.length > 0) schema.warnings = warnings;
  return schema;
}
