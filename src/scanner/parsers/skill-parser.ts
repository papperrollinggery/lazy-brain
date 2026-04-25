/**
 * LazyBrain — SKILL.md Parser
 */

import type { RawCapability } from '../../types.js';
import { parseFrontmatter } from '../../utils/yaml.js';
import { inferPlatformFromPath, inferSinglePlatformFromPath } from '../../constants.js';
import { inferOrigin } from '../origin.js';
import { parseSkillSchema } from '../../schema/skill-schema.js';

/**
 * Parse a trigger value that might be a JSON array string or a plain string.
 */
function parseTriggerValue(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === 'string');
      }
    } catch {
      // Not valid JSON, treat as plain string
    }
  }
  return [trimmed];
}

/**
 * Extract first non-heading paragraph from body.
 */
function extractFirstParagraph(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed;
    }
  }
  return '';
}

export function parseSkill(filePath: string, content: string): RawCapability | null {
  const { frontmatter, body } = parseFrontmatter(content);

  const frontmatterName = typeof frontmatter.name === 'string' ? frontmatter.name : '';
  const frontmatterDesc = typeof frontmatter.description === 'string' ? frontmatter.description : '';
  const bodyDescription = extractFirstParagraph(body);

  const hasFrontmatterName = frontmatterName.length > 0;
  const hasFrontmatterDesc = frontmatterDesc.length > 0;
  const hasBodyDesc = bodyDescription.length > 0;

  const parts = filePath.split('/');
  const parentDir = parts[parts.length - 2] || '';
  const hasPathName = parentDir.length > 0;

  let name = hasFrontmatterName ? frontmatterName : (hasPathName ? parentDir : '');
  const description = hasFrontmatterDesc ? frontmatterDesc : bodyDescription;

  if (!name && !description) {
    return null;
  }

  if (!name) {
    name = description.slice(0, 50);
  }

  const origin = inferOrigin(
    filePath,
    typeof frontmatter.origin === 'string' && frontmatter.origin ? frontmatter.origin : undefined,
  );

  let triggers: string[] | undefined;
  if (frontmatter.triggers !== undefined) {
    if (Array.isArray(frontmatter.triggers)) {
      triggers = frontmatter.triggers.filter((t): t is string => typeof t === 'string');
    } else if (typeof frontmatter.triggers === 'string') {
      triggers = parseTriggerValue(frontmatter.triggers);
    }
  } else if (typeof frontmatter.trigger === 'string' && frontmatter.trigger) {
    triggers = parseTriggerValue(frontmatter.trigger);
  }

  return {
    kind: 'skill',
    name,
    description,
    origin,
    filePath,
    triggers,
    compatibility: inferPlatformFromPath(filePath),
    platform: inferSinglePlatformFromPath(filePath),
    schema: parseSkillSchema(frontmatter),
  };
}
