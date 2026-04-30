import type { CapabilitySideEffect } from '../types.js';

const SIDE_EFFECTS: readonly CapabilitySideEffect[] = [
  'reads_files',
  'writes_files',
  'executes_commands',
  'network',
  'changes_config',
  'installs_hooks',
  'publishes',
  'destructive',
  'unknown',
];

export function parseCapabilityMetadata(frontmatter: Record<string, unknown>): {
  provider?: string;
  conflictGroup?: string;
  sideEffects?: CapabilitySideEffect[];
} {
  const provider = typeof frontmatter.provider === 'string' && frontmatter.provider.trim()
    ? frontmatter.provider.trim()
    : undefined;
  const conflictGroup = typeof frontmatter.conflictGroup === 'string' && frontmatter.conflictGroup.trim()
    ? frontmatter.conflictGroup.trim()
    : undefined;

  let sideEffects: CapabilitySideEffect[] | undefined;
  const rawSideEffects = frontmatter.sideEffects ?? frontmatter.side_effects;
  if (Array.isArray(rawSideEffects)) {
    sideEffects = rawSideEffects.filter((item): item is CapabilitySideEffect =>
      typeof item === 'string' && SIDE_EFFECTS.includes(item as CapabilitySideEffect));
  } else if (typeof rawSideEffects === 'string') {
    sideEffects = rawSideEffects
      .split(',')
      .map(item => item.trim())
      .filter((item): item is CapabilitySideEffect => SIDE_EFFECTS.includes(item as CapabilitySideEffect));
  }

  return {
    ...(provider ? { provider } : {}),
    ...(conflictGroup ? { conflictGroup } : {}),
    ...(sideEffects?.length ? { sideEffects } : {}),
  };
}
