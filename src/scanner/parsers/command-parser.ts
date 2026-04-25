/**
 * LazyBrain — Command .md Parser
 */

import type { RawCapability } from '../../types.js';
import { parseFrontmatter } from '../../utils/yaml.js';
import { inferPlatformFromPath, inferSinglePlatformFromPath } from '../../constants.js';
import { inferOrigin } from '../origin.js';

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

export function parseCommand(filePath: string, content: string): RawCapability | null {
  const { frontmatter, body } = parseFrontmatter(content);

  let name: string;
  if (typeof frontmatter.name === 'string' && frontmatter.name) {
    name = frontmatter.name;
  } else {
    const basename = filePath.split('/').pop() || '';
    name = basename.replace(/\.md$/, '');
  }

  let description: string;
  if (typeof frontmatter.description === 'string' && frontmatter.description) {
    description = frontmatter.description;
  } else {
    description = extractFirstParagraph(body);
  }

  if (!name && !description) {
    return null;
  }

  if (!name) name = description.slice(0, 50);

  return {
    kind: 'command',
    name,
    description,
    origin: inferOrigin(
      filePath,
      typeof frontmatter.origin === 'string' && frontmatter.origin ? frontmatter.origin : undefined,
    ),
    filePath,
    compatibility: inferPlatformFromPath(filePath),
    platform: inferSinglePlatformFromPath(filePath),
  };
}
