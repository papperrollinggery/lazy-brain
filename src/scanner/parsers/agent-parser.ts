/**
 * LazyBrain — Agent .md Parser
 */

import type { RawCapability } from '../../types.js';
import { parseFrontmatter } from '../../utils/yaml.js';
import { inferPlatformFromPath, inferSinglePlatformFromPath } from '../../constants.js';
import { inferOrigin } from '../origin.js';
import { parseCapabilityMetadata } from '../metadata.js';

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

export function parseAgent(filePath: string, content: string): RawCapability | null {
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

  const origin = inferOrigin(
    filePath,
    typeof frontmatter.origin === 'string' && frontmatter.origin ? frontmatter.origin : undefined,
  );

  return {
    kind: 'agent',
    name,
    description,
    origin,
    ...parseCapabilityMetadata(frontmatter),
    filePath,
    compatibility: inferPlatformFromPath(filePath),
    platform: inferSinglePlatformFromPath(filePath),
    discovery: filePath.includes('/plugins/cache/') ? 'plugin-cache' : 'local-file',
  };
}

/** Parse Codex role metadata without interpreting the agent's instructions. */
export function parseCodexAgentMetadata(filePath: string, content: string): RawCapability | null {
  const name = content.match(/^\s*name\s*=\s*"([^"]+)"\s*$/m)?.[1] ?? filePath.split('/').pop()?.replace(/\.toml$/, '');
  if (!name) return null;
  const description = content.match(/^\s*description\s*=\s*"([^"]*)"\s*$/m)?.[1] ?? `Codex agent role ${name}`;
  return { kind: 'agent', name, description, origin: 'codex-agent-metadata', filePath, compatibility: ['codex'], platform: 'codex', discovery: 'local-file' };
}
